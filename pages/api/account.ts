import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { sortableId } from "@/lib/crypto";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import crypto from "crypto";
import { checkPin, pinHash } from "@/lib/prefs";
import { notify } from "@/lib/notify";
import { getSettings } from "@/lib/settings";
import { getEmail, sendCode, checkCode, requireEmailCode, mailUser, EMAIL_RE, Purpose, Details } from "@/lib/emailcode";
import { reqCtx, ctxRows } from "@/lib/reqctx";
import { secLog } from "@/lib/seclog";
import { mailReady } from "@/lib/mailer";
import { deviceHash } from "@/lib/devices";

const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);

/** Settings: Withdraw PIN ও Saved addresses (user_prefs/{uid}) */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "account", 30);
  await ensureUser(user, { soft: true });
  const action = String(req.body?.action || "get");
  const base = `user_prefs/${user.id}`;

  const eh = (a: string) => crypto.createHash("sha256").update(a.toLowerCase()).digest("hex").slice(0, 32);
  const ctx = reqCtx(req);
  const detailsOf = (): Details => {
    const d = (req.body?.details || {}) as any;
    const amount = Number(d.amount);
    return { amount: Number.isFinite(amount) && amount > 0 && amount < 1e12 ? amount : undefined, asset: clean(d.asset, 12), network: clean(d.network, 40), address: clean(d.address, 100).replace(/\s/g, ""), label: clean(d.label, 20) };
  };
  if (action === "codeSend") {
    const purpose = String(req.body?.purpose || "") as Purpose;
    if (!["withdraw", "send", "pin", "address", "email"].includes(purpose)) throw new HttpError(400, "bad_request");
    const e = await getEmail(user.id);
    if (!e?.verified) throw new HttpError(403, "email_required");
    const d = detailsOf();
    if ((purpose === "withdraw" || purpose === "send") && (!d.address || !d.amount)) throw new HttpError(400, "bad_request");
    if (purpose === "address" && !d.address) throw new HttpError(400, "bad_request");
    await sendCode(user.id, purpose, e.addr, ctx, d);
  } else if (action === "emailSend") {
    const s0 = await getSettings();
    if (!s0.email_enabled) throw new HttpError(403, "email_unavailable");
    const email = clean(req.body?.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "bad_email");
    const cur = await getEmail(user.id);
    if (cur?.verified) await checkCode(user.id, "email", req.body?.email_code, cur.addr); // বর্তমান মেইলে যাওয়া কোড লাগে
    const owner = (await db().ref(`email_index/${eh(email)}`).get()).val();
    if (owner && owner !== user.id) throw new HttpError(409, "email_taken");
    await sendCode(user.id, "verify", email, ctx);
  } else if (action === "emailConfirm") {
    const email = clean(req.body?.email, 254).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "bad_email");
    await checkCode(user.id, "verify", req.body?.code, email);
    const claim = await db().ref(`email_index/${eh(email)}`).transaction((c) => (c === null || c === user.id ? user.id : undefined));
    if (!claim.committed) throw new HttpError(409, "email_taken");
    const old = await getEmail(user.id);
    const up: Record<string, any> = { [`${base}/email`]: { addr: email, verified: true, at: Date.now() } };
    if (old && old.addr !== email) up[`email_index/${eh(old.addr)}`] = null;
    await db().ref().update(up);
    await notify(user.id, "✉️ Your email was verified.");
    await secLog(user.id, old && old.addr !== email ? "email_changed" : "email_verified", ctx, email);
    if (old && old.addr !== email) await mailUser(user.id, "[TFUEL] Your email was changed", { title: "Your account email was changed", intro: `The email on your TFUEL account was changed to ${email}. This message was sent to the previous address.`, tone: "danger", rows: ctxRows(ctx), warning: "If this wasn't you, contact support immediately." }).catch(() => {});
  } else if (action === "setPin") {
    const pin = String(req.body?.pin || "");
    if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, "bad_pin");
    await checkPin(user.id, req.body?.current);
    await requireEmailCode(user.id, "pin", req.body?.email_code); // আগে থেকে PIN থাকলে বর্তমানটা লাগবে
    await db().ref(`${base}/pin`).set({ h: pinHash(user.id, pin), fails: 0, set_at: Date.now() });
    await secLog(user.id, "pin_changed", ctx);
    await mailUser(user.id, "[TFUEL] Your Withdraw PIN was changed", { title: "Your Withdraw PIN was changed", intro: "Your Withdraw PIN was just set or changed.", tone: "warn", rows: ctxRows(ctx), warning: "If this wasn't you, contact support immediately." });
  } else if (action === "removePin") {
    await checkPin(user.id, req.body?.current);
    await requireEmailCode(user.id, "pin", req.body?.email_code);
    await db().ref(`${base}/pin`).remove();
    await secLog(user.id, "pin_removed", ctx);
  } else if (action === "addAddr") {
    const label = clean(req.body?.label, 20);
    const address = clean(req.body?.address, 100).replace(/\s/g, "");
    if (!label || address.length < 6) throw new HttpError(400, "bad_address");
    await requireEmailCode(user.id, "address", req.body?.email_code, { address, label });
    const cur = ((await db().ref(`${base}/addrs`).get()).val() || {}) as Record<string, any>;
    if (Object.keys(cur).length >= 10) throw new HttpError(400, "too_many_addrs");
    await db().ref(`${base}/addrs/${sortableId()}`).set({ label, address, added_at: Date.now() });
    await secLog(user.id, "addr_added", ctx, `${label} · ${address.slice(0, 6)}…${address.slice(-4)}`);
  } else if (action === "delAddr") {
    const id = String(req.body?.id || "");
    if (!/^[\w-]{1,40}$/.test(id)) throw new HttpError(400, "bad_request");
    await db().ref(`${base}/addrs/${id}`).remove();
    await secLog(user.id, "addr_removed", ctx);
  } else if (action === "setCur") {
    const c = String(req.body?.cur || "");
    if (c !== "tfuel" && c !== "usdt") throw new HttpError(400, "bad_request");
    await db().ref(`${base}/cur`).set(c);
  } else if (action === "setMailMoney") {
    await db().ref(`${base}/mail_money`).set(!!req.body?.on);
  } else if (action === "setRemind") {
    const on = !!req.body?.on;
    await db().ref().update({ [`${base}/remind_daily`]: on, [`remind_users/${user.id}`]: on ? true : null });
  } else if (action === "favAddr") {
    const id = String(req.body?.id || "");
    if (!/^[\w-]{1,40}$/.test(id)) throw new HttpError(400, "bad_request");
    if (!(await db().ref(`${base}/addrs/${id}`).get()).exists()) throw new HttpError(404, "not_found");
    await db().ref(`${base}/addrs/${id}/fav`).set(req.body?.on ? true : null);
  } else if (action === "setLoginAlert") {
    await db().ref(`${base}/login_alert`).set(!!req.body?.on);
  } else if (action === "delDevice") {
    const id = String(req.body?.id || "");
    if (!/^[\w-]{1,40}$/.test(id)) throw new HttpError(400, "bad_request");
    await db().ref(`${base}/devices/${id}`).remove();
    await secLog(user.id, "device_removed", ctx);
  } else if (action === "revokeOthers") {
    // সীমা: Telegram নিজেই সাইন-ইন করায়, তাই এটা সত্যিকারের "লগআউট" নয় — অন্য ডিভাইসগুলো তালিকা থেকে মুছে sess_epoch বাড়ে;
    // ওই ডিভাইস আবার খুললে "নতুন ডিভাইস" সতর্কতা যায়। আসল বন্ধ করতে Telegram-এর Settings → Devices থেকে session শেষ করতে হয়।
    const me = deviceHash(req);
    const devs = ((await db().ref(`${base}/devices`).get()).val() || {}) as Record<string, any>;
    const up: Record<string, any> = {};
    for (const k of Object.keys(devs)) if (k !== me) up[`${base}/devices/${k}`] = null;
    up[`${base}/sess_epoch`] = Date.now();
    await db().ref().update(up);
    await secLog(user.id, "devices_revoked", ctx);
    await notify(user.id, "🔒 Other devices were removed from your account list. If you didn't do this, set a Withdraw PIN and contact support.");
  } else if (action === "setPrefs") {
    const b = req.body || {};
    const up: Record<string, any> = {};
    if (b.nick !== undefined) {
      const n = clean(b.nick, 16).replace(/[<>@]/g, "");
      if (n && n.length < 2) throw new HttpError(400, "bad_nick");
      up[`${base}/nick`] = n || null;
    }
    if (b.lb_hide !== undefined) up[`${base}/lb_hide`] = b.lb_hide ? true : null;
    if (b.wl_only !== undefined) up[`${base}/wl_only`] = b.wl_only ? true : null;
    if (b.def_net !== undefined) up[`${base}/def_net`] = clean(b.def_net, 40) || null;
    if (b.sum_daily !== undefined) {
      const on = !!b.sum_daily;
      up[`${base}/sum_daily`] = on ? true : null;
      up[`summary_users/${user.id}`] = on ? true : null;
    }
    if (b.notif && typeof b.notif === "object") for (const k of ["money", "rewards", "tasks", "news"]) if (b.notif[k] !== undefined) up[`${base}/notif/${k}`] = b.notif[k] ? null : false;
    if (b.quiet && typeof b.quiet === "object") {
      const hr = (v: any) => Math.min(23, Math.max(0, Math.floor(Number(v) || 0)));
      const tz = Math.min(840, Math.max(-720, Math.round(Number(b.quiet.tz) || 0)));
      up[`${base}/quiet`] = b.quiet.on ? { on: true, from: hr(b.quiet.from), to: hr(b.quiet.to), tz } : null;
    }
    if (!Object.keys(up).length) throw new HttpError(400, "bad_request");
    await db().ref().update(up);
  } else if (action === "setEnergyMsg") {
    const on = !!req.body?.on;
    await db().ref().update({ [`${base}/energy_msg`]: on, [`energy_users/${user.id}`]: on ? true : null });
  } else if (action === "pinResetRequest") {
    // PIN ভুলে গেলে: শুধু verified email-এ ৬ ডিজিটের কোড (Telegram-এ কখনও নয়)
    if (!(await db().ref(`${base}/pin`).get()).exists()) throw new HttpError(400, "no_pin");
    const e = await getEmail(user.id);
    if (!e?.verified) throw new HttpError(403, "email_required");
    await sendCode(user.id, "pinreset", e.addr, ctx);
  } else if (action === "pinResetConfirm") {
    const pin = String(req.body?.pin || "");
    if (!/^\d{4,6}$/.test(pin)) throw new HttpError(400, "bad_pin");
    const e = await getEmail(user.id);
    if (!e?.verified) throw new HttpError(403, "email_required");
    await checkCode(user.id, "pinreset", req.body?.code, e.addr);
    await db().ref(`${base}/pin`).set({ h: pinHash(user.id, pin), fails: 0, set_at: Date.now() });
    await notify(user.id, "🔐 Your withdraw PIN was reset.");
    await secLog(user.id, "pin_reset", ctx);
    await mailUser(user.id, "[TFUEL] Your Withdraw PIN was reset", { title: "Your Withdraw PIN was reset", intro: "Your Withdraw PIN was just reset using a code sent to this email.", tone: "danger", rows: ctxRows(ctx), warning: "If this wasn't you, contact support immediately." });
  } else if (action !== "get") throw new HttpError(400, "bad_request");

  const p = ((await db().ref(base).get()).val() || {}) as any;
  const s = await getSettings();
  res.json({
    success: true,
    email: { enabled: s.email_enabled && mailReady(), required: s.email_required, addr: p.email?.verified ? p.email.addr : "", whitelist: s.withdraw_whitelist_only, cooldown_h: s.addr_cooldown_hours, money: s.email_money },
    pin: !!p.pin,
    pin_locked: (p.pin?.lock_until || 0) > Date.now(),
    cur: p.cur === "usdt" || p.cur === "tfuel" ? p.cur : null,
    login_alert: p.login_alert !== false,
    mail_money: p.mail_money !== false,
    remind_daily: !!p.remind_daily,
    energy_msg: !!p.energy_msg,
    bdt: s.bdt_rate > 0,
    prefs: { nick: p.nick || "", lb_hide: !!p.lb_hide, wl_only: !!p.wl_only, def_net: p.def_net || "", sum_daily: !!p.sum_daily, notif: { money: p.notif?.money !== false, rewards: p.notif?.rewards !== false, tasks: p.notif?.tasks !== false, news: p.notif?.news !== false }, quiet: p.quiet || null },
    devices: Object.entries((p.devices || {}) as Record<string, any>).sort(([, a]: any, [, b]: any) => b.last - a.last).slice(0, 9).map(([id, d]: any) => ({ id, label: d.label, last: d.last, first: d.first, current: id === deviceHash(req) })),
    addrs: Object.entries((p.addrs || {}) as Record<string, any>).map(([id, a]) => ({ id, label: a.label, address: a.address, added_at: a.added_at || 0, fav: !!a.fav })),
  });
});

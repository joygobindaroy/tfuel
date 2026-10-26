import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { checkPin } from "@/lib/prefs";
import { requireEmailCode, getEmail, sendCode, checkCode } from "@/lib/emailcode";
import { getRefCode } from "@/lib/refcode";
import { sendAsset, sendQuota, displayName, Asset, feeFor, minFor, cancelHold, amtStr } from "@/lib/transfer";
import { assertCanMoveMoney } from "@/lib/freeze";
import { secLog } from "@/lib/seclog";
import { reqCtx } from "@/lib/reqctx";
import { getCfg2 } from "@/lib/cfg2";
import { toU, fromU } from "@/lib/market";
import { vipPerks } from "@/lib/vip";
import { schedCreate, schedList, schedCancel, recentPeople, spendReport, disputeTransfer } from "@/lib/plus";
import { createRequest, getRequest, reqHold, reqDone, cancelRequest, listRequests, createLink, peekLink, claimLink, cancelLink, listLinks, listXfers, listContacts, saveContact, deleteContact } from "@/lib/xlink";

/** Send money (user → user) in TFUEL or USDT: info / lookup / prepare / send, payment requests, money links, history, contacts */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "send", 40);
  const { u, settings: s } = await ensureUser(user);
  const b = req.body || {};
  const action = String(b.action || "info");
  const cpt = s.coins_per_tfuel;
  const c2 = await getCfg2();
  const reqId = String(b.req || "");
  const mode: "person" | "request" | "link" | "sched" = reqId ? "request" : b.mode === "link" ? "link" : b.mode === "sched" ? "sched" : "person";
  let asset: Asset = b.asset === "usdt" ? "usdt" : "tfuel";

  const lookup = async (code: string) => {
    if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new HttpError(400, "send_bad_code");
    const uid = (await db().ref(`ref_codes/${code}`).get()).val();
    if (typeof uid !== "string" || uid === user.id) throw new HttpError(404, "send_no_user");
    const nm = (await db().ref(`users/${uid}/name`).get()).val();
    if (nm === null) throw new HttpError(404, "send_no_user");
    return { uid, name: await displayName(uid) };
  };
  const maskEmail = (e: string) => { const [a, d] = e.split("@"); return `${a.slice(0, 2)}•••@${d}`; };
  const unit = (a: Asset) => (a === "usdt" ? 1e6 : cpt);
  const parseAmount = (v: unknown, a: Asset) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x <= 0) throw new HttpError(400, "send_min");
    return Math.round(x * unit(a));
  };
  const enabled = (a: Asset) => (a === "usdt" ? c2.xfer.usdt.enabled : s.send_enabled);
  const balanceOf = (a: Asset) => (a === "usdt" ? u.usdt_u || 0 : u.balance || 0);

  /** who/what is being paid: a typed ID, a payment request, or nobody (money link) */
  const resolve = async () => {
    if (mode === "request") {
      const r = await getRequest(reqId);
      if (r.st !== "open") throw new HttpError(409, "request_closed");
      if (r.to === user.id) throw new HttpError(400, "send_self");
      asset = r.asset;
      return { toUid: r.to, code: r.code, name: r.name, amount: r.amount, note: r.note };
    }
    if (mode === "link") return { toUid: "", code: "LINK", name: "Anyone with the link", amount: parseAmount(b.amount, asset), note: String(b.note || "") };
    const code = String(b.code || "").trim();
    const r = await lookup(code);
    return { toUid: r.uid, code, name: r.name, amount: parseAmount(b.amount, asset), note: String(b.note || "") };
  };
  const bindAddr = (code: string) => (asset === "usdt" ? `${code}_usdt` : code);
  const shown = (amt: number) => (asset === "usdt" ? fromU(amt) : amt / cpt);

  if (action === "lookup") {
    const r = await lookup(String(b.code || "").trim());
    return void res.json({ success: true, name: r.name });
  }
  if (action === "prepare") {
    const t = await resolve();
    if (!enabled(asset)) throw new HttpError(403, "send_disabled");
    if (mode === "link" && !c2.xfer.links.claim) throw new HttpError(403, "feature_off");
    if (mode === "sched" && !c2.plus.sched.enabled) throw new HttpError(403, "feature_off");
    if (t.amount < (await minFor(asset, s))) throw new HttpError(400, "send_min");
    const { fee } = await feeFor(user.id, asset, t.amount, s);
    const total = t.amount + fee;
    await assertCanMoveMoney(user.id, s);
    if (balanceOf(asset) < total) throw new HttpError(409, asset === "usdt" ? "insufficient_usdt" : "insufficient");
    if (s.send_min_age_hours > 0 && u.created_at && Date.now() < u.created_at + s.send_min_age_hours * 3600000) throw new HttpError(403, "send_too_new");
    const q = await sendQuota(user.id, s, asset);
    if (q.left !== null && total > q.left) throw new HttpError(429, "send_limit");
    await checkPin(user.id, b.pin);
    const e = await getEmail(user.id);
    if (s.email_required && !e?.verified) throw new HttpError(403, "email_required");
    if (!e?.verified) return void res.json({ success: true, step: "ready" });
    await sendCode(user.id, "send", e.addr, reqCtx(req), { amount: shown(t.amount), asset: asset === "usdt" ? "USDT" : "TFUEL", address: bindAddr(t.code), label: t.name });
    return void res.json({ success: true, step: "code", email: maskEmail(e.addr) });
  }
  if (action === "send") {
    const t = await resolve();
    if (!enabled(asset)) throw new HttpError(403, "send_disabled");
    await checkPin(user.id, b.pin);
    const em = await getEmail(user.id);
    const det = { address: bindAddr(t.code), amount: shown(t.amount) };
    if (em?.verified) await checkCode(user.id, "send", b.email_code, em.addr, det);
    else await requireEmailCode(user.id, "send", b.email_code, det);
    const note = String(t.note || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60);
    const me = { id: user.id, name: String(u.name || user.first_name || "User") };
    if (mode === "sched") {
      const r = await schedCreate(me, { uid: t.toUid, name: t.name, code: t.code }, asset, t.amount, note, Number(b.when), String(b.repeat || ""));
      await secLog(user.id, "withdraw_request", reqCtx(req), `schedule ${shown(t.amount)} ${asset}`).catch(() => {});
      return void res.json({ success: true, sched: { id: r.id, next: r.next, amount: t.amount, asset, to: t.name, repeat: String(b.repeat || "") } });
    }
    if (mode === "link") {
      const L = await createLink(me, asset, t.amount, note, s, { pass: String(b.pass || ""), hours: Number(b.hours) });
      await secLog(user.id, "withdraw_request", reqCtx(req), `link ${shown(t.amount)} ${asset}`).catch(() => {});
      return void res.json({ success: true, link: { url: L.url, exp: L.exp, amount: t.amount, fee: L.fee, asset } });
    }
    let out;
    if (mode === "request") {
      await reqHold(reqId, user.id);
      try { out = await sendAsset(me, t.toUid, asset, t.amount, s, note || t.note); }
      catch (e) { await reqDone(reqId, false, "", user.id); throw e; }
      await reqDone(reqId, true, out.txid, user.id);
    } else out = await sendAsset(me, t.toUid, asset, t.amount, s, note);
    await secLog(user.id, "withdraw_request", reqCtx(req), `send ${shown(t.amount)} ${asset}`).catch(() => {});
    let rc: { page: string; img: string } | null = null;
    if (!out.held) { try { const R = await import("@/lib/receipt"); rc = R.receiptLinks(await R.loadReceipt(out.txid, user.id), user.id, cpt); } catch {} }
    return void res.json({ success: true, fee: out.fee, balance: out.balance, rc, tx: { id: out.id, txid: out.txid, at: out.at, amount: t.amount, fee: out.fee, to: out.to, asset, held: !!out.held, release_at: out.release_at || 0 } });
  }

  // ── history, contacts, requests, links ──
  if (action === "recent") return void res.json({ success: true, items: await recentPeople(user.id) });
  if (action === "report") return void res.json({ success: true, ...(await spendReport(user.id, Number(b.offset) || 0, cpt)) });
  if (action === "dispute") { const id = await disputeTransfer(user.id, String(u.name || user.first_name || "User"), String(b.id || ""), String(b.reason || "")); return void res.json({ success: true, ticket: id }); }
  if (action === "safe") {
    const h = Number(b.hours) > 0 ? Math.min(168, Math.floor(Number(b.hours))) : 0;
    await db().ref(`user_prefs/${user.id}/safe_until`).set(h ? Date.now() + h * 3600000 : null);
    return void res.json({ success: true, safe_until: h ? Date.now() + h * 3600000 : 0 });
  }
  if (action === "sched_list") return void res.json({ success: true, items: await schedList(user.id) });
  if (action === "sched_cancel") { await schedCancel(user.id, String(b.id || "")); return void res.json({ success: true, items: await schedList(user.id) }); }
  if (action === "history") return void res.json({ success: true, items: await listXfers(user.id, 120) });
  if (action === "cancel") { await cancelHold(user.id, String(b.id || "")); return void res.json({ success: true }); }
  if (action === "contacts") return void res.json({ success: true, items: await listContacts(user.id) });
  if (action === "contact_save") { await saveContact(user.id, String(b.code || "").trim(), String(b.label || "")); return void res.json({ success: true, items: await listContacts(user.id) }); }
  if (action === "contact_del") { await deleteContact(user.id, String(b.code || "").trim()); return void res.json({ success: true, items: await listContacts(user.id) }); }
  if (action === "req_create") {
    const r = await createRequest(user.id, asset, parseAmount(b.amount, asset), String(b.note || ""), s, Number(b.split) || 1);
    return void res.json({ success: true, ...r });
  }
  if (action === "req_list") return void res.json({ success: true, items: await listRequests(user.id, s) });
  if (action === "req_cancel") { await cancelRequest(user.id, String(b.id || "")); return void res.json({ success: true, items: await listRequests(user.id, s) }); }
  if (action === "req_info") {
    const r = await getRequest(reqId || String(b.id || ""));
    return void res.json({ success: true, req: { id: r.id, name: r.name, code: r.code, asset: r.asset, amount: r.amount, note: r.note, st: r.st, mine: r.to === user.id, n: (r as any).n || 1, paid: (r as any).paid || 0, paid_by_me: !!(r as any).payers?.[user.id] } });
  }
  if (action === "link_list") return void res.json({ success: true, items: await listLinks(user.id, s) });
  if (action === "link_cancel") { await cancelLink(user.id, String(b.id || "")); return void res.json({ success: true, items: await listLinks(user.id, s) }); }
  if (action === "claim_info") return void res.json({ success: true, link: await peekLink(String(b.token || "")) });
  if (action === "claim") {
    await rateLimit(user.id, "claim", 10);
    const r = await claimLink(user.id, String(b.token || ""), s, String(b.pass || ""));
    return void res.json({ success: true, ...r });
  }

  // ── received list (TFUEL + USDT) ──
  if (action === "received") {
    const items = (await listXfers(user.id, 40)).filter((x: any) => x.d === "in").slice(0, 15).map((x: any) => ({ id: x.id, c: x.a === "tfuel" ? x.amt : 0, u: x.a === "usdt" ? x.amt : 0, n: `From ${x.peer} (${x.pc}) · ${x.tx}`, at: x.at }));
    return void res.json({ success: true, items });
  }
  if (action === "receipt") {
    const tid = String(b.txid || "").toUpperCase();
    if (!/^TF[0-9A-F]{40}$/.test(tid)) throw new HttpError(400, "bad_request");
    const id = (await db().ref(`transfer_tx/${tid}`).get()).val();
    const t = id ? (await db().ref(`transfers/${id}`).get()).val() : null;
    if (!t || (t.from !== user.id && t.to !== user.id)) throw new HttpError(404, "not_found");
    const mine = t.from === user.id;
    return void res.json({ success: true, receipt: { txid: tid, at: t.at, asset: t.asset || "tfuel", amount: t.amount, fee: mine ? t.fee : 0, dir: mine ? "out" : "in", other: mine ? await displayName(t.to) : (await displayName(t.from)).replace(/^(.).*(.)$/, "$1•••$2"), note: t.note || "" } });
  }

  if (action === "receipt_link" || action === "receipt_bot") {
    const { loadReceipt, receiptLinks, botReceipt } = await import("@/lib/receipt");
    const r = await loadReceipt(String(b.txid || ""), user.id);
    if (action === "receipt_bot") {
      await rateLimit(user.id, "rcpt_bot", 10);
      const ok = await botReceipt(user.id, r, cpt, true);
      if (!ok) throw new HttpError(409, "bot_unreachable");
      return void res.json({ success: true });
    }
    return void res.json({ success: true, ...receiptLinks(r, user.id, cpt) });
  }

  // ── info ──
  const [qt, qu, vip] = await Promise.all([sendQuota(user.id, s, "tfuel"), sendQuota(user.id, s, "usdt"), vipPerks(user.id)]);
  const ft = await feeFor(user.id, "tfuel", 1000, s);
  const fu = await feeFor(user.id, "usdt", 1000, s);
  res.json({
    success: true,
    enabled: s.send_enabled || c2.xfer.usdt.enabled,
    cpt,
    code: await getRefCode(user.id).catch(() => ""),
    // TFUEL (kept for older screens)
    fee_pct: ft.pct,
    min: s.send_min,
    left: qt.left,
    daily_limit: s.send_daily_limit,
    min_age_hours: s.send_min_age_hours,
    balance: u.balance,
    assets: {
      tfuel: { enabled: s.send_enabled, fee_pct: ft.pct, min: s.send_min, left: qt.left, balance: u.balance || 0 },
      usdt: { enabled: c2.xfer.usdt.enabled, fee_pct: fu.pct, min: toU(c2.xfer.usdt.min), left: qu.left, balance: u.usdt_u || 0 },
    },
    links: c2.xfer.links,
    hold: c2.xfer.hold.minutes && (c2.xfer.hold.tfuel > 0 || c2.xfer.hold.usdt > 0) ? { minutes: c2.xfer.hold.minutes, tfuel: c2.xfer.hold.tfuel, usdt: toU(c2.xfer.hold.usdt) } : null,
    vip: { active: vip.active, fee_off_pct: vip.fee_off_pct },
    safe_until: Number((await db().ref(`user_prefs/${user.id}/safe_until`).get()).val()) || 0,
    sched: c2.plus.sched.enabled,
  });
});

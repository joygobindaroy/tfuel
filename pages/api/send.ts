import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { checkPin } from "@/lib/prefs";
import { requireEmailCode, getEmail, sendCode, checkCode } from "@/lib/emailcode";
import { getRefCode } from "@/lib/refcode";
import { sendCoins, sendQuota, displayName } from "@/lib/transfer";
import { assertCanMoveMoney } from "@/lib/freeze";
import { secLog } from "@/lib/seclog";
import { reqCtx } from "@/lib/reqctx";

/** Send TFUEL (user → user): info / lookup / send */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "send", 20);
  const { u, settings: s } = await ensureUser(user);
  const action = String(req.body?.action || "info");
  const cpt = s.coins_per_tfuel;

  const lookup = async (code: string) => {
    if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new HttpError(400, "send_bad_code");
    const uid = (await db().ref(`ref_codes/${code}`).get()).val();
    if (typeof uid !== "string" || uid === user.id) throw new HttpError(404, "send_no_user");
    const nm = (await db().ref(`users/${uid}/name`).get()).val();
    if (nm === null) throw new HttpError(404, "send_no_user");
    return { uid, name: await displayName(uid) };
  };
  const maskEmail = (e: string) => { const [a, d] = e.split("@"); return `${a.slice(0, 2)}•••@${d}`; };
  const parseAmount = (v: unknown) => {
    const x = Number(v);
    if (!Number.isFinite(x) || x <= 0) throw new HttpError(400, "send_min");
    return Math.round(x * cpt);
  };

  if (action === "lookup") {
    const r = await lookup(String(req.body?.code || "").trim());
    return void res.json({ success: true, name: r.name });
  }
  if (action === "prepare") {
    // step 1 (after "Send now"): check everything, then email the code (the code is bound to this recipient + amount)
    if (!s.send_enabled) throw new HttpError(403, "send_disabled");
    const code = String(req.body?.code || "").trim();
    const r = await lookup(code);
    const amount = parseAmount(req.body?.amount);
    if (amount < s.send_min) throw new HttpError(400, "send_min");
    const total = amount + Math.ceil((amount * s.send_fee_pct) / 100);
    await assertCanMoveMoney(user.id, s);
    if ((u.balance || 0) < total) throw new HttpError(409, "insufficient");
    if (s.send_min_age_hours > 0 && u.created_at && Date.now() < u.created_at + s.send_min_age_hours * 3600000) throw new HttpError(403, "send_too_new");
    const q = await sendQuota(user.id, s);
    if (q.left !== null && total > q.left) throw new HttpError(429, "send_limit");
    await checkPin(user.id, req.body?.pin);
    const e = await getEmail(user.id);
    if (s.email_required && !e?.verified) throw new HttpError(403, "email_required");
    if (!e?.verified) return void res.json({ success: true, step: "ready" });
    await sendCode(user.id, "send", e.addr, reqCtx(req), { amount: amount / cpt, asset: "TFUEL", address: code, label: r.name });
    return void res.json({ success: true, step: "code", email: maskEmail(e.addr) });
  }
  if (action === "received") {
    const v = ((await db().ref(`activity/${user.id}`).orderByKey().limitToLast(80).get()).val() || {}) as Record<string, any>;
    const items = Object.entries(v).filter(([, a]) => a.t === "receive").sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, 15).map(([id, a]) => ({ id, c: a.c || 0, n: a.n || "", at: a.at }));
    return void res.json({ success: true, items });
  }
  if (action === "receipt") {
    const tid = String(req.body?.txid || "").toUpperCase();
    if (!/^TF[0-9A-F]{40}$/.test(tid)) throw new HttpError(400, "bad_request");
    const id = (await db().ref(`transfer_tx/${tid}`).get()).val();
    const t = id ? (await db().ref(`transfers/${id}`).get()).val() : null;
    if (!t || (t.from !== user.id && t.to !== user.id)) throw new HttpError(404, "not_found");
    const mine = t.from === user.id;
    return void res.json({ success: true, receipt: { txid: tid, at: t.at, amount: t.amount, fee: mine ? t.fee : 0, dir: mine ? "out" : "in", other: mine ? await displayName(t.to) : (await displayName(t.from)).replace(/^(.).*(.)$/, "$1•••$2"), note: t.note || "" } });
  }
  if (action === "send") {
    if (!s.send_enabled) throw new HttpError(403, "send_disabled");
    const code = String(req.body?.code || "").trim();
    const r = await lookup(code);
    const amount = parseAmount(req.body?.amount);
    await checkPin(user.id, req.body?.pin);
    const em = await getEmail(user.id);
    if (em?.verified) await checkCode(user.id, "send", req.body?.email_code, em.addr, { address: code, amount: amount / cpt });
    else await requireEmailCode(user.id, "send", req.body?.email_code, { address: code, amount: amount / cpt });
    const note = String(req.body?.note || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60);
    const out = await sendCoins({ id: user.id, name: String(u.name || user.first_name || "User") }, r.uid, amount, s, note);
    await secLog(user.id, "withdraw_request", reqCtx(req), `send ${amount / cpt} TFUEL`).catch(() => {});
    return void res.json({ success: true, fee: out.fee, balance: out.balance, tx: { id: out.id, txid: out.txid, at: out.at, amount, fee: out.fee, to: out.to } });
  }
  // info
  const q = await sendQuota(user.id, s);
  res.json({
    success: true,
    enabled: s.send_enabled,
    cpt,
    code: await getRefCode(user.id).catch(() => ""),
    fee_pct: s.send_fee_pct,
    min: s.send_min,
    left: q.left,
    daily_limit: s.send_daily_limit,
    min_age_hours: s.send_min_age_hours,
    balance: u.balance,
  });
});

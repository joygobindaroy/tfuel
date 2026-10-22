import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { checkPin } from "@/lib/prefs";
import { requireEmailCode } from "@/lib/emailcode";
import { getRefCode } from "@/lib/refcode";
import { sendCoins, sendQuota, maskName } from "@/lib/transfer";
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
    return { uid, name: maskName(String(nm)) };
  };

  if (action === "lookup") {
    const r = await lookup(String(req.body?.code || "").trim());
    return void res.json({ success: true, name: r.name });
  }
  if (action === "send") {
    if (!s.send_enabled) throw new HttpError(403, "send_disabled");
    const code = String(req.body?.code || "").trim();
    const r = await lookup(code);
    const x = Number(req.body?.amount);
    if (!Number.isFinite(x) || x <= 0) throw new HttpError(400, "send_min");
    const amount = Math.round(x * cpt);
    await checkPin(user.id, req.body?.pin);
    await requireEmailCode(user.id, "send", req.body?.email_code, { address: code, amount: amount / cpt });
    const note = String(req.body?.note || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60);
    const out = await sendCoins({ id: user.id, name: String(u.name || user.first_name || "User") }, r.uid, amount, s, note);
    await secLog(user.id, "withdraw_request", reqCtx(req), `send ${amount / cpt} TFUEL`).catch(() => {});
    return void res.json({ success: true, fee: out.fee, balance: out.balance });
  }
  // info
  const q = await sendQuota(user.id, s);
  res.json({
    success: true,
    enabled: s.send_enabled,
    code: await getRefCode(user.id).catch(() => ""),
    fee_pct: s.send_fee_pct,
    min: s.send_min,
    left: q.left,
    daily_limit: s.send_daily_limit,
    min_age_hours: s.send_min_age_hours,
    balance: u.balance,
  });
});

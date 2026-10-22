import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { ServerValue } from "firebase-admin/database";
import { sortableId } from "@/lib/crypto";
import { spend } from "@/lib/wallet";
import { ensureUser, newUser, UserRecord, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { checkPin } from "@/lib/prefs";
import { requireEmailCode, mailWithdraw } from "@/lib/emailcode";
import { reqCtx } from "@/lib/reqctx";
import { holdReason } from "@/lib/hold";
import { secLog } from "@/lib/seclog";
import { peekPrice } from "@/lib/market";
import { checkAddress } from "@/lib/addrcheck";
import { assertCanMoveMoney } from "@/lib/freeze";
import { alertAdmins } from "@/lib/adminalert";

/** Withdraw অনুরোধ: coin আগে কেটে নেওয়া হয়, admin টাকা পাঠালে paid / বাতিল করলে ফেরত */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "withdraw", 10);

  const { u: rec, settings } = await ensureUser(user);
  if (!settings.withdraw_enabled) throw new HttpError(403, "withdraw_disabled");
  await assertCanMoveMoney(user.id, settings);
  await checkPin(user.id, req.body?.pin);

  const amount = Math.floor(Number(req.body?.amount));
  const method = String(req.body?.method || "");
  const account = String(req.body?.account || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 100);

  if (!Number.isFinite(amount) || amount < settings.min_withdraw) {
    return void res.status(400).json({ success: false, error: "below_minimum", min: settings.min_withdraw });
  }
  if (!settings.withdraw_methods.includes(method)) throw new HttpError(400, "bad_method");
  if (account.length < 4) throw new HttpError(400, "bad_account");
  await checkAddress(user.id, account, settings);
  await requireEmailCode(user.id, "withdraw", req.body?.email_code, { address: account, amount: amount / settings.coins_per_tfuel });

  const now0 = Date.now();
  if (settings.new_user_wait_days > 0 && rec.created_at) {
    const readyAt = rec.created_at + settings.new_user_wait_days * 86400000;
    if (now0 < readyAt) return void res.status(403).json({ success: false, error: "too_new", retry_at: readyAt });
  }
  if (settings.daily_withdraw_limit > 0) {
    const dayAgo = now0 - 86400000;
    const n = Object.values(rec.withdrawals || {}).filter((w) => w.created_at > dayAgo).length;
    if (n >= settings.daily_withdraw_limit) throw new HttpError(429, "daily_limit");
  }

  // আগে balance কেটে নিই (atomic); না থাকলে অনুরোধ বাতিল
  let out: { error?: string; balance?: number } = {};
  await db()
    .ref(`users/${user.id}`)
    .transaction((cur: UserRecord | null) => {
      out = {};
      if (cur === null) return newUser();
      if ((cur.balance || 0) < amount) {
        out = { error: "insufficient" };
        return;
      }
      cur.balance -= amount;
      spend(cur, "withdrawn", amount);
      out = { balance: cur.balance };
      return cur;
    });
  if (out.error) throw new HttpError(409, out.error);

  const price = await peekPrice(settings).catch(() => null);
  const hold = holdReason(rec, settings, price ? (amount / settings.coins_per_tfuel) * price : 0);
  const id = sortableId();
  const now = Date.now();
  try {
    await db().ref().update({
      [`withdrawals/${id}`]: {
        uid: user.id,
        name: user.first_name || "User",
        amount,
        method,
        account,
        status: "pending",
        created_at: now,
        ...(hold ? { hold } : {}),
      },
      [`users/${user.id}/withdrawals/${id}`]: { amount, method, status: "pending", created_at: now },
    });
  } catch (e) {
    console.error("withdraw record failed, refunding", user.id, amount, e);
    await db()
      .ref()
      .update({ [`users/${user.id}/balance`]: ServerValue.increment(amount) })
      .catch((e2) => console.error("REFUND FAILED", user.id, amount, e2));
    throw new HttpError(500, "withdraw_failed");
  }

  if (hold) { await secLog(user.id, "withdraw_held", reqCtx(req), hold); await alertAdmins("hold", `TFUEL withdrawal on HOLD (${Math.round(amount / settings.coins_per_tfuel)} TFUEL, user ${user.id}): ${hold}`); }
  await mailWithdraw(user.id, "requested", { amount: `${Math.round((amount / settings.coins_per_tfuel) * 1000) / 1000} TFUEL`, network: method, address: account, ctx: reqCtx(req) });
  res.json({ success: true, id, balance: out.balance });
});

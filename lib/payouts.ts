import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { adminLog } from "./log";
import { getSettings } from "./settings";
import { activity } from "./wallet";
import { notify } from "./notify";
import { mailWithdraw } from "./emailcode";
import { toU } from "./market";

const clip = (v: any) => String(v || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 200);

/** TFUEL withdrawal: pending → paid / rejected (refund). One-time only; HOLD must be released first. */
export async function settleTfWithdrawal(id: string, next: "paid" | "rejected", noteRaw: any, who: string) {
  const note = clip(noteRaw);
  let rec: any = null;
  let held = false;
  await db().ref(`withdrawals/${id}`).transaction((w: any) => {
    rec = null;
    if (w === null) return w;
    if (w.status !== "pending") return;
    if (next === "paid" && w.hold) { held = true; return; }
    w.status = next;
    w.handled_at = Date.now();
    w.note = note;
    rec = { ...w };
    return w;
  });
  if (held) throw new HttpError(409, "This withdrawal is on HOLD. Review it, then press Release first.");
  if (!rec) throw new HttpError(409, "not_pending");
  const upd: Record<string, any> = { [`users/${rec.uid}/withdrawals/${id}/status`]: next };
  if (next === "rejected") {
    upd[`users/${rec.uid}/balance`] = ServerValue.increment(Number(rec.amount));
    upd[`users/${rec.uid}/spent/withdrawn`] = ServerValue.increment(-Number(rec.amount));
  }
  await db().ref().update(upd);
  await adminLog(who, next === "paid" ? "withdraw_paid" : "withdraw_rejected", { id, uid: rec.uid, amount: rec.amount, note });
  await notify(rec.uid, next === "paid" ? "✅ Your withdrawal has been paid." : "↩️ Your withdrawal was rejected and the coins were refunded.");
  await mailWithdraw(rec.uid, next, { amount: `${Math.round((Number(rec.amount) / ((await getSettings()).coins_per_tfuel || 1000)) * 1000) / 1000} TFUEL`, network: rec.method, address: rec.account, note });
  return rec;
}

/** USDT withdrawal: pending → paid / rejected (refund). */
export async function settleUsdtWithdrawal(id: string, pay: boolean, noteRaw: any, who: string) {
  const note = clip(noteRaw);
  let rec: any = null;
  let held = false;
  await db().ref(`usdt_withdrawals/${id}`).transaction((w: any) => {
    rec = null;
    if (w === null) return w;
    if (w.status !== "pending") return;
    if (pay && w.hold) { held = true; return; }
    w.status = pay ? "paid" : "rejected";
    w.handled_at = Date.now();
    w.note = note;
    rec = { ...w };
    return w;
  });
  if (held) throw new HttpError(409, "This withdrawal is on HOLD. Review it, then press Release first.");
  if (!rec) throw new HttpError(409, "not_pending");
  const upd: Record<string, any> = {
    [`users/${rec.uid}/usdt_withdrawals/${id}/status`]: rec.status,
    [`users/${rec.uid}/usdt_withdrawals/${id}/note`]: note || null,
  };
  if (!pay) {
    upd[`users/${rec.uid}/usdt_u`] = ServerValue.increment(toU(Number(rec.amount)));
    upd[`users/${rec.uid}/usdt_tot/withdrawn`] = ServerValue.increment(-toU(Number(rec.amount)));
  }
  await db().ref().update(upd);
  await activity(rec.uid, pay ? "usdt_paid" : "usdt_rejected", { usdt_u: toU(Number(rec.amount)), note });
  await notify(rec.uid, pay ? `✅ Your USDT withdrawal of ${rec.amount} USDT has been paid.` : `↩️ Your USDT withdrawal was rejected and ${rec.amount} USDT was refunded.${note ? " Reason: " + note : ""}`);
  await mailWithdraw(rec.uid, pay ? "paid" : "rejected", { amount: `${rec.amount} USDT`, receive: pay && rec.receive ? `${rec.receive} USDT` : "", network: rec.network_name, address: rec.address, note });
  await adminLog(who, pay ? "usdt_paid" : "usdt_rejected", { id, uid: rec.uid, amount: rec.amount, note });
  return rec;
}

import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { sha256, sortableId } from "./crypto";
import { tgCall } from "./telegram";
import { notify } from "./notify";
import { activity } from "./wallet";
import { adminLog } from "./log";
import { mailMoney } from "./moneymail";
import { fromU } from "./market";

/**
 * Stars পেমেন্ট ঠিক একবার credit করে। webhook, "Check payment" বাটন ও cron — তিন জায়গা থেকেই নিরাপদে ডাকা যায়।
 * order-এর `credited` ফ্ল্যাগই একমাত্র তালা; credit ব্যর্থ হলে তালা খুলে error তোলে (retry সম্ভব)।
 */
export async function settleStars(oid: string, p: { fromId: any; total: number; charge: string }): Promise<"credited" | "already" | "invalid"> {
  if (!oid || !p.charge) return "invalid";
  let o: any = null;
  let state: "credited" | "already" | "invalid" = "invalid";
  await db().ref(`stars_orders/${oid}`).transaction((c: any) => {
    o = null;
    if (!c) { state = "invalid"; return; }
    if (c.credited) { state = "already"; return; }
    if (String(c.uid) !== String(p.fromId) || Number(p.total) !== c.stars) { state = "invalid"; return; }
    c.status = "paid"; c.charge = c.charge || p.charge; c.paid_at = c.paid_at || Date.now(); c.credited = true;
    o = { ...c };
    state = "credited";
    return c;
  });
  if (!o) return state;
  const id = sortableId();
  const usdt = fromU(o.usdt_u);
  const rec = { network: "stars", network_name: "Telegram Stars", method: "stars", txid: "stars:" + p.charge, amount: usdt, stars: o.stars, status: "approved", credited: usdt, created_at: Date.now(), handled_at: Date.now(), note: `${o.stars} Stars`, by: "stars" };
  try {
    await db().ref().update({
      [`deposits/${id}`]: { ...rec, uid: String(o.uid), name: "" },
      [`users/${o.uid}/deposits/${id}`]: rec,
      [`users/${o.uid}/usdt_u`]: ServerValue.increment(o.usdt_u),
      [`users/${o.uid}/usdt_tot/deposited`]: ServerValue.increment(o.usdt_u),
      [`deposit_credited/${sha256("stars:" + p.charge)}`]: oid,
    });
  } catch (e) {
    await db().ref(`stars_orders/${oid}/credited`).set(false).catch(() => {});
    throw e;
  }
  await activity(String(o.uid), "deposit", { usdt_u: o.usdt_u, note: `${o.stars} Stars` });
  await notify(String(o.uid), `✅ ${o.stars} Stars received: +${usdt} USDT added to your wallet.`);
  await mailMoney(String(o.uid), "deposit", [["Amount", `${usdt} USDT`], ["Method", `Telegram Stars (${o.stars} ⭐)`]]);
  await adminLog("stars", "stars_deposit", { uid: o.uid, stars: o.stars, usdt, charge: p.charge });
  return "credited";
}

/** webhook-এর বার্তা হারালেও: Telegram-এর নিজের Stars লেনদেন তালিকা (getStarTransactions) থেকে payload মিলিয়ে credit */
export async function healStars(oid: string): Promise<boolean> {
  const o = (await db().ref(`stars_orders/${oid}`).get()).val();
  if (!o || o.credited || Date.now() - (o.created_at || 0) > 3 * 86400000) return !!o?.credited;
  const r = await tgCall("getStarTransactions", { limit: 100 });
  if (!r.ok) return false;
  for (const t of (r.result?.transactions || []) as any[]) {
    const src = t.source;
    if (src?.type === "user" && src.invoice_payload === oid && Number(t.amount) === o.stars && String(src.user?.id) === String(o.uid)) {
      return (await settleStars(oid, { fromId: o.uid, total: o.stars, charge: String(t.id) })) === "credited";
    }
  }
  return false;
}

/** cron: গত ২৪ ঘণ্টার "open" order গুলো একবার মিলিয়ে দেখা */
export async function healRecentStars(): Promise<number> {
  const snap = await db().ref("stars_orders").orderByKey().limitToLast(30).get();
  let n = 0;
  for (const [oid, o] of Object.entries((snap.val() || {}) as Record<string, any>)) {
    if (o.credited || Date.now() - (o.created_at || 0) > 86400000 || Date.now() - (o.created_at || 0) < 60000) continue;
    if (await healStars(oid).catch(() => false)) n++;
  }
  return n;
}

/** user Deposit পাতা খুললে: তার নিজের অমীমাংসিত Stars order (১ মিনিট–৩ দিন পুরনো) মিলিয়ে দেখা */
export async function healUserStars(uid: string): Promise<number> {
  const snap = await db().ref("stars_orders").orderByKey().limitToLast(40).get();
  let n = 0;
  for (const [oid, o] of Object.entries((snap.val() || {}) as Record<string, any>)) {
    const age = Date.now() - (o.created_at || 0);
    if (String(o.uid) !== uid || o.credited || age < 60000 || age > 3 * 86400000) continue;
    if (await healStars(oid).catch(() => false)) n++;
  }
  return n;
}

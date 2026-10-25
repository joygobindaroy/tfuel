import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { sortableId, sha256 } from "./crypto";
import { getRefCode } from "./refcode";
import { dayKey } from "./log";
import { activity, spend } from "./wallet";
import { Settings } from "./settings";
import { notify } from "./notify";
import { mailMoney, tfStr } from "./moneymail";
import type { UserRecord } from "./user";
import { assertCanMoveMoney } from "./freeze";

/** Name shown for a user in transfers: nickname if they set one, else their Telegram name */
export async function displayName(uid: string): Promise<string> {
  const [nm, nick] = await Promise.all([db().ref(`users/${uid}/name`).get(), db().ref(`user_prefs/${uid}/nick`).get()]);
  return String(nick.val() || nm.val() || "User").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 24) || "User";
}
/** Transaction hash like an exchanger's internal transfer ID: TF + 40 hex */
export const makeTxid = (id: string, from: string, to: string, amount: number, at: number) => "TF" + sha256(`tx:${id}:${from}:${to}:${amount}:${at}`).slice(0, 40).toUpperCase();

export const maskName = (n: string) => {
  const s = Array.from(String(n || "User"));
  return s.length <= 2 ? s[0] + "•" : s[0] + "•••" + s[s.length - 1];
};

/** পাঠানো যাবে কি না + আজ কতটা বাকি */
export async function sendQuota(uid: string, s: Settings) {
  const used = Number((await db().ref(`send_daily/${uid}/${dayKey()}`).get()).val()) || 0;
  return { used, left: s.send_daily_limit > 0 ? Math.max(0, s.send_daily_limit - used) : null };
}

/**
 * user → user TFUEL। ধাপ: (১) দৈনিক সীমা reserve (২) প্রেরক থেকে atomic কাটা (পরিমাণ + fee)
 * (৩) প্রাপকের ব্যালেন্সে যোগ (৪) ব্যর্থ হলে সবটাই ফেরত। fee আলাদা stats-এ জমে।
 */
export async function sendCoins(from: { id: string; name: string }, toUid: string, amount: number, s: Settings, note = ""): Promise<{ fee: number; balance: number; id: string; txid: string; at: number; to: { name: string; code: string } }> {
  if (!s.send_enabled) throw new HttpError(403, "send_disabled");
  if (toUid === from.id) throw new HttpError(400, "send_self");
  await assertCanMoveMoney(from.id, s);
  if (!Number.isInteger(amount) || amount < s.send_min) throw new HttpError(400, "send_min");
  const fee = Math.ceil((amount * s.send_fee_pct) / 100);
  const total = amount + fee;
  const now = Date.now();

  const rcp = (await db().ref(`users/${toUid}`).get()).val() as UserRecord | null;
  if (!rcp) throw new HttpError(404, "send_no_user");
  if ((rcp as any).banned) throw new HttpError(403, "send_no_user");

  // দৈনিক সীমা reserve
  const dref = db().ref(`send_daily/${from.id}/${dayKey(now)}`);
  let over = false;
  await dref.transaction((c: number | null) => {
    over = false;
    const u = (c || 0) + total;
    if (s.send_daily_limit > 0 && u > s.send_daily_limit) { over = true; return; }
    return u;
  });
  if (over) throw new HttpError(429, "send_limit");
  const unreserve = () => dref.transaction((c: number | null) => Math.max(0, (c || 0) - total)).catch(() => {});

  let err = "";
  let balance = 0;
  let deducted = false;
  try {
    await db().ref(`users/${from.id}`).transaction((cur: UserRecord | null) => {
      err = "";
      deducted = false;
      // first pass on a real database often sees null (empty local cache): return it unchanged so the server re-runs with the real value
      if (cur === null) return cur;
      if (s.send_min_age_hours > 0 && cur.created_at && now < cur.created_at + s.send_min_age_hours * 3600000) { err = "send_too_new"; return; }
      if ((cur.balance || 0) < total) { err = "insufficient"; return; }
      cur.balance -= total;
      spend(cur, "sent", total);
      balance = cur.balance;
      deducted = true;
      return cur;
    });
  } catch (e) { await unreserve(); throw e; }
  if (!err && !deducted) err = "send_no_user";
  if (err) { await unreserve(); throw new HttpError(err === "insufficient" ? 409 : 403, err); }

  const id = sortableId();
  const txid = makeTxid(id, from.id, toUid, amount, now);
  const [toName, toCode, fromCode] = await Promise.all([displayName(toUid), getRefCode(toUid).catch(() => ""), getRefCode(from.id).catch(() => "")]);
  try {
    await db().ref().update({
      [`transfer_tx/${txid}`]: id,
      [`users/${toUid}/balance`]: ServerValue.increment(amount),
      [`users/${toUid}/earn/received`]: ServerValue.increment(amount),
      [`transfers/${id}`]: { from: from.id, to: toUid, amount, fee, note: note.slice(0, 60), at: now, txid },
      "stats/send_fees": ServerValue.increment(fee),
      "stats/send_volume": ServerValue.increment(amount),
    });
  } catch (e) {
    console.error("send credit failed, refunding", from.id, toUid, amount, e);
    await db().ref().update({ [`users/${from.id}/balance`]: ServerValue.increment(total), [`users/${from.id}/spent/sent`]: ServerValue.increment(-total) }).catch((e2) => console.error("SEND REFUND FAILED", from.id, total, e2));
    await unreserve();
    throw new HttpError(500, "send_failed");
  }
  await activity(from.id, "send", { coins: -total, note: `To ${toName} (${toCode}) · ${txid}` });
  await activity(toUid, "receive", { coins: amount, note: `From ${maskName(from.name)} (${fromCode}) · ${txid}` });
  await notify(toUid, `💸 You received ${tfStr(amount, s.coins_per_tfuel)} from ${maskName(from.name)}.`);
  await mailMoney(from.id, "sent", [["Status", "Completed"], ["Amount", tfStr(amount, s.coins_per_tfuel)], ["Fee", tfStr(fee, s.coins_per_tfuel)], ["Total deducted", tfStr(total, s.coins_per_tfuel)], ["Recipient", toName], ["Recipient ID", toCode], ["Transaction hash", txid], ["Note", note]]);
  await mailMoney(toUid, "received", [["Status", "Completed"], ["Amount", tfStr(amount, s.coins_per_tfuel)], ["From", maskName(from.name)], ["Sender ID", fromCode], ["Transaction hash", txid], ["Note", note]]);
  return { fee, balance, id, txid, at: now, to: { name: toName, code: toCode } };
}

import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { sortableId, sha256 } from "./crypto";
import { getRefCode } from "./refcode";
import { dayKey } from "./log";
import { activity, spend, usdtTot } from "./wallet";
import { getCfg2 } from "./cfg2";
import { vipPerks } from "./vip";
import { toU, fromU } from "./market";
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

export type Asset = "tfuel" | "usdt";
export interface XferRow { d: "out" | "in"; a: Asset; amt: number; fee: number; peer: string; pc: string; tx: string; at: number; n: string; st: "done" | "held" | "cancelled" | "link" | "claimed" | "expired"; rel?: number }
export interface SendResult { fee: number; balance: number; id: string; txid: string; at: number; to: { name: string; code: string }; asset: Asset; held?: boolean; release_at?: number }

/** amount text for any asset (tfuel = coins, usdt = micro) */
export const amtStr = (asset: Asset, v: number, cpt: number) => (asset === "usdt" ? `${fromU(v).toFixed(2)} USDT` : tfStr(v, cpt));

/** পাঠানো যাবে কি না + আজ কতটা বাকি */
export async function sendQuota(uid: string, s: Settings, asset: Asset = "tfuel") {
  if (asset === "usdt") {
    const x = (await getCfg2()).xfer.usdt;
    const used = Number((await db().ref(`send_daily_u/${uid}/${dayKey()}`).get()).val()) || 0;
    const lim = toU(x.daily);
    return { used, left: lim > 0 ? Math.max(0, lim - used) : null };
  }
  const used = Number((await db().ref(`send_daily/${uid}/${dayKey()}`).get()).val()) || 0;
  return { used, left: s.send_daily_limit > 0 ? Math.max(0, s.send_daily_limit - used) : null };
}

/** fee (after VIP discount) for an amount */
export async function feeFor(uid: string, asset: Asset, amount: number, s: Settings) {
  const x = (await getCfg2()).xfer;
  const pct = asset === "usdt" ? x.usdt.fee_pct : s.send_fee_pct;
  const v = await vipPerks(uid);
  const eff = pct * (1 - (v.active ? v.fee_off_pct : 0) / 100);
  return { fee: Math.ceil((amount * eff) / 100), pct: eff };
}
export async function minFor(asset: Asset, s: Settings) {
  return asset === "usdt" ? toU((await getCfg2()).xfer.usdt.min) : s.send_min;
}

/** atomically take `total` from the sender (returns the new balance); throws send_too_new / insufficient / send_no_user */
export async function debit(uid: string, asset: Asset, total: number, s: Settings, now: number, checkAge: boolean, spendKey: "sent" | "shop" = "sent"): Promise<number> {
  let err = "";
  let balance = 0;
  let done = false;
  await db().ref(`users/${uid}`).transaction((cur: UserRecord | null) => {
    err = ""; done = false;
    // first pass on a real database often sees null (empty local cache): return it unchanged so the server re-runs with the real value
    if (cur === null) return cur;
    if (checkAge && s.send_min_age_hours > 0 && cur.created_at && now < cur.created_at + s.send_min_age_hours * 3600000) { err = "send_too_new"; return; }
    if (asset === "usdt") {
      if ((cur.usdt_u || 0) < total) { err = "insufficient_usdt"; return; }
      cur.usdt_u = (cur.usdt_u || 0) - total;
      usdtTot(cur, "sent", -total);
      balance = cur.usdt_u;
    } else {
      if ((cur.balance || 0) < total) { err = "insufficient"; return; }
      cur.balance -= total;
      spend(cur, spendKey, total);
      balance = cur.balance;
    }
    done = true;
    return cur;
  });
  if (!err && !done) err = "send_no_user";
  if (err) throw new HttpError(err.startsWith("insufficient") ? 409 : 403, err);
  return balance;
}
/** give back / give to a user (increment; safe to retry-free) */
export async function credit(uid: string, asset: Asset, amount: number, kind: "received" | "refund") {
  const up: Record<string, any> = {};
  if (asset === "usdt") {
    up[`users/${uid}/usdt_u`] = ServerValue.increment(amount);
    up[`users/${uid}/usdt_tot/${kind === "refund" ? "sent" : "received"}`] = ServerValue.increment(amount);
  } else {
    up[`users/${uid}/balance`] = ServerValue.increment(amount);
    up[`users/${uid}/earn/received`] = ServerValue.increment(kind === "refund" ? 0 : amount);
    if (kind === "refund") up[`users/${uid}/spent/sent`] = ServerValue.increment(-amount);
  }
  await db().ref().update(up);
}
export async function reserveDaily(uid: string, asset: Asset, total: number, s: Settings, now: number) {
  const x = (await getCfg2()).xfer.usdt;
  const limit = asset === "usdt" ? toU(x.daily) : s.send_daily_limit;
  const dref = db().ref(`${asset === "usdt" ? "send_daily_u" : "send_daily"}/${uid}/${dayKey(now)}`);
  let over = false;
  await dref.transaction((c: number | null) => {
    over = false;
    const u = (c || 0) + total;
    if (limit > 0 && u > limit) { over = true; return; }
    return u;
  });
  if (over) throw new HttpError(429, "send_limit");
  return () => dref.transaction((c: number | null) => Math.max(0, (c || 0) - total)).catch(() => {});
}
export const xferIndex = (uid: string, id: string, row: XferRow) => ({ [`user_xfers/${uid}/${id}`]: row });

/**
 * user → user transfer (TFUEL coins or USDT micro). Steps: (1) reserve daily limit (2) atomic debit of amount + fee
 * (3) credit the receiver — or park it for N minutes when the amount is large (the sender can cancel) (4) on any failure everything is returned.
 */
export async function sendAsset(from: { id: string; name: string }, toUid: string, asset: Asset, amount: number, s: Settings, note = ""): Promise<SendResult> {
  const c2 = await getCfg2();
  if (asset === "usdt" ? !c2.xfer.usdt.enabled : !s.send_enabled) throw new HttpError(403, "send_disabled");
  if (toUid === from.id) throw new HttpError(400, "send_self");
  await assertCanMoveMoney(from.id, s);
  if (!Number.isInteger(amount) || amount < (await minFor(asset, s))) throw new HttpError(400, "send_min");
  const { fee } = await feeFor(from.id, asset, amount, s);
  const total = amount + fee;
  const now = Date.now();

  const rcp = (await db().ref(`users/${toUid}`).get()).val() as UserRecord | null;
  if (!rcp) throw new HttpError(404, "send_no_user");
  if ((rcp as any).banned) throw new HttpError(403, "send_no_user");

  const unreserve = await reserveDaily(from.id, asset, total, s, now);
  let balance = 0;
  try { balance = await debit(from.id, asset, total, s, now, true); }
  catch (e) { await unreserve(); throw e; }

  const id = sortableId();
  const txid = makeTxid(id, from.id, toUid, amount, now);
  const [toName, toCode, fromCode] = await Promise.all([displayName(toUid), getRefCode(toUid).catch(() => ""), getRefCode(from.id).catch(() => "")]);
  const holdAt = asset === "usdt" ? toU(c2.xfer.hold.usdt) : c2.xfer.hold.tfuel;
  const hold = holdAt > 0 && amount >= holdAt;
  const rel = now + c2.xfer.hold.minutes * 60000;

  if (hold) {
    try {
      await db().ref().update({
        [`xfer_hold/${id}`]: { from: from.id, from_name: from.name, to: toUid, asset, amount, fee, total, note: note.slice(0, 60), at: now, rel, txid, st: "held", tc: toCode, tn: toName, fc: fromCode },
        ...xferIndex(from.id, id, { d: "out", a: asset, amt: amount, fee, peer: toName, pc: toCode, tx: txid, at: now, n: note.slice(0, 60), st: "held", rel }),
      });
    } catch (e) {
      console.error("hold failed, refunding", from.id, e);
      await credit(from.id, asset, total, "refund").catch((e2) => console.error("SEND REFUND FAILED", from.id, total, e2));
      await unreserve();
      throw new HttpError(500, "send_failed");
    }
    await activity(from.id, "send", { ...(asset === "usdt" ? { usdt_u: -total } : { coins: -total }), note: `Held to ${toName} (${toCode}) · ${txid}` });
    await notify(toUid, `⏳ ${maskName(from.name)} is sending you ${amtStr(asset, amount, s.coins_per_tfuel)}. It arrives in ${c2.xfer.hold.minutes} min.`);
    await notify(from.id, `⏳ Your transfer of ${amtStr(asset, amount, s.coins_per_tfuel)} to ${toName} is on hold for ${c2.xfer.hold.minutes} min. You can cancel it in Send → History.`, false, [[{ text: "↩️ Cancel transfer", callback_data: `xc:${id}` }]]);
    return { fee, balance, id, txid, at: now, to: { name: toName, code: toCode }, asset, held: true, release_at: rel };
  }

  try {
    await db().ref().update({
      [`transfer_tx/${txid}`]: id,
      ...(asset === "usdt" ? { [`users/${toUid}/usdt_u`]: ServerValue.increment(amount), [`users/${toUid}/usdt_tot/received`]: ServerValue.increment(amount), "stats/send_fees_u": ServerValue.increment(fee), "stats/send_volume_u": ServerValue.increment(amount) }
        : { [`users/${toUid}/balance`]: ServerValue.increment(amount), [`users/${toUid}/earn/received`]: ServerValue.increment(amount), "stats/send_fees": ServerValue.increment(fee), "stats/send_volume": ServerValue.increment(amount) }),
      [`transfers/${id}`]: { from: from.id, to: toUid, asset, amount, fee, note: note.slice(0, 60), at: now, txid },
      ...xferIndex(from.id, id, { d: "out", a: asset, amt: amount, fee, peer: toName, pc: toCode, tx: txid, at: now, n: note.slice(0, 60), st: "done" }),
      ...xferIndex(toUid, id, { d: "in", a: asset, amt: amount, fee: 0, peer: maskName(from.name), pc: fromCode, tx: txid, at: now, n: note.slice(0, 60), st: "done" }),
    });
  } catch (e) {
    console.error("send credit failed, refunding", from.id, toUid, amount, e);
    await credit(from.id, asset, total, "refund").catch((e2) => console.error("SEND REFUND FAILED", from.id, total, e2));
    await unreserve();
    throw new HttpError(500, "send_failed");
  }
  await afterSend(from.id, from.name, toUid, toName, toCode, fromCode, asset, amount, fee, txid, note, s);
  return { fee, balance, id, txid, at: now, to: { name: toName, code: toCode }, asset };
}
export async function afterSend(fromId: string, fromName: string, toUid: string, toName: string, toCode: string, fromCode: string, asset: Asset, amount: number, fee: number, txid: string, note: string, s: Settings) {
  const cpt = s.coins_per_tfuel;
  const a = asset === "usdt" ? { usdt_u: -(amount + fee) } : { coins: -(amount + fee) };
  const b = asset === "usdt" ? { usdt_u: amount } : { coins: amount };
  await activity(fromId, "send", { ...a, note: `To ${toName} (${toCode}) · ${txid}` });
  await activity(toUid, "receive", { ...b, note: `From ${maskName(fromName)} (${fromCode}) · ${txid}` });
  await notify(toUid, `💸 You received ${amtStr(asset, amount, cpt)} from ${maskName(fromName)}.`);
  await mailMoney(fromId, "sent", [["Status", "Completed"], ["Amount", amtStr(asset, amount, cpt)], ["Fee", amtStr(asset, fee, cpt)], ["Total deducted", amtStr(asset, amount + fee, cpt)], ["Recipient", toName], ["Recipient ID", toCode], ["Transaction hash", txid], ["Note", note]]);
  await mailMoney(toUid, "received", [["Status", "Completed"], ["Amount", amtStr(asset, amount, cpt)], ["From", maskName(fromName)], ["Sender ID", fromCode], ["Transaction hash", txid], ["Note", note]]);
}
/** TFUEL wrapper (original signature) */
export const sendCoins = (from: { id: string; name: string }, toUid: string, amount: number, s: Settings, note = "") => sendAsset(from, toUid, "tfuel", amount, s, note);

/** finish a held transfer: credit the receiver. Safe against double run (status claim). */
export async function releaseHold(id: string, s: Settings): Promise<boolean> {
  const r = await db().ref(`xfer_hold/${id}/st`).transaction((c: string | null) => (c === "held" ? "releasing" : undefined));
  if (!r.committed) return false;
  const h = (await db().ref(`xfer_hold/${id}`).get()).val() as any;
  try {
    await db().ref().update({
      [`transfer_tx/${h.txid}`]: id,
      ...(h.asset === "usdt" ? { [`users/${h.to}/usdt_u`]: ServerValue.increment(h.amount), [`users/${h.to}/usdt_tot/received`]: ServerValue.increment(h.amount), "stats/send_fees_u": ServerValue.increment(h.fee), "stats/send_volume_u": ServerValue.increment(h.amount) }
        : { [`users/${h.to}/balance`]: ServerValue.increment(h.amount), [`users/${h.to}/earn/received`]: ServerValue.increment(h.amount), "stats/send_fees": ServerValue.increment(h.fee), "stats/send_volume": ServerValue.increment(h.amount) }),
      [`transfers/${id}`]: { from: h.from, to: h.to, asset: h.asset, amount: h.amount, fee: h.fee, note: h.note, at: h.at, txid: h.txid },
      [`xfer_hold/${id}/st`]: "released",
      [`user_xfers/${h.from}/${id}/st`]: "done",
      ...xferIndex(h.to, id, { d: "in", a: h.asset, amt: h.amount, fee: 0, peer: maskName(h.from_name), pc: h.fc, tx: h.txid, at: h.at, n: h.note, st: "done" }),
    });
  } catch (e) {
    console.error("release failed", id, e);
    await db().ref(`xfer_hold/${id}/st`).set("held");
    return false;
  }
  await afterSend(h.from, h.from_name, h.to, h.tn, h.tc, h.fc, h.asset, h.amount, h.fee, h.txid, h.note, s);
  return true;
}
/** the sender cancels a held transfer → full refund */
export async function cancelHold(uid: string, id: string): Promise<void> {
  const h0 = (await db().ref(`xfer_hold/${id}`).get()).val() as any;
  if (!h0 || h0.from !== uid) throw new HttpError(404, "xfer_not_found");
  const r = await db().ref(`xfer_hold/${id}/st`).transaction((c: string | null) => (c === "held" ? "cancelling" : undefined));
  if (!r.committed) throw new HttpError(409, "xfer_not_cancellable");
  await credit(uid, h0.asset, h0.total, "refund");
  await db().ref().update({ [`xfer_hold/${id}/st`]: "cancelled", [`user_xfers/${uid}/${id}/st`]: "cancelled" });
  await db().ref(`${h0.asset === "usdt" ? "send_daily_u" : "send_daily"}/${uid}/${dayKey(h0.at)}`).transaction((c: number | null) => Math.max(0, (c || 0) - h0.total)).catch(() => {});
  await activity(uid, "adjust", { ...(h0.asset === "usdt" ? { usdt_u: h0.total } : { coins: h0.total }), note: "Transfer cancelled — refunded" });
  await notify(h0.to, `↩️ The pending transfer from ${maskName(h0.from_name)} was cancelled.`).catch(() => {});
}
/** cron: release holds whose time has come */
export async function releaseDueHolds(s: Settings): Promise<number> {
  const all = ((await db().ref("xfer_hold").get()).val() || {}) as Record<string, any>;
  let n = 0;
  for (const [id, h] of Object.entries(all)) if (h.st === "held" && h.rel <= Date.now() && (await releaseHold(id, s))) n++;
  return n;
}

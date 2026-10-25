import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { sortableId, sha256, randomToken } from "./crypto";
import { getRefCode } from "./refcode";
import { getCfg2 } from "./cfg2";
import { Settings } from "./settings";
import { notify } from "./notify";
import { activity } from "./wallet";
import { mailMoney } from "./moneymail";
import { seal, open } from "./secretbox";
import { assertCanMoveMoney } from "./freeze";
import { dayKey } from "./log";
import { Asset, amtStr, credit, debit, displayName, feeFor, maskName, minFor, reserveDaily, xferIndex, makeTxid } from "./transfer";

const link = (s: Settings, p: string) => (s.referral_link ? `${s.referral_link}?startapp=${p}` : "");

/* ───────────── Payment requests: "please pay me X" ───────────── */
export interface PayReq { to: string; asset: Asset; amount: number; note: string; at: number; exp: number; st: "open" | "paying" | "paid" | "cancelled"; by?: string; tx?: string }

export async function createRequest(uid: string, asset: Asset, amount: number, note: string, s: Settings) {
  const c = await getCfg2();
  if (!c.xfer.links.request) throw new HttpError(403, "feature_off");
  if (asset === "usdt" ? !c.xfer.usdt.enabled : !s.send_enabled) throw new HttpError(403, "send_disabled");
  if (!Number.isInteger(amount) || amount < (await minFor(asset, s))) throw new HttpError(400, "send_min");
  const mine = ((await db().ref(`user_reqs/${uid}`).get()).val() || {}) as Record<string, any>;
  if (Object.values(mine).filter((r: any) => r.st === "open" && r.exp > Date.now()).length >= 20) throw new HttpError(429, "too_many_requests");
  const id = randomToken().slice(0, 14);
  const now = Date.now();
  const rec: PayReq = { to: uid, asset, amount, note: note.replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 60), at: now, exp: now + c.xfer.links.days * 86400000, st: "open" };
  await db().ref().update({ [`pay_requests/${id}`]: rec, [`user_reqs/${uid}/${id}`]: { asset, amount, note: rec.note, at: now, exp: rec.exp, st: "open" } });
  return { id, url: link(s, `req_${id}`), exp: rec.exp };
}
export async function getRequest(id: string) {
  if (!/^[A-Za-z0-9]{6,20}$/.test(id)) throw new HttpError(404, "request_not_found");
  const r = (await db().ref(`pay_requests/${id}`).get()).val() as PayReq | null;
  if (!r) throw new HttpError(404, "request_not_found");
  const st = r.st === "open" && r.exp <= Date.now() ? "expired" : r.st;
  return { id, ...r, st, name: await displayName(r.to), code: await getRefCode(r.to).catch(() => "") };
}
/** claim the request for payment (open → paying). Returns the record; call reqDone after the payment attempt */
export async function reqHold(id: string, payer: string): Promise<PayReq> {
  const r0 = (await db().ref(`pay_requests/${id}`).get()).val() as PayReq | null;
  if (!r0) throw new HttpError(404, "request_not_found");
  if (r0.to === payer) throw new HttpError(400, "send_self");
  const t = await db().ref(`pay_requests/${id}`).transaction((c: PayReq | null) => {
    if (c === null) return c;
    if (c.st !== "open" || c.exp <= Date.now()) return;
    c.st = "paying"; c.by = payer;
    return c;
  });
  if (!t.committed) throw new HttpError(409, "request_closed");
  return r0;
}
export async function reqDone(id: string, ok: boolean, txid = "") {
  const r = (await db().ref(`pay_requests/${id}`).get()).val() as PayReq | null;
  if (!r) return;
  const st = ok ? "paid" : "open";
  await db().ref().update({ [`pay_requests/${id}/st`]: st, [`pay_requests/${id}/tx`]: txid, [`user_reqs/${r.to}/${id}/st`]: st });
  if (ok) await notify(r.to, `✅ Your payment request of ${amtStr(r.asset, r.amount, 1000)} was paid.`).catch(() => {});
}
export async function cancelRequest(uid: string, id: string) {
  const r = (await db().ref(`pay_requests/${id}`).get()).val() as PayReq | null;
  if (!r || r.to !== uid) throw new HttpError(404, "request_not_found");
  const t = await db().ref(`pay_requests/${id}/st`).transaction((c: string | null) => (c === "open" ? "cancelled" : undefined));
  if (!t.committed) throw new HttpError(409, "request_closed");
  await db().ref(`user_reqs/${uid}/${id}/st`).set("cancelled");
}
export async function listRequests(uid: string, s: Settings) {
  const m = ((await db().ref(`user_reqs/${uid}`).get()).val() || {}) as Record<string, any>;
  return Object.entries(m).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30).map(([id, r]) => ({ id, ...r, st: r.st === "open" && r.exp <= Date.now() ? "expired" : r.st, url: link(s, `req_${id}`) }));
}

/* ───────────── Claim links: "I send you X — whoever opens this link first claims it" ───────────── */
interface ClaimRec { from: string; from_name: string; asset: Asset; amount: number; fee: number; total: number; note: string; at: number; exp: number; st: "open" | "claiming" | "claimed" | "cancelled" | "expired"; by?: string; tok: string }
const hashTok = (t: string) => sha256("claim:" + t).slice(0, 24);

export async function createLink(from: { id: string; name: string }, asset: Asset, amount: number, note: string, s: Settings) {
  const c = await getCfg2();
  if (!c.xfer.links.claim) throw new HttpError(403, "feature_off");
  if (asset === "usdt" ? !c.xfer.usdt.enabled : !s.send_enabled) throw new HttpError(403, "send_disabled");
  await assertCanMoveMoney(from.id, s);
  if (!Number.isInteger(amount) || amount < (await minFor(asset, s))) throw new HttpError(400, "send_min");
  const open_ = ((await db().ref(`user_links/${from.id}`).get()).val() || {}) as Record<string, any>;
  if (Object.values(open_).filter((r: any) => r.st === "open").length >= 10) throw new HttpError(429, "too_many_links");
  const { fee } = await feeFor(from.id, asset, amount, s);
  const total = amount + fee;
  const now = Date.now();
  const unreserve = await reserveDaily(from.id, asset, total, s, now);
  try { await debit(from.id, asset, total, s, now, true); } catch (e) { await unreserve(); throw e; }
  const tok = randomToken().replace(/[^A-Za-z0-9]/g, "").slice(0, 20);
  const id = hashTok(tok);
  const cleanNote = note.replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 60);
  const rec: ClaimRec = { from: from.id, from_name: from.name, asset, amount, fee, total, note: cleanNote, at: now, exp: now + c.xfer.links.days * 86400000, st: "open", tok: seal(tok) };
  try {
    await db().ref().update({ [`claim_links/${id}`]: rec, [`user_links/${from.id}/${id}`]: { asset, amount, fee, note: cleanNote, at: now, exp: rec.exp, st: "open", tok: rec.tok } });
  } catch (e) {
    await credit(from.id, asset, total, "refund").catch((e2) => console.error("LINK REFUND FAILED", from.id, total, e2));
    await unreserve();
    throw new HttpError(500, "send_failed");
  }
  await activity(from.id, "send", { ...(asset === "usdt" ? { usdt_u: -total } : { coins: -total }), note: "Money link created" });
  return { id, url: link(s, `claim_${tok}`), token: tok, exp: rec.exp, fee, total };
}
export async function peekLink(tok: string) {
  if (!/^[A-Za-z0-9]{20}$/.test(tok)) throw new HttpError(404, "link_not_found");
  const r = (await db().ref(`claim_links/${hashTok(tok)}`).get()).val() as ClaimRec | null;
  if (!r) throw new HttpError(404, "link_not_found");
  const st = r.st === "open" && r.exp <= Date.now() ? "expired" : r.st;
  return { asset: r.asset, amount: r.amount, note: r.note, st, from: maskName(await displayName(r.from)), exp: r.exp };
}
export async function claimLink(uid: string, tok: string, s: Settings) {
  if (!/^[A-Za-z0-9]{20}$/.test(tok)) throw new HttpError(404, "link_not_found");
  const id = hashTok(tok);
  const r0 = (await db().ref(`claim_links/${id}`).get()).val() as ClaimRec | null;
  if (!r0) throw new HttpError(404, "link_not_found");
  if (r0.from === uid) throw new HttpError(400, "claim_own");
  if (((await db().ref(`users/${uid}/banned`).get()).val())) throw new HttpError(403, "send_no_user");
  const t = await db().ref(`claim_links/${id}`).transaction((c: ClaimRec | null) => {
    if (c === null) return c;
    if (c.st !== "open" || c.exp <= Date.now()) return;
    c.st = "claiming"; c.by = uid;
    return c;
  });
  if (!t.committed) throw new HttpError(409, "claim_closed");
  const now = Date.now();
  const txid = makeTxid(id, r0.from, uid, r0.amount, now);
  const [toName, toCode, fromCode] = await Promise.all([displayName(uid), getRefCode(uid).catch(() => ""), getRefCode(r0.from).catch(() => "")]);
  try {
    await db().ref().update({
      ...(r0.asset === "usdt" ? { [`users/${uid}/usdt_u`]: ServerValue.increment(r0.amount), [`users/${uid}/usdt_tot/received`]: ServerValue.increment(r0.amount), "stats/send_fees_u": ServerValue.increment(r0.fee), "stats/send_volume_u": ServerValue.increment(r0.amount) }
        : { [`users/${uid}/balance`]: ServerValue.increment(r0.amount), [`users/${uid}/earn/received`]: ServerValue.increment(r0.amount), "stats/send_fees": ServerValue.increment(r0.fee), "stats/send_volume": ServerValue.increment(r0.amount) }),
      [`claim_links/${id}/st`]: "claimed", [`user_links/${r0.from}/${id}/st`]: "claimed",
      [`transfer_tx/${txid}`]: id,
      [`transfers/${id}`]: { from: r0.from, to: uid, asset: r0.asset, amount: r0.amount, fee: r0.fee, note: r0.note, at: now, txid, link: true },
      ...xferIndex(r0.from, id, { d: "out", a: r0.asset, amt: r0.amount, fee: r0.fee, peer: toName, pc: toCode, tx: txid, at: r0.at, n: r0.note, st: "claimed" }),
      ...xferIndex(uid, id, { d: "in", a: r0.asset, amt: r0.amount, fee: 0, peer: maskName(r0.from_name), pc: fromCode, tx: txid, at: now, n: r0.note, st: "done" }),
    });
  } catch (e) {
    console.error("claim failed", id, e);
    await db().ref(`claim_links/${id}/st`).set("open");
    throw new HttpError(500, "send_failed");
  }
  const cpt = s.coins_per_tfuel;
  await activity(uid, "receive", { ...(r0.asset === "usdt" ? { usdt_u: r0.amount } : { coins: r0.amount }), note: `From ${maskName(r0.from_name)} (link) · ${txid}` });
  await notify(r0.from, `🎁 ${maskName(toName)} claimed your money link (${amtStr(r0.asset, r0.amount, cpt)}).`).catch(() => {});
  await mailMoney(uid, "received", [["Status", "Completed"], ["Amount", amtStr(r0.asset, r0.amount, cpt)], ["From", maskName(r0.from_name)], ["Transaction hash", txid]]);
  await mailMoney(r0.from, "sent", [["Status", "Claimed by receiver"], ["Amount", amtStr(r0.asset, r0.amount, cpt)], ["Fee", amtStr(r0.asset, r0.fee, cpt)], ["Receiver", toName], ["Transaction hash", txid]]);
  return { asset: r0.asset, amount: r0.amount, from: maskName(r0.from_name), txid, at: now };
}
async function refundLink(id: string, to: "cancelled" | "expired") {
  const r = (await db().ref(`claim_links/${id}`).get()).val() as ClaimRec | null;
  if (!r) return false;
  const t = await db().ref(`claim_links/${id}/st`).transaction((c: string | null) => (c === "open" ? "refunding" : undefined));
  if (!t.committed) return false;
  await credit(r.from, r.asset, r.total, "refund");
  await db().ref().update({ [`claim_links/${id}/st`]: to, [`user_links/${r.from}/${id}/st`]: to });
  await db().ref(`${r.asset === "usdt" ? "send_daily_u" : "send_daily"}/${r.from}/${dayKey(r.at)}`).transaction((c: number | null) => Math.max(0, (c || 0) - r.total)).catch(() => {});
  await activity(r.from, "adjust", { ...(r.asset === "usdt" ? { usdt_u: r.total } : { coins: r.total }), note: to === "expired" ? "Money link expired — refunded" : "Money link cancelled — refunded" });
  if (to === "expired") await notify(r.from, "⌛ Your money link expired unclaimed. The full amount is back in your wallet.").catch(() => {});
  return true;
}
export async function cancelLink(uid: string, id: string) {
  const r = (await db().ref(`claim_links/${id}`).get()).val() as ClaimRec | null;
  if (!r || r.from !== uid) throw new HttpError(404, "link_not_found");
  if (!(await refundLink(id, "cancelled"))) throw new HttpError(409, "claim_closed");
}
export async function expireLinks(): Promise<number> {
  const all = ((await db().ref("claim_links").get()).val() || {}) as Record<string, ClaimRec>;
  let n = 0;
  for (const [id, r] of Object.entries(all)) if (r.st === "open" && r.exp <= Date.now() && (await refundLink(id, "expired"))) n++;
  return n;
}
export async function listLinks(uid: string, s: Settings) {
  const m = ((await db().ref(`user_links/${uid}`).get()).val() || {}) as Record<string, any>;
  return Object.entries(m).sort((a, b) => b[1].at - a[1].at).slice(0, 30).map(([id, r]) => {
    const tok = r.st === "open" ? open(String(r.tok || "")) : null;
    return { id, asset: r.asset, amount: r.amount, fee: r.fee, note: r.note, at: r.at, exp: r.exp, st: r.st === "open" && r.exp <= Date.now() ? "expired" : r.st, url: tok ? link(s, `claim_${tok}`) : "" };
  });
}

/* ───────────── History + contacts ───────────── */
export async function listXfers(uid: string, limit = 100) {
  const m = ((await db().ref(`user_xfers/${uid}`).get()).val() || {}) as Record<string, any>;
  return Object.entries(m).sort((a, b) => (b[1].at - a[1].at) || b[0].localeCompare(a[0])).slice(0, limit).map(([id, r]) => ({ id, ...r }));
}
export interface Contact { name: string; label: string; at: number }
export async function listContacts(uid: string) {
  const m = ((await db().ref(`contacts/${uid}`).get()).val() || {}) as Record<string, Contact>;
  return Object.entries(m).sort((a, b) => b[1].at - a[1].at).map(([code, c]) => ({ code, ...c }));
}
export async function saveContact(uid: string, code: string, label: string) {
  if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new HttpError(400, "send_bad_code");
  const to = (await db().ref(`ref_codes/${code}`).get()).val();
  if (typeof to !== "string" || to === uid) throw new HttpError(404, "send_no_user");
  const all = ((await db().ref(`contacts/${uid}`).get()).val() || {}) as Record<string, any>;
  if (!all[code] && Object.keys(all).length >= 50) throw new HttpError(429, "too_many_contacts");
  const name = await displayName(to);
  const lb = label.replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 24);
  await db().ref(`contacts/${uid}/${code}`).set({ name, label: lb, at: Date.now() });
}
export async function deleteContact(uid: string, code: string) {
  if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new HttpError(400, "send_bad_code");
  await db().ref(`contacts/${uid}/${code}`).remove();
}

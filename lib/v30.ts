import crypto from "crypto";
import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2, type Xchg } from "./cfg2";
import { getSettings, type Settings } from "./settings";
import { sortableId, sha256, randomToken } from "./crypto";
import { dayKey } from "./log";
import { notify } from "./notify";
import { activity, weekIndex } from "./wallet";
import { U } from "./market";
import { Asset, debit, credit, feeFor, minFor, maskName, reserveDaily, xferIndex, makeTxid } from "./transfer";
import { assertCanMoveMoney } from "./freeze";
import { resolveRef } from "./refcode";
import { esc } from "./botviews";
import type { View } from "./botviews";

const val = async (p: string) => (await db().ref(p).get()).val();
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);
const link = (s: Settings, p: string) => (s.referral_link ? `${s.referral_link}?startapp=${p}` : "");

/* ───────── 1. red packet: one amount, N people, random (or equal) shares ───────── */
export function splitAmount(total: number, n: number, min: number, random: boolean): number[] {
  if (n * min > total) throw new HttpError(400, "send_min");
  if (!random) { const b = Math.floor(total / n); const a = Array(n).fill(b); a[0] += total - b * n; return a; }
  const extra = total - n * min;
  const cuts = Array.from({ length: n - 1 }, () => Math.floor(Math.random() * (extra + 1))).sort((a, b) => a - b);
  const out: number[] = [];
  let prev = 0;
  for (const c of [...cuts, extra]) { out.push(min + c - prev); prev = c; }
  return out.sort(() => Math.random() - 0.5);
}
export async function packetNew(from: { id: string; name: string }, b: any, s: Settings) {
  const cfg = await getCfg2(), pc = cfg.v30.packet;
  if (!pc.on) throw new HttpError(403, "feature_off:Red packets are off.");
  const asset: Asset = b?.asset === "usdt" ? "usdt" : "tfuel";
  if (asset === "usdt" ? !cfg.xfer.usdt.enabled : !s.send_enabled) throw new HttpError(403, "send_disabled");
  await assertCanMoveMoney(from.id, s);
  const n = Math.floor(Number(b?.n));
  if (!(n >= 2 && n <= pc.max_n)) throw new HttpError(400, `People: 2 to ${pc.max_n}.`);
  const total = Math.round(Number(b?.amount) * (asset === "usdt" ? U : s.coins_per_tfuel));
  const min = await minFor(asset, s);
  if (!(total >= n * min)) throw new HttpError(400, "send_min");
  const open = Object.values(((await val(`user_packets/${from.id}`)) || {}) as Record<string, any>).filter((r: any) => r.st === "open");
  if (open.length >= 5) throw new HttpError(429, "You already have 5 open red packets.");
  const hours = Math.max(1, Math.min(pc.max_hours, Math.floor(Number(b?.hours)) || 24));
  const { fee } = await feeFor(from.id, asset, total, s);
  const all = total + fee, now = Date.now();
  const unreserve = await reserveDaily(from.id, asset, all, s, now);
  try { await debit(from.id, asset, all, s, now, true); } catch (e) { await unreserve(); throw e; }
  const tok = randomToken().replace(/[^A-Za-z0-9]/g, "").slice(0, 16);
  const rec = { from: from.id, name: clean(from.name, 20), asset, total, fee, n, idx: 0, parts: splitAmount(total, n, min, b?.mode !== "equal"), mode: b?.mode === "equal" ? "equal" : "random", note: clean(b?.note, 60), at: now, exp: now + hours * 3600000, st: "open" };
  try {
    await db().ref().update({ [`packets/${tok}`]: rec, [`user_packets/${from.id}/${tok}`]: { asset, total, n, note: rec.note, at: now, exp: rec.exp, st: "open" } });
  } catch (e) {
    await credit(from.id, asset, all, "refund").catch(() => {});
    await unreserve();
    throw new HttpError(500, "send_failed");
  }
  await activity(from.id, "send", { ...(asset === "usdt" ? { usdt_u: -all } : { coins: -all }), note: "Red packet created" });
  return { tok, url: link(s, `rp_${tok}`), exp: rec.exp, fee };
}
const packetPub = (tok: string, r: any, uid: string) => ({
  tok, from: maskName(r.name), note: r.note, asset: r.asset, total: r.total, n: r.n, left: r.n - (r.idx || 0), exp: r.exp, st: r.st, mode: r.mode,
  mine: r.claims?.[uid] ? { amt: r.claims[uid] } : null,
  claims: Object.values((r.claims_v || {}) as Record<string, any>).slice(0, 50),
});
export async function packetPeek(uid: string, tok: string) {
  if (!/^[A-Za-z0-9]{10,24}$/.test(tok)) throw new HttpError(400, "bad_request");
  const r = await val(`packets/${tok}`);
  if (!r) throw new HttpError(404, "This red packet doesn't exist.");
  return packetPub(tok, r, uid);
}
export async function packetClaim(uid: string, name: string, tok: string, s: Settings) {
  if (!/^[A-Za-z0-9]{10,24}$/.test(tok)) throw new HttpError(400, "bad_request");
  const u = (await val(`users/${uid}`)) as any;
  if (!u || u.banned) throw new HttpError(403, "send_no_user");
  let why = "", got = 0, last = false;
  await db().ref(`packets/${tok}`).transaction((cur: any) => {
    why = ""; got = 0; last = false;
    if (cur === null) return cur;
    if (cur.from === uid) { why = "You can't open your own red packet."; return; }
    if (cur.st !== "open" || cur.exp < Date.now()) { why = "This red packet is finished."; return; }
    if (cur.claims && cur.claims[uid]) { why = "You already opened this red packet."; return; }
    if ((cur.idx || 0) >= cur.n) { why = "All shares are taken."; return; }
    got = cur.parts[cur.idx];
    cur.claims = { ...(cur.claims || {}), [uid]: got };
    cur.claims_v = { ...(cur.claims_v || {}), [sha256("rp:" + uid).slice(0, 8)]: { who: maskName(name || "User"), amt: got } };
    cur.idx = (cur.idx || 0) + 1;
    if (cur.idx >= cur.n) { cur.st = "done"; last = true; }
    return cur;
  });
  if (why) throw new HttpError(409, why);
  if (!got) throw new HttpError(404, "This red packet doesn't exist.");
  const r = (await val(`packets/${tok}`)) as any;
  const asset: Asset = r.asset;
  const now = Date.now(), id = sortableId();
  const txid = makeTxid(id, r.from, uid, got, now);
  await db().ref().update({
    ...(asset === "usdt" ? { [`users/${uid}/usdt_u`]: ServerValue.increment(got), [`users/${uid}/usdt_tot/received`]: ServerValue.increment(got) } : { [`users/${uid}/balance`]: ServerValue.increment(got), [`users/${uid}/earn/received`]: ServerValue.increment(got) }),
    ...xferIndex(uid, id, { d: "in", a: asset, amt: got, fee: 0, peer: maskName(r.name), pc: "", tx: txid, at: now, n: "Red packet", st: "claimed" }),
  });
  await activity(uid, "receive", { ...(asset === "usdt" ? { usdt_u: got } : { coins: got }), note: `Red packet from ${maskName(r.name)}` });
  if (last) await notify(r.from, "🧧 Your red packet was fully opened. Thanks for sharing!").catch(() => {});
  return { amt: got, asset, packet: packetPub(tok, r, uid) };
}
/** sender closes it (or it expired): unopened shares go back to the sender */
export async function packetClose(tok: string, who: string | null, reason: "closed" | "expired" = "closed") {
  const r = (await val(`packets/${tok}`)) as any;
  if (!r || (who && r.from !== who)) throw new HttpError(404, "not_found");
  const t = await db().ref(`packets/${tok}/st`).transaction((cur: string | null) => (cur === "open" ? "closing" : undefined));
  if (!t.committed) throw new HttpError(409, "This red packet is already finished.");
  const fresh = (await val(`packets/${tok}`)) as any;
  const back = (fresh.parts as number[]).slice(fresh.idx || 0).reduce((a, b) => a + b, 0);
  await db().ref().update({ [`packets/${tok}/st`]: reason, [`user_packets/${r.from}/${tok}/st`]: reason,
    ...(back > 0 ? (r.asset === "usdt" ? { [`users/${r.from}/usdt_u`]: ServerValue.increment(back), [`users/${r.from}/usdt_tot/sent`]: ServerValue.increment(-back) } : { [`users/${r.from}/balance`]: ServerValue.increment(back) }) : {}) });
  if (back > 0) await activity(r.from, "adjust", { ...(r.asset === "usdt" ? { usdt_u: back } : { coins: back }), note: "Red packet leftover returned" });
  return back;
}
export async function packetList(uid: string) {
  const m = ((await val(`user_packets/${uid}`)) || {}) as Record<string, any>;
  return Object.entries(m).map(([tok, r]) => ({ tok, ...r })).sort((a, b) => b.at - a.at).slice(0, 20);
}
export async function runPackets(now = Date.now()) {
  const all = ((await val("packets")) || {}) as Record<string, any>;
  let n = 0;
  for (const [tok, r] of Object.entries(all)) if (r.st === "open" && r.exp <= now) { try { await packetClose(tok, null, "expired"); n++; } catch {} }
  return n;
}

/* ───────── 3. exchange open hours ───────── */
export function xOpen(c: Xchg, now = Date.now()): { open: boolean; text: string } {
  if (!c.hours_on) return { open: true, text: "" };
  const h = (((now / 3600000 + c.tz_h) % 24) + 24) % 24;
  const open = c.hours_from < c.hours_to ? h >= c.hours_from && h < c.hours_to : h >= c.hours_from || h < c.hours_to;
  const f = (x: number) => `${String(x % 24).padStart(2, "0")}:00`;
  return { open, text: `Exchange is open ${f(c.hours_from)}–${f(c.hours_to)} (UTC${c.tz_h >= 0 ? "+" : ""}${c.tz_h}).` };
}

/* ───────── 5/6. merchant items & coupons ───────── */
export async function catalogGet(uid: string) {
  const m = ((await val(`merchants/${uid}`)) || {}) as any;
  const items = (Array.isArray(m.items) ? m.items : Object.values(m.items || {})) as any[];
  const cps = (Array.isArray(m.coupons) ? m.coupons : Object.values(m.coupons || {})) as any[];
  return { items: items.map((x) => ({ name: String(x.name), price: Number(x.price) })), coupons: cps.map((x) => ({ code: String(x.code), pct: Number(x.pct), uses: Number(x.uses) || 0, used: Number(m.cpn_used?.[x.code]) || 0 })) };
}
export async function catalogSet(uid: string, b: any) {
  if (!(await getCfg2()).v24.merchant) throw new HttpError(403, "feature_off:Merchant QR is turned off.");
  if (!(await val(`merchants/${uid}/name`))) throw new HttpError(400, "Save your shop first.");
  const items = (Array.isArray(b?.items) ? b.items : []).slice(0, 12).map((x: any) => ({ name: clean(x?.name, 30), price: Math.max(0, Math.round(Number(x?.price) * 1e6) / 1e6) })).filter((x: any) => x.name && x.price > 0);
  const coupons = (Array.isArray(b?.coupons) ? b.coupons : []).slice(0, 8).map((x: any) => ({ code: String(x?.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10), pct: Math.max(1, Math.min(90, Math.floor(Number(x?.pct)) || 0)), uses: Math.max(0, Math.min(100000, Math.floor(Number(x?.uses)) || 0)) })).filter((x: any) => x.code.length >= 3 && x.pct > 0);
  const seen = new Set<string>();
  const cps = coupons.filter((x: any) => (seen.has(x.code) ? false : (seen.add(x.code), true)));
  await db().ref(`merchants/${uid}`).update({ items, coupons: cps });
  return catalogGet(uid);
}
/** customer side: items + whether coupons exist; and a coupon check */
export async function catalogPub(code: string) {
  const uid = await resolveRef(code);
  if (!uid) return { items: [], coupons: false };
  const c = await catalogGet(uid);
  return { items: c.items, coupons: c.coupons.length > 0 };
}
export async function cpnCheck(code: string, cpn: string) {
  const uid = await resolveRef(code);
  if (!uid) throw new HttpError(404, "Shop not found.");
  const c = (await catalogGet(uid)).coupons.find((x) => x.code === String(cpn || "").toUpperCase().replace(/[^A-Z0-9]/g, ""));
  if (!c || (c.uses > 0 && c.used >= c.uses)) throw new HttpError(404, "This coupon isn't valid.");
  return { code: c.code, pct: c.pct };
}
/** called from merchantSale: note carries "CPN:CODE" */
export async function cpnApplied(uid: string, note: string) {
  const m = /CPN:([A-Z0-9]{3,10})/.exec(note || "");
  if (!m) return "";
  const c = (await catalogGet(uid)).coupons.find((x) => x.code === m[1]);
  if (!c || (c.uses > 0 && c.used >= c.uses)) return "";
  await db().ref(`merchants/${uid}/cpn_used/${c.code}`).transaction((cur: number | null) => (cur || 0) + 1);
  return `${c.code} -${c.pct}%`;
}

/* ───────── 7. top traders of the week ───────── */
export async function xTop(uid: string) {
  const m = ((await val(`xchg_week/${weekIndex()}`)) || {}) as Record<string, number>;
  const all = Object.entries(m).sort((a, b) => b[1] - a[1]);
  const top = [];
  for (const [id, v] of all.slice(0, 10)) top.push({ rank: top.length + 1, name: maskName(String((await val(`users/${id}/name`)) || "User")), usdt: Math.round((v / U) * 100) / 100, me: id === uid });
  const i = all.findIndex(([k]) => k === uid);
  return { top, me: i >= 0 ? { rank: i + 1, usdt: Math.round((all[i][1] / U) * 100) / 100 } : null };
}
export const xTopAdd = (uid: string, usdt_u: number) => db().ref(`xchg_week/${weekIndex()}/${uid}`).transaction((cur: number | null) => (cur || 0) + usdt_u);

/* ───────── 10. rate alerts ───────── */
export async function xAlertList(uid: string) {
  const m = ((await val(`xalerts/${uid}`)) || {}) as Record<string, any>;
  return Object.entries(m).map(([id, a]) => ({ id, ...a })).sort((a, b) => b.at - a.at);
}
export async function xAlertAdd(uid: string, b: any) {
  const kind = b?.kind === "sell" ? "sell" : "buy";
  const op = b?.op === "lte" ? "lte" : "gte";
  const target = Math.round(Number(b?.target) * 100) / 100;
  if (!(target > 0)) throw new HttpError(400, "Enter the rate.");
  if (Object.keys(((await val(`xalerts/${uid}`)) || {}) as object).length >= 5) throw new HttpError(429, "You can keep 5 rate alerts.");
  await db().ref().update({ [`xalerts/${uid}/${sortableId()}`]: { kind, op, target, at: Date.now() }, [`xalert_users/${uid}`]: true });
  return xAlertList(uid);
}
export async function xAlertDel(uid: string, id: string) {
  await db().ref(`xalerts/${uid}/${id}`).set(null);
  if (!(await xAlertList(uid)).length) await db().ref(`xalert_users/${uid}`).set(null);
  return xAlertList(uid);
}
export async function runXAlerts() {
  const { xc } = await import("./v27");
  const c = await xc();
  if (!c.on) return 0;
  const ids = Object.keys(((await val("xalert_users")) || {}) as Record<string, any>).slice(0, 500);
  let n = 0;
  for (const uid of ids) {
    for (const a of await xAlertList(uid)) {
      const rate = a.kind === "buy" ? c.rate_buy : c.rate_sell;
      if (!(rate > 0)) continue;
      if (a.op === "gte" ? rate >= a.target : rate <= a.target) {
        await xAlertDel(uid, a.id);
        await notify(uid, `💱 Rate alert: you can now ${a.kind} USDT at ${rate} ${c.cur} (your target: ${a.op === "gte" ? "≥" : "≤"} ${a.target}). Open the app → Exchange.`).catch(() => {});
        n++;
      }
    }
  }
  return n;
}

/* ───────── 2. admin buttons in the bot for Exchange orders ───────── */
export const xoKb = (id: string, kind: "buy" | "sell") => [kind === "sell" ? [{ text: "💸 I am paying", callback_data: `xp:${id}` }, { text: "✅ Done", callback_data: `xd:${id}` }, { text: "❌ Reject", callback_data: `xr:${id}` }] : [{ text: "✅ Payment received", callback_data: `xd:${id}` }, { text: "❌ Reject", callback_data: `xr:${id}` }]];
export async function xoBot(adminId: string, step: string, id: string): Promise<View> {
  const { xAdminSet } = await import("./v27");
  const o = (await val(`xorders/${id}`)) as any;
  if (!o) return { text: "That order doesn't exist.", kb: [] };
  const line = `${o.kind === "buy" ? "BUY" : "SELL"} ${o.usdt_u / U} USDT ↔ ${o.fiat} ${o.cur}\n${esc(o.name)} (${o.uid}) · ${esc(o.mname)}${o.ref ? `\nRef: <b>${esc(o.ref)}</b>` : ""}${o.acct ? `\nPay to: <b>${esc(o.acct)}</b>` : ""}\nStatus: <b>${o.st}</b>`;
  if (step === "xd" || step === "xr") {
    const done = step === "xd";
    return { text: `${done ? (o.kind === "buy" ? "✅ Mark as DONE? This adds the USDT to the user's balance. Only confirm after the money reached you." : "✅ Mark as DONE? Only confirm after you sent the money.") : "❌ REJECT this order? Held USDT is returned to the user."}\n\n${line}`, kb: [[{ text: "Yes, confirm", callback_data: `${done ? "xD" : "xR"}:${id}` }, { text: "Cancel", callback_data: `xv:${id}` }]] };
  }
  if (step === "xv") return { text: line, kb: xoKb(id, o.kind) };
  const act = step === "xp" ? "paying" : step === "xD" ? "done" : "reject";
  try { await xAdminSet(id, act, "", `bot:${adminId}`); }
  catch (e: any) { return { text: `Couldn't do it: ${esc(e?.message || "error")}\n\n${line}`, kb: [] }; }
  return { text: act === "paying" ? "💸 Marked as paying. The user was notified." : act === "done" ? "✅ Done. The user was notified." : "↩️ Rejected. The user was notified.", kb: act === "paying" ? [[{ text: "✅ Done", callback_data: `xd:${id}` }, { text: "❌ Reject", callback_data: `xr:${id}` }]] : [] };
}

/* ───────── 9. /tip in groups ───────── */
export async function groupTip(tgFrom: { id: number | string; first_name?: string }, tgTo: { id: number | string; first_name?: string; is_bot?: boolean }, text: string): Promise<string> {
  const cfg = await getCfg2(), tp = cfg.v30.tip;
  if (!tp.on) return "";
  const amt = Number(/^\/tip(?:@\w+)?\s+(\d+(?:\.\d+)?)/i.exec(text.trim())?.[1]);
  if (!(amt > 0)) return "Use it like this: reply to someone with <code>/tip 10</code>";
  const from = String(tgFrom.id), to = String(tgTo.id);
  if (tgTo.is_bot || from === to) return "";
  const s = await getSettings();
  const fu = (await val(`users/${from}`)) as any, tu = (await val(`users/${to}`)) as any;
  if (!fu) return "Open the TFUEL app first to use /tip.";
  if (!(await val(`user_prefs/${from}/pv/gt`))) return "Turn on “Allow /tip in groups” in the app (Settings → Preferences) first.";
  if (!tu) return `${esc(tgTo.first_name || "That person")} hasn't joined the TFUEL app yet.`;
  if (amt > tp.max_tfuel) return `Tips are limited to ${tp.max_tfuel} TFUEL each.`;
  const coins = Math.round(amt * s.coins_per_tfuel);
  let over = false;
  await db().ref(`tip_day/${from}/${dayKey()}`).transaction((cur: number | null) => { over = false; const n = (cur || 0) + coins; if (n > Math.round(tp.day_max_tfuel * s.coins_per_tfuel)) { over = true; return; } return n; });
  if (over) return `Daily tip limit reached (${tp.day_max_tfuel} TFUEL).`;
  try {
    const { sendAsset } = await import("./transfer");
    await sendAsset({ id: from, name: String(fu.name || tgFrom.first_name || "User") }, to, "tfuel", coins, s, "Group tip");
  } catch (e: any) {
    await db().ref(`tip_day/${from}/${dayKey()}`).transaction((cur: number | null) => Math.max(0, (cur || 0) - coins));
    const m = String(e?.message || "");
    return m === "insufficient" ? "Not enough balance for that tip." : m === "recipient_blocks" || m === "send_no_user" ? "That person can't receive tips." : "Couldn't send the tip right now.";
  }
  return `💸 <b>${esc(tgFrom.first_name || "Someone")}</b> tipped <b>${esc(tgTo.first_name || "a friend")}</b> ${amt} TFUEL!`;
}

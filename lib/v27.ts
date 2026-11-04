import crypto from "crypto";
import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2, type Xchg, type XMethod } from "./cfg2";
import { getSettings } from "./settings";
import { sortableId, sha256 } from "./crypto";
import { dayKey } from "./log";
import { notify } from "./notify";
import { activity } from "./wallet";
import { alertAdmins } from "./adminalert";
import { assertCanMoveMoney } from "./freeze";
import { xCalc } from "./xcalc";
import { U } from "./market";
import { appBase } from "./mailtpl";

const val = async (p: string) => (await db().ref(p).get()).val();
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);
const key = () => sha256("card:" + (process.env.BOT_TOKEN || "dev"));
const sig = (s: string) => crypto.createHmac("sha256", key()).update(s).digest("hex").slice(0, 20);
const r2 = (n: number) => Math.round(n * 100) / 100;

export type XSt = "await" | "pending" | "paying" | "closing" | "done" | "rejected" | "cancelled" | "expired";
export interface XOrder {
  uid: string; name: string; kind: "buy" | "sell"; method: string; mname: string; usdt_u: number; fiat: number; rate: number; fee_fiat: number; cur: string;
  st: XSt; at: number; lock_until: number; acct?: string; ref?: string; note?: string; tl: Record<string, { s: string; at: number }>; by?: string;
}
const OPEN: XSt[] = ["await", "pending", "paying", "closing"];
const LABEL: Record<string, string> = { await: "Waiting for your payment", pending: "Sent to admin for checking", paying: "Admin is paying now", closing: "Finishing…", done: "Completed", rejected: "Rejected", cancelled: "Cancelled", expired: "Expired" };

/* ───────── view & settings ───────── */
export const methodFor = (c: Xchg, id: string, kind: "buy" | "sell") => c.methods.find((m) => m.id === id && (m.kind === "both" || m.kind === kind));
const pubCfg = (c: Xchg) => ({
  on: c.on, buy_on: c.buy_on && c.rate_buy > 0, sell_on: c.sell_on && c.rate_sell > 0, cur: c.cur, rate_buy: c.rate_buy, rate_sell: c.rate_sell, lock_min: c.lock_min, terms: c.terms,
  methods: c.methods.map((m) => ({ id: m.id, name: m.name, kind: m.kind, min: m.min, max: m.max, fee_pct: m.fee_pct })),
});
/** approximate local value shown next to USDT balances (display only) */
export async function xLocal() {
  const c = (await getCfg2()).xchg;
  const rate = c.rate_sell > 0 ? c.rate_sell : c.rate_buy;
  return c.on ? { cur: c.cur, rate: c.show_local && rate > 0 ? rate : 0 } : null;
}
export async function xStats(uid: string) {
  const c = (await getCfg2()).xchg;
  const s = ((await val(`xchg_stats/${uid}`)) || {}) as any;
  const done = Number(s.done) || 0, rej = Number(s.rej) || 0;
  return { done, rej, trusted: done >= c.trusted_after && rej === 0 };
}
const orderView = (id: string, o: XOrder, c: Xchg, withPay = false, trusted = false) => {
  const m = c.methods.find((x) => x.id === o.method);
  const tl = Object.values(o.tl || {}).sort((a, b) => a.at - b.at);
  return {
    id, kind: o.kind, method: o.method, mname: o.mname, usdt_u: o.usdt_u, fiat: o.fiat, rate: o.rate, fee_fiat: o.fee_fiat, cur: o.cur, st: o.st, label: LABEL[o.st] || o.st,
    at: o.at, lock_until: o.lock_until, ref: o.ref || "", acct: o.acct || "", tl, note: o.note || "",
    ...(withPay && o.kind === "buy" && (o.st === "await" || o.st === "pending") ? { pay: m?.details || "" } : {}),
    img: o.st === "done" ? xrcptUrl(id, o, trusted) : "",
  };
};
export function xrcptUrl(id: string, o: XOrder, trusted = false) {
  const d = Buffer.from(JSON.stringify({ i: id.slice(-8), k: o.kind, u: o.usdt_u, f: o.fiat, c: o.cur, m: o.mname.slice(0, 24), s: o.st, at: o.at, r: o.rate, t: trusted ? 1 : 0 })).toString("base64url");
  return `${appBase()}/api/xrcpt?d=${d}&s=${sig("x|" + d)}`;
}
export async function xView(uid: string) {
  const c = (await getCfg2()).xchg;
  const rows = ((await val(`user_xorders/${uid}`)) || {}) as Record<string, any>;
  const ids = Object.keys(rows).sort().reverse().slice(0, 15);
  const stats = await xStats(uid);
  const orders = (await Promise.all(ids.map(async (id) => { const o = (await val(`xorders/${id}`)) as XOrder | null; return o ? orderView(id, o, c, true, stats.trusted) : null; }))).filter(Boolean);
  const dayU = Number(await val(`xchg_daily/${uid}/${dayKey()}`)) || 0;
  return { cfg: pubCfg(c), stats, orders, daily_left: c.daily_max_usdt > 0 ? Math.max(0, r2(c.daily_max_usdt - dayU / U)) : null };
}

/* ───────── quote with rate lock ───────── */
function priceFor(c: Xchg, kind: "buy" | "sell", usdt: number, m: XMethod) {
  const rate = kind === "buy" ? c.rate_buy : c.rate_sell;
  if (!(rate > 0)) throw new HttpError(409, "Exchange rate isn't set yet. Please try later.");
  const x = xCalc({ kind, usdt, rate, fee_pct: m.fee_pct });
  return { rate, ...x };
}
function checkAmt(c: Xchg, m: XMethod, usdt: number) {
  if (!(usdt > 0)) throw new HttpError(400, "Enter an amount.");
  if (usdt < m.min) throw new HttpError(400, `Minimum for ${m.name} is ${m.min} USDT.`);
  if (m.max > 0 && usdt > m.max) throw new HttpError(400, `Maximum for ${m.name} is ${m.max} USDT.`);
}
function enabled(c: Xchg, kind: "buy" | "sell") {
  if (!c.on) throw new HttpError(403, "feature_off:Exchange is turned off.");
  if (kind === "buy" ? !c.buy_on : !c.sell_on) throw new HttpError(403, `feature_off:${kind === "buy" ? "Buying" : "Selling"} is paused right now.`);
}
export async function xQuote(uid: string, b: any) {
  const c = (await getCfg2()).xchg;
  const kind = b?.kind === "sell" ? "sell" : "buy";
  enabled(c, kind);
  const m = methodFor(c, String(b?.method || ""), kind);
  if (!m) throw new HttpError(400, "Pick a payment method.");
  const usdt = Math.round(Number(b?.usdt) * 100) / 100;
  checkAmt(c, m, usdt);
  const p = priceFor(c, kind, usdt, m);
  const exp = Date.now() + c.lock_min * 60000;
  const payload = [kind, m.id, Math.round(usdt * U), p.rate, p.fiat, p.fee, exp].join(":");
  return { token: `${payload}:${sig(`xq|${uid}|${payload}`)}`, exp, kind, method: m.id, mname: m.name, usdt, rate: p.rate, fiat: p.fiat, fee_fiat: p.fee, cur: c.cur };
}
function readToken(uid: string, token: string) {
  const a = String(token || "").split(":");
  if (a.length !== 8) throw new HttpError(400, "quote_bad");
  const payload = a.slice(0, 7).join(":");
  const good = sig(`xq|${uid}|${payload}`);
  if (a[7].length !== good.length || !crypto.timingSafeEqual(Buffer.from(a[7]), Buffer.from(good))) throw new HttpError(400, "quote_bad");
  const [kind, method, u, rate, fiat, fee, exp] = a;
  if (Number(exp) < Date.now()) throw new HttpError(409, "quote_expired");
  return { kind: kind as "buy" | "sell", method, usdt_u: Math.round(Number(u)), rate: Number(rate), fiat: Number(fiat), fee_fiat: Number(fee) };
}

/* ───────── orders ───────── */
async function tl(id: string, uid: string, s: XSt, extra: Record<string, any> = {}) {
  await db().ref().update({ [`xorders/${id}/tl/${sortableId()}`]: { s: LABEL[s] || s, at: Date.now() }, [`xorders/${id}/st`]: s, [`user_xorders/${uid}/${id}/st`]: s, ...extra });
}
export async function xPlace(uid: string, name: string, b: any) {
  const c = (await getCfg2()).xchg;
  const q = readToken(uid, String(b?.token || ""));
  enabled(c, q.kind);
  const m = methodFor(c, q.method, q.kind);
  if (!m) throw new HttpError(400, "This payment method is no longer available.");
  const usdt = q.usdt_u / U;
  checkAmt(c, m, usdt);
  const u = (await val(`users/${uid}`)) as any;
  if (!u || u.banned) throw new HttpError(403, "send_no_user");
  if (c.new_user_hours > 0 && Date.now() - (Number(u.created_at) || 0) < c.new_user_hours * 3600000) throw new HttpError(403, `New accounts can use Exchange after ${c.new_user_hours} hours.`);
  if (q.kind === "sell") {
    await assertCanMoveMoney(uid, await getSettings());
    await (await import("./v26")).assertKyc(uid, usdt);
  }
  const acct = clean(b?.acct, 120);
  if (q.kind === "sell" && acct.length < 4) throw new HttpError(400, "Write the account where you want to get paid (number / wallet).");
  const rows = Object.values(((await val(`user_xorders/${uid}`)) || {}) as Record<string, any>);
  if (rows.filter((r: any) => OPEN.includes(r.st)).length >= 3) throw new HttpError(429, "You already have 3 open orders. Finish or cancel one first.");
  // daily cap (reserve first, undo on failure)
  const dref = db().ref(`xchg_daily/${uid}/${dayKey()}`);
  let over = false;
  await dref.transaction((cur: number | null) => { over = false; const n = (cur || 0) + q.usdt_u; if (c.daily_max_usdt > 0 && n > Math.round(c.daily_max_usdt * U)) { over = true; return; } return n; });
  if (over) throw new HttpError(429, "Daily Exchange limit reached. Try again tomorrow.");
  const undo = () => dref.transaction((cur: number | null) => Math.max(0, (cur || 0) - q.usdt_u)).catch(() => {});
  const id = sortableId();
  const now = Date.now();
  try {
    if (q.kind === "sell") {
      let err = "";
      await db().ref(`users/${uid}`).transaction((cur: any) => {
        err = "";
        if (!cur) { err = "send_no_user"; return cur; }
        if ((cur.usdt_u || 0) < q.usdt_u) { err = "insufficient_usdt"; return cur; }
        cur.usdt_u = (cur.usdt_u || 0) - q.usdt_u;
        cur.usdt_tot = cur.usdt_tot || {};
        cur.usdt_tot.sold = (cur.usdt_tot.sold || 0) + q.usdt_u;
        return cur;
      });
      if (err) throw new HttpError(409, err);
    }
    const o: XOrder = {
      uid, name: clean(name, 30) || "User", kind: q.kind, method: m.id, mname: m.name, usdt_u: q.usdt_u, fiat: q.fiat, rate: q.rate, fee_fiat: q.fee_fiat, cur: c.cur,
      st: q.kind === "buy" ? "await" : "pending", at: now, lock_until: q.kind === "buy" ? now + c.lock_min * 60000 : 0, ...(q.kind === "sell" ? { acct } : {}), ...(clean(b?.note, 60) ? { note: clean(b?.note, 60) } : {}),
      tl: { [sortableId()]: { s: q.kind === "buy" ? "Order created" : "Sell request sent", at: now } },
    };
    await db().ref().update({ [`xorders/${id}`]: o, [`user_xorders/${uid}/${id}`]: { kind: o.kind, usdt_u: o.usdt_u, fiat: o.fiat, cur: o.cur, st: o.st, at: now } });
  } catch (e) {
    await undo();
    throw e;
  }
  if (q.kind === "sell") {
    await activity(uid, "sell", { usdt_u: -q.usdt_u, note: `Exchange sell ${m.name}`.slice(0, 80) });
    await alertAdmins("exchange", `New SELL request: ${usdt} USDT → ${q.fiat} ${c.cur} (${m.name}) from ${clean(name, 20)}. Open Admin → Exchange.`);
  }
  const o2 = (await val(`xorders/${id}`)) as XOrder;
  return orderView(id, o2, c, true);
}
/** Buy: the user paid the admin and sends the payment reference */
export async function xProof(uid: string, id: string, ref: any) {
  const c = (await getCfg2()).xchg;
  const o = (await val(`xorders/${id}`)) as XOrder | null;
  if (!o || o.uid !== uid) throw new HttpError(404, "not_found");
  const r = clean(ref, 80);
  if (o.kind !== "buy") throw new HttpError(400, "bad_request");
  if (r.length < 4) throw new HttpError(400, "Enter the transaction ID or the last digits of your payment.");
  if (o.st !== "await") throw new HttpError(409, "This order can't take a payment reference now.");
  if (o.lock_until < Date.now()) throw new HttpError(409, "Time is over for this order. Make a new one.");
  const t = await db().ref(`xorders/${id}/st`).transaction((cur: string | null) => (cur === "await" ? "pending" : undefined));
  if (!t.committed) throw new HttpError(409, "This order can't take a payment reference now.");
  await db().ref().update({ [`xorders/${id}/ref`]: r, [`xorders/${id}/tl/${sortableId()}`]: { s: "Payment reference sent", at: Date.now() }, [`user_xorders/${uid}/${id}/st`]: "pending" });
  await alertAdmins("exchange", `BUY order paid: ${o.usdt_u / U} USDT for ${o.fiat} ${o.cur} (${o.mname}), ref ${r}, ${o.name}. Open Admin → Exchange.`);
  return orderView(id, { ...o, st: "pending", ref: r }, c, true);
}
/** user cancels: buy before done, sell only before the admin starts paying */
export async function xCancel(uid: string, id: string) {
  const o = (await val(`xorders/${id}`)) as XOrder | null;
  if (!o || o.uid !== uid) throw new HttpError(404, "not_found");
  const t = await db().ref(`xorders/${id}/st`).transaction((cur: string | null) => (cur === "await" || cur === "pending" ? "cancelled" : undefined));
  if (!t.committed) throw new HttpError(409, "It's too late to cancel this order.");
  await finishBad(id, o, "cancelled", "You cancelled this order.");
  return true;
}
async function finishBad(id: string, o: XOrder, st: "cancelled" | "rejected" | "expired", msg: string) {
  const up: Record<string, any> = { [`xorders/${id}/tl/${sortableId()}`]: { s: LABEL[st], at: Date.now() }, [`user_xorders/${o.uid}/${id}/st`]: st, [`xchg_daily/${o.uid}/${dayKey(o.at)}`]: ServerValue.increment(-o.usdt_u) };
  if (o.kind === "sell") { up[`users/${o.uid}/usdt_u`] = ServerValue.increment(o.usdt_u); up[`users/${o.uid}/usdt_tot/sold`] = ServerValue.increment(-o.usdt_u); }
  if (st === "rejected") up[`xchg_stats/${o.uid}/rej`] = ServerValue.increment(1);
  await db().ref().update(up);
  if (o.kind === "sell") await activity(o.uid, "adjust", { usdt_u: o.usdt_u, note: "Exchange sell refunded" });
  await notify(o.uid, `💱 Exchange order ${st === "expired" ? "expired" : st}: ${o.kind === "buy" ? "Buy" : "Sell"} ${o.usdt_u / U} USDT. ${msg}${o.kind === "sell" ? " Your USDT is back in your balance." : ""}`).catch(() => {});
}
export async function xAdminList(status: string) {
  const c = (await getCfg2()).xchg;
  let all: Record<string, XOrder> = {};
  try { all = ((await db().ref("xorders").orderByKey().limitToLast(200).get()).val() || {}) as any; } catch { all = ((await val("xorders")) || {}) as any; }
  const rows = Object.entries(all).filter(([, o]) => (status === "open" ? OPEN.includes(o.st) : status === "all" ? true : o.st === status)).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 100);
  const out = [] as any[];
  for (const [id, o] of rows) out.push({ ...orderView(id, o, c), uid: o.uid, name: o.name, usdt: o.usdt_u / U, by: o.by || "", trusted: (await xStats(o.uid)).trusted });
  return out;
}
export async function xAdminSet(id: string, action: string, note: string, who: string) {
  const o = (await val(`xorders/${id}`)) as XOrder | null;
  if (!o) throw new HttpError(404, "Order not found");
  const nt = clean(note, 80);
  if (action === "paying") {
    if (o.kind !== "sell") throw new HttpError(400, "Only sell orders have a paying step.");
    const t = await db().ref(`xorders/${id}/st`).transaction((cur: string | null) => (cur === "pending" ? "paying" : undefined));
    if (!t.committed) throw new HttpError(409, "This order is not waiting any more.");
    await db().ref().update({ [`xorders/${id}/by`]: who, [`xorders/${id}/tl/${sortableId()}`]: { s: LABEL.paying, at: Date.now() }, [`user_xorders/${o.uid}/${id}/st`]: "paying" });
    await notify(o.uid, `💱 Your sell order (${o.usdt_u / U} USDT) is being paid now. You'll get a message when it's done.`).catch(() => {});
    return;
  }
  if (action === "reject") {
    const t = await db().ref(`xorders/${id}/st`).transaction((cur: string | null) => (cur === "await" || cur === "pending" || cur === "paying" ? "rejected" : undefined));
    if (!t.committed) throw new HttpError(409, "This order is already finished.");
    await db().ref().update({ [`xorders/${id}/by`]: who, ...(nt ? { [`xorders/${id}/note_admin`]: nt } : {}) });
    await finishBad(id, o, "rejected", nt ? `Reason: ${nt}.` : "Please contact support if you have questions.");
    return;
  }
  if (action !== "done") throw new HttpError(400, "bad_action");
  const from: string[] = o.kind === "buy" ? ["pending"] : ["pending", "paying"];
  let was = "";
  const t = await db().ref(`xorders/${id}/st`).transaction((cur: string | null) => { was = cur || ""; return from.includes(cur || "") ? "closing" : undefined; });
  if (!t.committed) throw new HttpError(409, o.kind === "buy" && was === "await" ? "Wait until the user sends the payment reference." : "This order is already finished.");
  const up: Record<string, any> = { [`xorders/${id}/by`]: who, [`xorders/${id}/done_at`]: Date.now(), [`xorders/${id}/tl/${sortableId()}`]: { s: LABEL.done, at: Date.now() }, [`user_xorders/${o.uid}/${id}/st`]: "done", [`xorders/${id}/st`]: "done", [`xchg_stats/${o.uid}/done`]: ServerValue.increment(1), [`stats/xchg_${o.kind}_u`]: ServerValue.increment(o.usdt_u) };
  if (o.kind === "buy") { up[`users/${o.uid}/usdt_u`] = ServerValue.increment(o.usdt_u); up[`users/${o.uid}/usdt_tot/bought`] = ServerValue.increment(o.usdt_u); }
  if (nt) up[`xorders/${id}/note_admin`] = nt;
  await db().ref().update(up);
  await activity(o.uid, o.kind === "buy" ? "buy" : "sell", { usdt_u: o.kind === "buy" ? o.usdt_u : 0, note: `Exchange ${o.kind} ${o.mname}`.slice(0, 80) });
  const st = await xStats(o.uid);
  await notify(o.uid, o.kind === "buy"
    ? `✅ Exchange complete: ${o.usdt_u / U} USDT was added to your balance.${st.trusted ? " You are now a Trusted trader ⭐" : ""}`
    : `✅ Exchange complete: ${o.fiat} ${o.cur} was sent to your ${o.mname} account (${o.usdt_u / U} USDT sold).${st.trusted ? " You are now a Trusted trader ⭐" : ""}`).catch(() => {});
}
/** cron: buy orders that never got a payment reference */
export async function xExpire(now = Date.now()) {
  let all: Record<string, XOrder> = {};
  try { all = ((await db().ref("xorders").orderByKey().limitToLast(300).get()).val() || {}) as any; } catch { all = {}; }
  let n = 0;
  for (const [id, o] of Object.entries(all)) {
    if (o.st !== "await" || !(o.lock_until < now)) continue;
    const t = await db().ref(`xorders/${id}/st`).transaction((cur: string | null) => (cur === "await" ? "expired" : undefined));
    if (!t.committed) continue;
    await finishBad(id, o, "expired", "No payment reference was sent in time.");
    n++;
  }
  return n;
}

/* ───────── mini: pending hub, why stuck, low balance, recent amounts ───────── */
export async function hub(uid: string) {
  const now = Date.now();
  const items: { k: string; title: string; sub: string; at: number; why?: string; id?: string }[] = [];
  const blocks: string[] = [];
  const [frozen, prefs] = await Promise.all([val(`frozen/${uid}`), val(`user_prefs/${uid}`)]);
  if (frozen) blocks.push("Your account is frozen for security. You can't send or withdraw until support removes it. Open Help to contact us.");
  const safe = Number(prefs?.safe_until) || 0;
  if (safe > now) blocks.push(`Safe mode is on until ${new Date(safe).toISOString().slice(0, 16).replace("T", " ")} UTC after a recovery. Money can't leave your account until then.`);
  const wu = ((await val(`users/${uid}/usdt_withdrawals`)) || {}) as Record<string, any>;
  for (const [id, w] of Object.entries(wu)) if (w.status === "pending") {
    const root = ((await val(`usdt_withdrawals/${id}`)) || {}) as any;
    items.push({ k: "wd", id, title: `USDT withdrawal ${w.amount} USDT`, sub: w.network_name || "", at: w.created_at, why: root.hold ? "Held for an extra safety check by the team." : "Waiting for an admin to review and send it. This is done by hand." });
  }
  const wt = ((await val(`users/${uid}/withdrawals`)) || {}) as Record<string, any>;
  for (const [id, w] of Object.entries(wt)) if (w.status === "pending") items.push({ k: "wd", id, title: "TFUEL withdrawal", sub: String(w.method || ""), at: w.created_at, why: "Waiting for an admin to review and send it." });
  const xf = ((await val(`user_xfers/${uid}`)) || {}) as Record<string, any>;
  for (const [id, x] of Object.entries(xf)) {
    if (x.st === "held") items.push({ k: "held", id, title: `Held transfer to ${x.peer}`, sub: x.n || "", at: x.at, why: x.rel ? `Released automatically ${new Date(x.rel).toISOString().slice(0, 16).replace("T", " ")} UTC. You can cancel it before then from Send › History.` : "Held for a safety delay." });
    else if (x.st === "link" && x.d === "out") items.push({ k: "link", id, title: "Money link not claimed", sub: "", at: x.at, why: "Nobody has opened it yet. Cancel it from Send › Links to get the money back." });
  }
  const rq = ((await val(`user_reqs/${uid}`)) || {}) as Record<string, any>;
  for (const [id, r] of Object.entries(rq)) if (r.st === "open" && r.exp > now) items.push({ k: "req", id, title: `Payment request ${r.amount ? "" : ""}${r.note || ""}`.trim() || "Payment request", sub: r.asset === "usdt" ? `${r.amount / U} USDT` : `${r.amount} coins`, at: r.at, why: "Waiting for the other person to pay." });
  const iv = ((await val(`user_invoices/${uid}`)) || {}) as Record<string, any>;
  for (const [id, r] of Object.entries(iv)) if (r.st === "open") items.push({ k: "inv", id, title: `Invoice: ${r.title || ""}`, sub: `${r.amt} ${r.asset === "usdt" ? "USDT" : "TFUEL"}`, at: r.at, why: "Waiting for the customer to pay." });
  const xo = ((await val(`user_xorders/${uid}`)) || {}) as Record<string, any>;
  for (const [id, r] of Object.entries(xo)) if (OPEN.includes(r.st)) items.push({ k: "xo", id, title: `${r.kind === "buy" ? "Buy" : "Sell"} ${r.usdt_u / U} USDT`, sub: `${r.fiat} ${r.cur}`, at: r.at, why: r.st === "await" ? "Pay the admin and send your payment reference before the time ends." : r.st === "paying" ? "The admin is sending your money now." : "Waiting for the admin to check it." });
  const tk = ((await val(`user_tickets/${uid}`)) || {}) as Record<string, any>;
  for (const [id, r] of Object.entries(tk)) if (r.status !== "closed") items.push({ k: "tk", id, title: `Support: ${r.subject}`, sub: r.status, at: r.updated_at, why: r.status === "open" ? "Support will answer here and in your bot chat." : "Support replied. Open it to answer." });
  return { items: items.sort((a, b) => b.at - a.at).slice(0, 40), blocks };
}
export async function recentAmts(uid: string) {
  let rows: any[] = [];
  try { rows = Object.values(((await db().ref(`user_xfers/${uid}`).orderByKey().limitToLast(60).get()).val() || {}) as Record<string, any>); } catch { rows = Object.values(((await val(`user_xfers/${uid}`)) || {}) as Record<string, any>).slice(-60); }
  const out: { tfuel: number[]; usdt: number[] } = { tfuel: [], usdt: [] };
  for (const r of rows.filter((x) => x.d === "out" && x.st === "done").sort((a, b) => b.at - a.at)) {
    const l = r.a === "usdt" ? out.usdt : out.tfuel;
    if (!l.includes(r.amt) && l.length < 3) l.push(r.amt);
  }
  return out;
}
export async function lowGet(uid: string) { const x = ((await val(`user_prefs/${uid}/lowbal`)) || {}) as any; return { on: !!x.on, t: Number(x.t) || 0, u: Number(x.u) || 0 }; }
export async function lowSet(uid: string, b: any) {
  if (!(await getCfg2()).v27.lowbal) throw new HttpError(403, "feature_off:Low balance alerts are off.");
  const on = !!b?.on;
  const t = Math.max(0, Math.min(1e9, Number(b?.t) || 0)), u = Math.max(0, Math.min(1e9, Math.round((Number(b?.u) || 0) * 100) / 100));
  if (on && !(t > 0 || u > 0)) throw new HttpError(400, "Set an amount to be warned at.");
  await db().ref().update({ [`user_prefs/${uid}/lowbal`]: { on, t, u, at: (await val(`user_prefs/${uid}/lowbal/at`)) || 0 }, [`lowbal_users/${uid}`]: on ? true : null });
  return lowGet(uid);
}
export async function runLowBal(now = Date.now()) {
  const c = await getCfg2();
  if (!c.v27.lowbal) return 0;
  const cpt = (await getSettings()).coins_per_tfuel || 1000;
  const ids = Object.keys(((await val("lowbal_users")) || {}) as Record<string, any>).slice(0, 500);
  let n = 0;
  for (const uid of ids) {
    const p = ((await val(`user_prefs/${uid}/lowbal`)) || {}) as any;
    if (!p.on || now - (Number(p.at) || 0) < 86400000) continue;
    const u = ((await val(`users/${uid}`)) || {}) as any;
    const lowT = p.t > 0 && (u.balance || 0) < p.t * cpt && (u.balance || 0) >= 0;
    const lowU = p.u > 0 && (u.usdt_u || 0) < p.u * U;
    if (!lowT && !lowU) continue;
    await db().ref(`user_prefs/${uid}/lowbal/at`).set(now);
    await notify(uid, `⚠️ Low balance: ${lowT ? `TFUEL is below ${p.t}` : ""}${lowT && lowU ? " and " : ""}${lowU ? `USDT is below ${p.u}` : ""}. You can change this alert in Settings.`).catch(() => {});
    n++;
  }
  return n;
}

/* ───────── admin: one-page user summary ───────── */
export async function userSummary(q: string) {
  const { resolveRef } = await import("./refcode");
  const { getRefCode } = await import("./refcode");
  const id = /^\d{1,15}$/.test(q) && (await val(`users/${q}/created_at`)) ? q : (await resolveRef(q).catch(() => "")) || "";
  if (!id) throw new HttpError(404, "User not found");
  const u = (await val(`users/${id}`)) as any;
  if (!u) throw new HttpError(404, "User not found");
  const xf = Object.entries(((await val(`user_xfers/${id}`)) || {}) as Record<string, any>).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 10).map(([, x]) => ({ d: x.d, a: x.a, amt: x.a === "usdt" ? x.amt / U : x.amt, peer: x.peer, st: x.st, at: x.at }));
  const xo = Object.entries(((await val(`user_xorders/${id}`)) || {}) as Record<string, any>).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 5).map(([oid, x]) => ({ id: oid.slice(-8), kind: x.kind, usdt: x.usdt_u / U, fiat: x.fiat, cur: x.cur, st: x.st, at: x.at }));
  const kyc = (await val(`user_prefs/${id}/kyc`)) as any;
  const tk = Object.values(((await val(`user_tickets/${id}`)) || {}) as Record<string, any>) as any[];
  return {
    id, code: await getRefCode(id).catch(() => ""), name: u.name || "", username: u.username || "", banned: !!u.banned, frozen: !!(await val(`frozen/${id}`)), created_at: u.created_at || 0, last_seen: u.last_seen || 0,
    balance: u.balance || 0, usdt: (u.usdt_u || 0) / U, usdt_tot: Object.fromEntries(Object.entries(u.usdt_tot || {}).map(([k, v]) => [k, Number(v) / U])), refs: u.ref_count || 0,
    kyc: kyc ? { status: kyc.st || "", at: kyc.at || 0 } : null, xfers: xf, xorders: xo, stats: await xStats(id), tickets_open: tk.filter((t) => t.status !== "closed").length, tickets: tk.length,
  };
}

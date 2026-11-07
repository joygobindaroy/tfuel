import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getSettings } from "./settings";
import { createTicket } from "./tickets";
import { sortableId } from "./crypto";
import { dayKey } from "./log";
import { U } from "./market";
import { xc } from "./v27";

const val = async (p: string) => (await db().ref(p).get()).val();

/* ───────── 2. order dispute → support ticket ───────── */
export async function xDispute(uid: string, name: string, id: string, text: string) {
  const o = (await val(`xorders/${id}`)) as any;
  if (!o || o.uid !== uid) throw new HttpError(404, "not_found");
  if (o.st === "await") throw new HttpError(400, "Nothing to report yet — pay first or cancel the order.");
  let first = false;
  await db().ref(`xorders/${id}/disp`).transaction((cur: number | null) => { first = !cur; return cur || Date.now(); });
  if (!first) throw new HttpError(409, "You already reported this order. Support will answer in your tickets.");
  try {
    const short = id.slice(-8);
    await createTicket(uid, name, `Exchange order #${short}`, `${String(text || "").trim() || "I have a problem with this order."}\n\n[${o.kind} ${o.usdt_u / U} USDT · ${o.fiat} ${o.cur} · ${o.mname} · status ${o.st}${o.ref ? " · ref " + o.ref : ""}]`, "exchange");
  } catch (e) {
    await db().ref(`xorders/${id}/disp`).set(null);
    throw e;
  }
  await db().ref(`xorders/${id}/tl/${sortableId()}`).set({ s: "Problem reported to support", at: Date.now() });
  return true;
}

/* ───────── 3. admin report ───────── */
export async function xReport(days: number) {
  const c = await xc();
  let all: Record<string, any> = {};
  try { all = ((await db().ref("xorders").orderByKey().limitToLast(1000).get()).val() || {}) as any; } catch { all = ((await val("xorders")) || {}) as any; }
  const from = Date.now() - Math.max(1, Math.min(365, days)) * 864e5;
  const rows = Object.values(all).filter((o: any) => o.st === "done" && (o.done_at || o.at) >= from) as any[];
  const byDay: Record<string, any> = {}, byMethod: Record<string, any> = {};
  const T = { buy_n: 0, buy_usdt: 0, buy_fiat: 0, sell_n: 0, sell_usdt: 0, sell_fiat: 0, fees: 0 };
  for (const o of rows) {
    const d = new Date(o.done_at || o.at).toISOString().slice(0, 10);
    const D = (byDay[d] ||= { day: d, buy_usdt: 0, sell_usdt: 0, buy_fiat: 0, sell_fiat: 0, n: 0 });
    const M = (byMethod[o.mname] ||= { method: o.mname, n: 0, usdt: 0 });
    const u = o.usdt_u / U;
    D.n++; M.n++; M.usdt += u;
    if (o.kind === "buy") { D.buy_usdt += u; D.buy_fiat += o.fiat; T.buy_n++; T.buy_usdt += u; T.buy_fiat += o.fiat; }
    else { D.sell_usdt += u; D.sell_fiat += o.fiat; T.sell_n++; T.sell_usdt += u; T.sell_fiat += o.fiat; }
    T.fees += o.fee_fiat || 0;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const avgBuy = T.buy_usdt ? T.buy_fiat / T.buy_usdt : 0, avgSell = T.sell_usdt ? T.sell_fiat / T.sell_usdt : 0;
  const matched = Math.min(T.buy_usdt, T.sell_usdt);
  return {
    cur: c.cur, days, orders: rows.length, ...(Object.fromEntries(Object.entries(T).map(([k, v]) => [k, r2(v)])) as typeof T),
    avg_buy_rate: r2(avgBuy), avg_sell_rate: r2(avgSell),
    spread_income: r2(matched * Math.max(0, avgBuy - avgSell)), // indicative only: you sold at avgBuy and bought back at avgSell
    by_day: Object.values(byDay).sort((a: any, b: any) => (a.day < b.day ? -1 : 1)).map((d: any) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, typeof v === "number" ? r2(v) : v]))),
    by_method: Object.values(byMethod).sort((a: any, b: any) => b.n - a.n).map((m: any) => ({ ...m, usdt: r2(m.usdt) })),
  };
}

/* ───────── 9. admin "what to do today" ───────── */
async function pendingN(path: string, st = "pending") {
  try { return Object.keys(((await db().ref(path).orderByChild("status").equalTo(st).limitToFirst(200).get()).val() || {}) as Record<string, any>).length; }
  catch { return Object.values(((await val(path)) || {}) as Record<string, any>).filter((w: any) => w.status === st).length; }
}
export async function adminTodo() {
  const { cfg2SlaH } = await import("./v28b");
  const sla = await cfg2SlaH();
  const [uw, tw, dep, tk, rep, kyc, xo] = await Promise.all([
    pendingN("usdt_withdrawals"), pendingN("withdrawals"), pendingN("deposits"),
    (async () => { try { return ((await db().ref("tickets").orderByKey().limitToLast(150).get()).val() || {}) as Record<string, any>; } catch { return {}; } })(),
    import("./v22").then((M) => M.reportsList("open")).then((l: any) => (Array.isArray(l) ? l.length : 0)).catch(() => 0),
    import("./v26").then((M) => M.kycQueue()).then((l: any) => (Array.isArray(l) ? l.length : 0)).catch(() => 0),
    (async () => { try { const a = ((await db().ref("xorders").orderByKey().limitToLast(200).get()).val() || {}) as Record<string, any>; return Object.values(a).filter((o: any) => o.st === "pending" || o.st === "paying").length; } catch { return 0; } })(),
  ]);
  const tks = Object.values(tk as Record<string, any>).filter((t: any) => t.status !== "closed");
  const late = tks.filter((t: any) => { const m = Object.values(t.msgs || {}).sort((a: any, b: any) => a.at - b.at) as any[]; const l = m[m.length - 1]; return l?.f === "user" && Date.now() - l.at > sla * 3600000; }).length;
  const items = [
    { k: "usdt", label: "USDT withdrawals to review", n: uw, tab: "usdt" },
    { k: "withdrawals", label: "TFUEL withdrawals to review", n: tw, tab: "withdrawals" },
    { k: "deposits", label: "Deposits to check", n: dep, tab: "usdt" },
    { k: "exchange", label: "Exchange orders to handle", n: xo, tab: "exchange" },
    { k: "late", label: "Late support tickets", n: late, tab: "comms" },
    { k: "tickets", label: "Open support tickets", n: tks.length, tab: "comms" },
    { k: "kyc", label: "Identity checks waiting", n: kyc, tab: "feedback" },
    { k: "reports", label: "User reports waiting", n: rep, tab: "feedback" },
  ];
  return { items, total: items.reduce((a, b) => a + (b.k === "tickets" ? 0 : b.n), 0) };
}

/* ───────── 7. merchant refund ───────── */
export async function merchantRefund(uid: string, name: string, saleId: string) {
  const row = (await val(`merchant_sales/${uid}/${saleId}`)) as any;
  if (!row) throw new HttpError(404, "not_found");
  if (!row.fu) throw new HttpError(400, "This older sale can't be refunded from the app.");
  if (Date.now() - row.at > 30 * 864e5) throw new HttpError(400, "Refunds are possible for 30 days.");
  let first = false;
  await db().ref(`merchant_sales/${uid}/${saleId}/rf`).transaction((cur: number | null) => { first = !cur; return cur || Date.now(); });
  if (!first) throw new HttpError(409, "This sale was already refunded.");
  try {
    const { sendAsset } = await import("./transfer");
    const s = await getSettings();
    await sendAsset({ id: uid, name }, String(row.fu), row.a, row.amt, s, `REFUND ${String(row.tx || "").slice(0, 12)}`);
  } catch (e) {
    await db().ref(`merchant_sales/${uid}/${saleId}/rf`).set(null);
    throw e;
  }
  await db().ref().update({ [`merchant_tot/${uid}/all/${row.a}`]: ServerValue.increment(-row.amt), [`merchant_tot/${uid}/${dayKey(row.at)}/${row.a}`]: ServerValue.increment(-row.amt) });
  return true;
}

/* ───────── 8. spending summary ───────── */
export async function spending(uid: string, days: number, cpt: number) {
  let rows: any[] = [];
  try { rows = Object.values(((await db().ref(`activity/${uid}`).orderByKey().limitToLast(500).get()).val() || {}) as Record<string, any>); } catch { rows = Object.values(((await val(`activity/${uid}`)) || {}) as Record<string, any>).slice(-500); }
  const from = Date.now() - Math.max(1, Math.min(365, days)) * 864e5;
  const g: Record<string, { t: string; c_in: number; c_out: number; u_in: number; u_out: number; n: number }> = {};
  const T = { c_in: 0, c_out: 0, u_in: 0, u_out: 0 };
  for (const r of rows) {
    if (r.at < from) continue;
    const x = (g[r.t] ||= { t: r.t, c_in: 0, c_out: 0, u_in: 0, u_out: 0, n: 0 });
    x.n++;
    if (r.c > 0) { x.c_in += r.c; T.c_in += r.c; } else if (r.c < 0) { x.c_out -= r.c; T.c_out -= r.c; }
    if (r.u > 0) { x.u_in += r.u; T.u_in += r.u; } else if (r.u < 0) { x.u_out -= r.u; T.u_out -= r.u; }
  }
  const tf = (n: number) => Math.round((n / cpt) * 100) / 100, us = (n: number) => Math.round((n / U) * 100) / 100;
  // by your own private tags (rent, food…) from Send › History
  let xr: any[] = [];
  try { xr = Object.values(((await db().ref(`user_xfers/${uid}`).orderByKey().limitToLast(300).get()).val() || {}) as Record<string, any>); } catch { xr = []; }
  const tg: Record<string, { tag: string; n: number; tfuel: number; usdt: number }> = {};
  for (const x of xr) {
    if (!x.tag || x.at < from || (x.st !== "done" && x.st !== "claimed")) continue;
    const k = String(x.tag).toLowerCase().slice(0, 20);
    const t = (tg[k] ||= { tag: k, n: 0, tfuel: 0, usdt: 0 });
    t.n++;
    if (x.a === "usdt") t.usdt += x.d === "out" ? -x.amt : x.amt; else t.tfuel += x.d === "out" ? -x.amt : x.amt;
  }
  return {
    tags: Object.values(tg).map((t) => ({ tag: t.tag, n: t.n, tfuel: tf(t.tfuel), usdt: us(t.usdt) })).sort((a, b) => Math.abs(b.tfuel) + Math.abs(b.usdt) - (Math.abs(a.tfuel) + Math.abs(a.usdt))).slice(0, 12),
    days, total: { tfuel_in: tf(T.c_in), tfuel_out: tf(T.c_out), usdt_in: us(T.u_in), usdt_out: us(T.u_out) },
    list: Object.values(g).filter((x) => x.c_in || x.c_out || x.u_in || x.u_out).map((x) => ({ t: x.t, n: x.n, tfuel_in: tf(x.c_in), tfuel_out: tf(x.c_out), usdt_in: us(x.u_in), usdt_out: us(x.u_out) })).sort((a, b) => b.tfuel_out + b.usdt_out - (a.tfuel_out + a.usdt_out)),
  };
}

/* ───────── 4. bot: /rate and /orders ───────── */
export async function rateText() {
  const c = await xc();
  if (!c.on || !(c.rate_buy > 0 || c.rate_sell > 0)) return "💱 Exchange is not open right now.";
  return `💱 <b>Exchange rates</b>\nBuy 1 USDT: <b>${c.buy_on && c.rate_buy > 0 ? `${c.rate_buy} ${c.cur}` : "paused"}</b>\nSell 1 USDT: <b>${c.sell_on && c.rate_sell > 0 ? `${c.rate_sell} ${c.cur}` : "paused"}</b>\n\nOpen the app → Exchange to place an order.`;
}
export async function ordersText(uid: string) {
  const rows = Object.entries(((await val(`user_xorders/${uid}`)) || {}) as Record<string, any>).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 8);
  if (!rows.length) return "💱 You have no exchange orders yet.";
  return "💱 <b>Your exchange orders</b>\n\n" + rows.map(([id, o]) => `${o.kind === "buy" ? "Buy" : "Sell"} ${o.usdt_u / U} USDT · ${o.fiat} ${o.cur} — <b>${o.st}</b> (#${id.slice(-6)})`).join("\n");
}

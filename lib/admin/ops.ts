import type { AdminMod } from "./types";
import { db } from "../firebase";
import { adminLog } from "../log";
import { HttpError } from "../auth";
import { getSettings } from "../settings";
import { getPrice, fromU } from "../market";
import { settleTfWithdrawal, settleUsdtWithdrawal } from "../payouts";

const num = (v: any) => Number(v) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const idRe = /^[\w-]{1,64}$/;
const clip = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

/** "YYYY-MM" → [start, end) in UTC ms */
export function monthRange(m: any): { key: string; from: number; to: number } {
  const s = String(m || "");
  const mm = /^(\d{4})-(\d{2})$/.exec(s);
  const now = new Date();
  let y = now.getUTCFullYear(), mo = now.getUTCMonth();
  if (mm) { y = Number(mm[1]); mo = Number(mm[2]) - 1; if (mo < 0 || mo > 11 || y < 2020 || y > 2100) throw new HttpError(400, "Invalid month"); }
  return { key: `${y}-${String(mo + 1).padStart(2, "0")}`, from: Date.UTC(y, mo, 1), to: Date.UTC(y, mo + 1, 1) };
}

async function val(path: string): Promise<any> { return (await db().ref(path).get()).val(); }
const entries = (o: any): [string, any][] => Object.entries((o || {}) as Record<string, any>);

/** TFUEL price in USDT (0 when unknown) and coins per TFUEL */
async function pricing() {
  const s = await getSettings();
  const cpt = num(s.coins_per_tfuel) || 1000;
  let price = 0, stale = false, src = "";
  try { const p = await getPrice(s); if (p) { price = p.price; stale = p.stale; src = p.src; } } catch {}
  return { cpt, price, stale, src };
}
const coinsToUsdt = (coins: number, cpt: number, price: number) => (coins / cpt) * price;

// ---- Users scan (cached 60 s) ----
type Scan = { at: number; users: number; usdtU: number; coins: number; locked: number; owed: number; earn: Record<string, number>; spent: Record<string, number>; usdtTot: Record<string, number> };
let scan: Scan | null = null;
async function scanUsers(force = false): Promise<Scan> {
  if (!force && scan && Date.now() - scan.at < 60000) return scan;
  const all = (await val("users")) || {};
  const out: Scan = { at: Date.now(), users: 0, usdtU: 0, coins: 0, locked: 0, owed: 0, earn: {}, spent: {}, usdtTot: {} };
  for (const [, u] of entries(all)) {
    out.users++;
    out.usdtU += num(u.usdt_u);
    out.coins += num(u.balance);
    for (const [, k] of entries(u.stakes)) if (k && k.status === "active") { out.locked += num(k.amount); out.owed += num(k.reward); }
    for (const [k, v] of entries(u.earn)) out.earn[k] = (out.earn[k] || 0) + num(v);
    for (const [k, v] of entries(u.spent)) out.spent[k] = (out.spent[k] || 0) + num(v);
    for (const [k, v] of entries(u.usdt_tot)) out.usdtTot[k] = (out.usdtTot[k] || 0) + num(v);
  }
  scan = out;
  return out;
}

async function liability() {
  const [sc, pr, wTf, wU, hold] = await Promise.all([scanUsers(), pricing(), val("withdrawals"), val("usdt_withdrawals"), val("admin_cfg/holdings")]);
  let pendTfCoins = 0, pendTfN = 0, pendU = 0, pendUN = 0;
  for (const [, w] of entries(wTf)) if (w.status === "pending") { pendTfCoins += num(w.amount); pendTfN++; }
  for (const [, w] of entries(wU)) if (w.status === "pending") { pendU += num(w.amount); pendUN++; }
  const usdtBal = fromU(sc.usdtU);
  const tfBalUsdt = coinsToUsdt(sc.coins, pr.cpt, pr.price);
  const lockedUsdt = coinsToUsdt(sc.locked, pr.cpt, pr.price);
  const pendTfUsdt = coinsToUsdt(pendTfCoins, pr.cpt, pr.price);
  const total = usdtBal + tfBalUsdt + lockedUsdt + pendU + pendTfUsdt;
  const holdings = hold && typeof hold === "object" ? num(hold.usdt) : 0;
  return {
    price: pr.price, price_stale: pr.stale, price_src: pr.src, coins_per_tfuel: pr.cpt, scanned_at: sc.at, users: sc.users,
    usdt_balances: r2(usdtBal),
    tfuel_balances: r2(sc.coins / pr.cpt), tfuel_balances_usdt: r2(tfBalUsdt),
    locked_tfuel: r2(sc.locked / pr.cpt), locked_usdt: r2(lockedUsdt), stake_rewards_owed_tfuel: r2(sc.owed / pr.cpt),
    pending_usdt: { count: pendUN, amount: r2(pendU) },
    pending_tfuel: { count: pendTfN, tfuel: r2(pendTfCoins / pr.cpt), usdt: r2(pendTfUsdt) },
    total_liability_usdt: r2(total),
    holdings: { usdt: holdings, note: hold?.note || "", by: hold?.by || "", at: num(hold?.at) },
    coverage: total > 0 && hold ? r6(holdings / total) : null,
    shortfall_usdt: hold ? r2(Math.max(0, total - holdings)) : null,
    surplus_usdt: hold ? r2(Math.max(0, holdings - total)) : null,
  };
}

async function incomeExpense(monthIn: any) {
  const m = monthRange(monthIn);
  const [pr, sc, trades, lb, sendFees, volU, feesU] = await Promise.all([
    pricing(), scanUsers(), val("trades"), val("lb"), val("stats/send_fees"), val("stats/trade_volume_u"), val("stats/trade_fees_u"),
  ]);
  let feeU = 0, tradeN = 0;
  for (const [, t] of entries(trades)) { const at = num(t.at); if (at >= m.from && at < m.to) { feeU += num(t.fee_u); tradeN++; } }
  // all TFUEL coins earned by users in the month (leaderboard day counters = earnings only; excludes purchases/admin credits)
  let rewardCoins = 0, days = 0;
  for (const [k, day] of entries(lb)) {
    const mm = /^d_(\d{4})(\d{2})(\d{2})$/.exec(k);
    if (!mm || `${mm[1]}-${mm[2]}` !== m.key) continue;
    days++;
    for (const [, c] of entries(day)) rewardCoins += num(c);
  }
  const E = sc.earn;
  const bySource = ["tap", "articles", "tasks", "daily", "mining", "spin", "ads", "referral", "staking", "prize", "promo"].map((k) => ({ source: k, tfuel: r2(num(E[k]) / pr.cpt), usdt: r2(coinsToUsdt(num(E[k]), pr.cpt, pr.price)) }));
  const rewardUsdt = coinsToUsdt(rewardCoins, pr.cpt, pr.price);
  const feeUsdt = fromU(feeU);
  const sendFeeUsdt = coinsToUsdt(num(sendFees), pr.cpt, pr.price);
  return {
    month: m.key, price: pr.price, price_stale: pr.stale,
    income: {
      trading_fees_usdt: r2(feeUsdt), trades: tradeN,
      ad_income_usdt: null as number | null, // not tracked anywhere in the database
    },
    expense: {
      rewards_tfuel: r2(rewardCoins / pr.cpt), rewards_usdt: r2(rewardUsdt), reward_days_found: days,
    },
    net_usdt_estimate: r2(feeUsdt - rewardUsdt),
    lifetime: {
      trading_fees_usdt: r2(fromU(num(feesU))), trade_volume_usdt: r2(fromU(num(volU))),
      send_fees_tfuel: r2(num(sendFees) / pr.cpt), send_fees_usdt: r2(sendFeeUsdt),
      earn_by_source: bySource,
      referral_tfuel: r2(num(E.referral) / pr.cpt), prizes_tfuel: r2(num(E.prize) / pr.cpt),
      usdt_deposited: r2(fromU(num(sc.usdtTot.deposited))), usdt_withdrawn: r2(fromU(num(sc.usdtTot.withdrawn))),
      spent_by_kind: Object.entries(sc.spent).map(([k, v]) => ({ kind: k, tfuel: r2(num(v) / pr.cpt) })),
    },
    scanned_at: sc.at,
  };
}

// ---- Queue ----
type QItem = { kind: "usdt" | "tf"; id: string; uid: string; name: string; network: string; address: string; amount: number; unit: string; usdt: number; fee: number; created_at: number; hold: string };
async function queue() {
  const [pr, wTf, wU] = await Promise.all([pricing(), val("withdrawals"), val("usdt_withdrawals")]);
  const items: QItem[] = [];
  for (const [id, w] of entries(wU)) if (w.status === "pending") items.push({ kind: "usdt", id, uid: String(w.uid || ""), name: String(w.name || ""), network: String(w.network_name || w.network || ""), address: String(w.address || ""), amount: num(w.amount), unit: "USDT", usdt: num(w.amount), fee: num(w.fee), created_at: num(w.created_at), hold: String(w.hold || "") });
  for (const [id, w] of entries(wTf)) if (w.status === "pending") { const tf = num(w.amount) / pr.cpt; items.push({ kind: "tf", id, uid: String(w.uid || ""), name: String(w.name || ""), network: String(w.method || ""), address: String(w.account || ""), amount: r2(tf), unit: "TFUEL", usdt: r2(tf * pr.price), fee: 0, created_at: num(w.created_at), hold: String(w.hold || "") }); }
  items.sort((a, c) => a.created_at - c.created_at);
  return { items, price: pr.price };
}

type BulkRes = { kind: string; id: string; ok: boolean; error?: string };
export async function bulkSettle(list: any, pay: boolean, reason: string, who: string): Promise<BulkRes[]> {
  if (!Array.isArray(list) || !list.length) throw new HttpError(400, "Select at least one withdrawal");
  if (list.length > 100) throw new HttpError(400, "At most 100 at a time");
  const seen = new Set<string>();
  const out: BulkRes[] = [];
  for (const it of list) {
    const kind = it?.kind === "tf" ? "tf" : it?.kind === "usdt" ? "usdt" : "";
    const id = String(it?.id || "");
    const key = `${kind}:${id}`;
    if (!kind || !idRe.test(id)) { out.push({ kind, id, ok: false, error: "Invalid item" }); continue; }
    if (seen.has(key)) { out.push({ kind, id, ok: false, error: "Duplicate in selection" }); continue; }
    seen.add(key);
    try {
      // fresh status check right before acting (settle* also re-checks atomically in a transaction)
      const cur = await val(kind === "usdt" ? `usdt_withdrawals/${id}` : `withdrawals/${id}`);
      if (!cur) throw new HttpError(404, "Not found");
      if (cur.status !== "pending") throw new HttpError(409, `Already ${cur.status}`);
      if (pay && cur.hold) throw new HttpError(409, "On HOLD - release it first");
      if (kind === "usdt") await settleUsdtWithdrawal(id, pay, reason, who);
      else await settleTfWithdrawal(id, pay ? "paid" : "rejected", reason, who);
      out.push({ kind, id, ok: true });
    } catch (e: any) {
      out.push({ kind, id, ok: false, error: e?.message === "not_pending" ? "Already handled" : String(e?.message || "Failed").slice(0, 160) });
    }
  }
  scan = null;
  await adminLog(who, pay ? "bulk_pay" : "bulk_reject", { ok: out.filter((x) => x.ok).length, failed: out.filter((x) => !x.ok).length, reason });
  return out;
}

// ---- Reconciliation ----
async function recon(monthIn: any) {
  const m = monthRange(monthIn);
  const [pr, wTf, wU, dep] = await Promise.all([pricing(), val("withdrawals"), val("usdt_withdrawals"), val("deposits")]);
  const inM = (t: number) => t >= m.from && t < m.to;
  const withdrawals: any[] = [];
  for (const [id, w] of entries(wU)) if (w.status === "paid" && inM(num(w.handled_at))) withdrawals.push({ id, uid: String(w.uid || ""), network: String(w.network_name || w.network || ""), address: String(w.address || ""), amount: num(w.amount), fee: num(w.fee), receive: num(w.receive) || r6(num(w.amount) - num(w.fee)), unit: "USDT", paid_at: num(w.handled_at), note: String(w.note || "") });
  for (const [id, w] of entries(wTf)) if (w.status === "paid" && inM(num(w.handled_at))) withdrawals.push({ id, uid: String(w.uid || ""), network: String(w.method || ""), address: String(w.account || ""), amount: r6(num(w.amount) / pr.cpt), fee: 0, receive: r6(num(w.amount) / pr.cpt), unit: "TFUEL", paid_at: num(w.handled_at), note: String(w.note || "") });
  withdrawals.sort((a, c) => a.paid_at - c.paid_at);
  const deposits: any[] = [];
  for (const [id, d] of entries(dep)) if (d.status === "approved" && inM(num(d.handled_at))) deposits.push({ id, uid: String(d.uid || ""), network: String(d.network_name || d.network || ""), txid: String(d.txid || ""), claimed: num(d.amount), credited: num(d.credited), at: num(d.handled_at), note: String(d.note || "") });
  deposits.sort((a, c) => a.at - c.at);
  const sum = (a: any[], k: string, unit?: string) => r6(a.filter((x) => !unit || x.unit === unit).reduce((s, x) => s + num(x[k]), 0));
  return {
    month: m.key, withdrawals, deposits,
    totals: { usdt_amount: sum(withdrawals, "amount", "USDT"), usdt_fee: sum(withdrawals, "fee", "USDT"), usdt_receive: sum(withdrawals, "receive", "USDT"), tfuel_amount: sum(withdrawals, "amount", "TFUEL"), deposits_credited: sum(deposits, "credited"), deposits_claimed: sum(deposits, "claimed") },
  };
}

const mod: AdminMod = async (action, b, ctx) => {
  switch (action) {
    case "opsLiability":
      return b.refresh ? (scan = null, await liability()) : await liability();
    case "opsSetHoldings": {
      const usdt = Number(b.usdt);
      if (!Number.isFinite(usdt) || usdt < 0 || usdt > 1e12) throw new HttpError(400, "Enter a valid amount (0 or more)");
      await db().ref("admin_cfg/holdings").set({ usdt: r2(usdt), note: clip(b.note, 200), by: ctx.who, at: Date.now() });
      await adminLog(ctx.who, "holdings_set", { usdt: r2(usdt) });
      return await liability();
    }
    case "opsPnl":
      return await incomeExpense(b.month);
    case "opsQueue":
      return await queue();
    case "opsBulkPay":
    case "opsBulkReject": {
      const pay = action === "opsBulkPay";
      const reason = clip(b.reason, 200);
      if (!pay && reason.length < 3) throw new HttpError(400, "Enter a reason for the rejection");
      const results = await bulkSettle(b.items, pay, reason, ctx.who);
      return { results, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
    }
    case "opsRecon":
      return await recon(b.month);
    default:
      return undefined;
  }
};
export default mod;

import crypto from "crypto";
import { db } from "./firebase";
import { getCfg2, setCfg2 } from "./cfg2";
import { getSettings } from "./settings";
import { dayKey } from "./log";
import { sortableId } from "./crypto";
import { creditCoins } from "./coins";
import { notify } from "./notify";
import { postToChannel } from "./broadcast";
import { appBase } from "./mailtpl";

/** newest N children (falls back to a full read where ordering is unavailable) */
async function lastN(path: string, n: number): Promise<Record<string, any>> {
  try { return ((await db().ref(path).orderByKey().limitToLast(n).get()).val() || {}) as Record<string, any>; }
  catch { const all = ((await db().ref(path).get()).val() || {}) as Record<string, any>; return Object.fromEntries(Object.entries(all).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-n)); }
}

/** ---------- error monitor: err_log/<id> (last ~100), shown in Admin → Health ---------- */
export async function logErr(src: string, e: unknown) {
  try {
    const msg = String((e as any)?.message || e || "error").replace(/[\u0000-\u001f]/g, " ").slice(0, 200);
    await db().ref(`err_log/${sortableId()}`).set({ src: String(src).slice(0, 40), msg, at: Date.now() });
  } catch {}
  return null;
}
export async function errList() {
  const v = await lastN("err_log", 100);
  return Object.entries(v).map(([id, x]) => ({ id, ...x })).sort((a, b) => b.at - a.at);
}
export async function errTrim() {
  const v = Object.keys(((await db().ref("err_log").get()).val() || {}) as Record<string, any>).sort();
  if (v.length > 100) { const up: Record<string, null> = {}; for (const k of v.slice(0, v.length - 100)) up[`err_log/${k}`] = null; await db().ref().update(up); }
}

/** ---------- community goal: "N people claim the daily reward today → everybody who did gets a bonus" ---------- */
export async function gqTick(uid: string) {
  try {
    if (!(await getCfg2()).v20.gq.enabled) return;
    await db().ref(`gq/${dayKey()}/u/${uid}`).set(1);
  } catch {}
}
export async function gqView() {
  const c = (await getCfg2()).v20.gq;
  if (!c.enabled) return null;
  const d = dayKey();
  const [u, paid] = await Promise.all([db().ref(`gq/${d}/u`).get(), db().ref(`gq/${d}/paid`).get()]);
  const n = Object.keys((u.val() || {}) as object).length;
  return { title: c.title, target: c.target, bonus: c.bonus, n, done: !!paid.val() };
}
/** cron: when the goal is reached, pay everybody once and announce it */
export async function runGroupQuest(): Promise<number> {
  const c = (await getCfg2()).v20.gq;
  if (!c.enabled) return 0;
  const d = dayKey();
  const u = Object.keys(((await db().ref(`gq/${d}/u`).get()).val() || {}) as object);
  if (u.length < c.target) return 0;
  let first = false;
  await db().ref(`gq/${d}/paid`).transaction((x: number | null) => { first = x === null; return x === null ? Date.now() : undefined; });
  if (!first) return 0;
  let n = 0;
  for (const uid of u.slice(0, 5000)) {
    if (await creditCoins(uid, c.bonus, "prize", "prize", `Community goal: ${c.title}`).catch(() => false)) { n++; await notify(uid, `🎉 Community goal reached! +${c.bonus} coins for you.`).catch(() => {}); }
  }
  await postToChannel(`🎉 ${c.title}: ${u.length} players did it today — everyone who joined got +${c.bonus} coins!`).catch(() => {});
  return n;
}

/** ---------- bonus events: announce once when they start ---------- */
export async function runEvents(): Promise<number> {
  const cfg = (await getCfg2(true)).v20;
  const now = Date.now();
  const due = cfg.events.filter((e) => e.on && !e.ann && e.start <= now && now < e.end);
  if (!due.length) return 0;
  for (const e of due) {
    const s = await getSettings();
    await postToChannel(`⚡ ${e.title}\n\n×${e.mult} rewards on daily claims, tasks and games until ${new Date(e.end).toISOString().replace("T", " ").slice(0, 16)} UTC. ${s.referral_link ? "\n👉 " + s.referral_link : ""}`).catch(() => {});
  }
  await setCfg2("v20", { ...cfg, events: cfg.events.map((e) => (due.some((d) => d.id === e.id) ? { ...e, ann: true } : e)) });
  return due.length;
}

/** ---------- support: close tickets nobody answered for N days ---------- */
export async function runTicketClose(): Promise<number> {
  const days = (await getCfg2()).v20.ticket_close_days;
  if (!days) return 0;
  const all = await lastN("tickets", 300);
  const lim = Date.now() - days * 86400000;
  let n = 0;
  for (const [id, t] of Object.entries(all)) {
    if (t.status !== "answered" || (t.updated_at || 0) > lim) continue; // only tickets where support replied last and the user stayed silent
    await db().ref().update({ [`tickets/${id}/status`]: "closed", [`user_tickets/${t.uid}/${id}/status`]: "closed" });
    await notify(t.uid, `🎫 Your ticket "${String(t.subject).slice(0, 40)}" was closed because there was no reply for ${days} days. You can open a new one any time.`).catch(() => {});
    n++;
  }
  return n;
}

/** ---------- money integrity check (admin) ---------- */
export async function integrityScan() {
  const users = ((await db().ref("users").get()).val() || {}) as Record<string, any>;
  const issues: { uid: string; what: string }[] = [];
  let usersN = 0, coins = 0, usdt = 0;
  for (const [uid, u] of Object.entries(users)) {
    usersN++;
    const b = Number(u.balance), uu = Number(u.usdt_u ?? 0);
    coins += Number.isFinite(b) ? b : 0; usdt += Number.isFinite(uu) ? uu : 0;
    if (!Number.isFinite(b)) issues.push({ uid, what: "balance is not a number" });
    else if (b < 0) issues.push({ uid, what: `negative balance ${b}` });
    else if (!Number.isInteger(b)) issues.push({ uid, what: `balance has decimals (${b})` });
    if (!Number.isFinite(uu)) issues.push({ uid, what: "USDT balance is not a number" });
    else if (uu < 0) issues.push({ uid, what: `negative USDT balance ${uu}` });
    if (issues.length >= 200) break;
  }
  const holds = ((await db().ref("xfer_hold").get()).val() || {}) as Record<string, any>;
  const stuck = Object.entries(holds).filter(([, h]) => h.st === "held" && Date.now() > (h.rel || 0) + 3600000);
  for (const [id, h] of stuck.slice(0, 50)) issues.push({ uid: String(h.from), what: `held transfer ${id} is overdue for release` });
  const orders = await lastN("shop_orders", 300);
  for (const [id, o] of Object.entries(orders)) if (o.status === "open" && (o.exp || 0) < Date.now() - 7 * 86400000) { /* old open orders are harmless */ }
  return { users: usersN, coins, usdt_u: usdt, issues: issues.slice(0, 200) };
}

/** ---------- CSV export (admin) ---------- */
const csvCell = (v: unknown) => { let t = String(v ?? ""); if (/^[=+\-@]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
export async function exportCsv(kind: string): Promise<{ name: string; csv: string }> {
  const rows: unknown[][] = [];
  const day = new Date().toISOString().slice(0, 10);
  if (kind === "users") {
    rows.push(["id", "name", "balance_coins", "usdt_u", "banned", "joined", "last_seen"]);
    const u = ((await db().ref("users").get()).val() || {}) as Record<string, any>;
    for (const [id, x] of Object.entries(u)) rows.push([id, x.name || "", x.balance ?? 0, x.usdt_u ?? 0, x.banned ? 1 : 0, x.created_at ? new Date(x.created_at).toISOString() : "", x.last_seen ? new Date(x.last_seen).toISOString() : ""]);
  } else if (kind === "orders") {
    rows.push(["id", "shop", "ref", "title", "usd", "status", "created"]);
    const o = ((await db().ref("shop_orders").get()).val() || {}) as Record<string, any>;
    for (const [id, x] of Object.entries(o)) rows.push([id, x.shop, x.ref, x.title, (Number(x.usd_u) || 0) / 1e6, x.status, x.created_at ? new Date(x.created_at).toISOString() : ""]);
  } else if (kind === "withdrawals") {
    rows.push(["id", "kind", "uid", "amount", "status", "network", "address", "created"]);
    for (const [path, k] of [["usdt_withdrawals", "usdt"], ["withdrawals", "tfuel"]] as const) {
      const w = ((await db().ref(path).get()).val() || {}) as Record<string, any>;
      for (const [id, x] of Object.entries(w)) rows.push([id, k, x.uid, x.amount, x.status, x.network_name || x.method || "", x.address || x.account || "", x.created_at ? new Date(x.created_at).toISOString() : ""]);
    }
  } else if (kind === "transfers") {
    rows.push(["id", "from", "to", "asset", "amount", "fee", "at"]);
    const t = ((await db().ref("transfers").get()).val() || {}) as Record<string, any>;
    for (const [id, x] of Object.entries(t)) rows.push([id, x.from, x.to, x.asset || "tfuel", x.amount, x.fee, x.at ? new Date(x.at).toISOString() : ""]);
  } else throw new Error("bad_kind");
  return { name: `tfuel-${kind}-${day}.csv`, csv: "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") };
}

/** ---------- shop: invoice link + sales chart ---------- */
const ikey = () => crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex");
export const invoiceSig = (oid: string, uid: string) => crypto.createHmac("sha256", ikey()).update(`inv|${oid}|${uid}`).digest("hex").slice(0, 20);
export const invoiceUrl = (oid: string, uid: string, base = appBase()) => `${base}/invoice?o=${encodeURIComponent(oid)}&u=${encodeURIComponent(uid)}&s=${invoiceSig(oid, uid)}`;
export async function shopSales(shop: string, days = 14) {
  const orders = await lastN("shop_orders", 2000);
  const out: Record<string, { n: number; usd: number }> = {};
  for (let i = days - 1; i >= 0; i--) out[dayKey(Date.now() - i * 86400000)] = { n: 0, usd: 0 };
  let refunded = 0, paid = 0;
  const buyers: Record<string, number> = {};
  for (const o of Object.values(orders)) {
    if (o.shop !== shop) continue;
    if (o.status === "refunded") refunded++;
    if (o.status !== "paid" && o.status !== "refunded") continue;
    paid++;
    const k = dayKey(o.paid_at || o.created_at || 0);
    if (out[k]) { out[k].n++; out[k].usd += (Number(o.usd_u) || 0) / 1e6; }
    if (o.uid) buyers[o.uid] = (buyers[o.uid] || 0) + (Number(o.usd_u) || 0) / 1e6;
  }
  const top = Object.entries(buyers).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([uid, usd]) => ({ uid, usd: Math.round(usd * 100) / 100 }));
  return { days: Object.entries(out).map(([day, v]) => ({ day, n: v.n, usd: Math.round(v.usd * 100) / 100 })), paid, refunded, refund_rate: paid ? Math.round((refunded / paid) * 1000) / 10 : 0, top };
}

export const vnum = (v: string) => { const p = String(v).split(".").map((x) => parseInt(x, 10) || 0); return (p[0] || 0) * 1e6 + (p[1] || 0) * 1e3 + (p[2] || 0); };

/** Big sends need a PIN: when the admin sets a USDT value limit, people without a PIN must create one first */
export async function pinGate(uid: string, asset: "tfuel" | "usdt", amount: number, s: import("./settings").Settings) {
  const lim = (await getCfg2()).v20.pin_over_usd;
  if (!(lim > 0)) return;
  let usd = 0;
  if (asset === "usdt") usd = amount / 1e6;
  else { const { getPrice } = await import("./market"); const p = await getPrice(s).catch(() => null); usd = (amount / (s.coins_per_tfuel || 1000)) * (p?.price || 0); }
  if (usd < lim) return;
  if ((await db().ref(`user_prefs/${uid}/pin`).get()).exists()) return;
  const { HttpError } = await import("./auth");
  throw new HttpError(403, "pin_needed_set");
}

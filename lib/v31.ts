import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2, type Xchg, type XMethod } from "./cfg2";
import { sortableId } from "./crypto";
import { weekIndex } from "./wallet";
import { notify } from "./notify";
import { alertAdmins, alertTargets } from "./adminalert";
import { tgCall } from "./telegram";
import { dayKey } from "./log";
import { getSettings } from "./settings";
import { appBase } from "./mailtpl";
import crypto from "crypto";

const U = 1e6;
const val = async (p: string) => (await db().ref(p).get()).val();
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const hmacKey = () => crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex");
const sig = (s: string) => crypto.createHmac("sha256", hmacKey()).update(s).digest("hex").slice(0, 20);

/* ───────── 1. fee discount tiers (weekly volume) ───────── */
export async function tierFor(uid: string) {
  const c = (await getCfg2()).v31.tiers;
  if (!c.on || !c.list.length) return { on: false, vol: 0, off: 0, next: null as null | { vol: number; off: number } };
  const w = weekIndex();
  const [a, b] = await Promise.all([val(`xchg_week/${w}/${uid}`), val(`xchg_week/${w - 1}/${uid}`)]);
  const vol = r2(Math.max(Number(a) || 0, Number(b) || 0) / U);
  let off = 0;
  for (const t of c.list) if (vol >= t.vol) off = t.off;
  const next = c.list.find((t) => t.vol > vol && t.off > off) || null;
  return { on: true, vol, off, next };
}
/** the fee % the user really pays */
export const feeAfter = (pct: number, off: number) => Math.round(pct * (1 - Math.min(100, Math.max(0, off)) / 100) * 1000) / 1000;

/* ───────── 2. higher daily limit for Trusted users ───────── */
export const dailyLimit = (c: Xchg, trusted: boolean) => (c.daily_max_usdt > 0 ? c.daily_max_usdt * (trusted ? Math.max(1, c.trusted_x || 1) : 1) : 0);

/* ───────── 4. opening hours of one payment method ───────── */
export function methodOpen(c: Xchg, m: XMethod, now = Date.now()): { open: boolean; text: string } {
  if (!m.h_on) return { open: true, text: "" };
  const h = (((now / 3600000 + c.tz_h) % 24) + 24) % 24;
  const open = m.h_from < m.h_to ? h >= m.h_from && h < m.h_to : h >= m.h_from || h < m.h_to;
  const f = (x: number) => `${String(x % 24).padStart(2, "0")}:00`;
  return { open, text: `${m.name} is available ${f(m.h_from)}–${f(m.h_to)} (UTC${c.tz_h >= 0 ? "+" : ""}${c.tz_h}).` };
}

/* ───────── 3. chat inside an exchange order ───────── */
interface Msg { f: "u" | "a"; t: string; at: number; by?: string }
const idOk = (id: string) => String(id || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
export async function xChatList(id: string, uid?: string) {
  id = idOk(id);
  const o = (await val(`xorders/${id}`)) as any;
  if (!o || (uid && o.uid !== uid)) throw new HttpError(404, "not_found");
  const m = ((await val(`xchat/${id}`)) || {}) as Record<string, Msg>;
  return Object.values(m).sort((a, b) => a.at - b.at).slice(-60).map((x) => ({ f: x.f, t: x.t, at: x.at }));
}
export async function xChatSend(uid: string, name: string, id: string, text: any) {
  id = idOk(id);
  const t = clean(text, 300);
  if (t.length < 1) throw new HttpError(400, "Write a message.");
  const o = (await val(`xorders/${id}`)) as any;
  if (!o || o.uid !== uid) throw new HttpError(404, "not_found");
  if (Date.now() - o.at > 14 * 864e5) throw new HttpError(409, "This order is too old for new messages. Open a support ticket instead.");
  const n = Object.values(((await val(`xchat/${id}`)) || {}) as Record<string, Msg>).filter((x) => x.f === "u").length;
  if (n >= 30) throw new HttpError(429, "Message limit reached for this order. Open a support ticket instead.");
  await db().ref(`xchat/${id}/${sortableId()}`).set({ f: "u", t, at: Date.now() } as Msg);
  await db().ref(`xchat_open/${id}`).set(Date.now());
  await alertAdmins("exchange", `💬 Exchange order #${id.slice(-6)} (${o.kind === "buy" ? "Buy" : "Sell"} ${o.usdt_u / U} USDT) — ${clean(name, 20)}: ${t}`).catch(() => {});
  return xChatList(id, uid);
}
export async function xChatAdmin(who: string, id: string, text: any) {
  id = idOk(id);
  const t = clean(text, 300);
  if (!t) throw new HttpError(400, "Write a message.");
  const o = (await val(`xorders/${id}`)) as any;
  if (!o) throw new HttpError(404, "not_found");
  await db().ref(`xchat/${id}/${sortableId()}`).set({ f: "a", t, at: Date.now(), by: clean(who, 20) } as Msg);
  await db().ref(`xchat_open/${id}`).remove();
  await notify(o.uid, `💬 Exchange order #${id.slice(-6)}: ${t}`).catch(() => {});
  return xChatList(id);
}
/** orders where the user wrote last (admin sees a dot) */
export async function xChatWaiting(): Promise<string[]> { return Object.keys(((await val("xchat_open")) || {}) as Record<string, number>); }

/* ───────── 5 + 7. invoice due date, overdue, reminders ───────── */
export async function runInvReminders(): Promise<number> {
  const c = await getCfg2();
  if (!c.v31.inv_remind) return 0;
  const now = Date.now();
  let all: Record<string, any> = {};
  try { all = ((await db().ref("invoices").orderByKey().limitToLast(400).get()).val() || {}) as any; } catch { return 0; }
  let n = 0;
  for (const [id, v] of Object.entries(all)) {
    if (v.st !== "open" || !v.due || v.exp < now) continue;
    const stage = now >= v.due + 3 * 864e5 ? "c" : now >= v.due ? "b" : now >= v.due - 864e5 ? "a" : "";
    if (!stage || v.rem?.[stage]) continue;
    const g = await db().ref(`invoices/${id}/rem/${stage}`).transaction((x: number | null) => (x ? undefined : now));
    if (!g.committed) continue;
    if ((await val(`user_prefs/${v.uid}/mute/remind`))) continue;
    const what = `“${String(v.title).slice(0, 40)}”`;
    const txt = stage === "a" ? `⏰ Your invoice ${what} is due within 24 hours and still unpaid.` : stage === "b" ? `⚠️ Your invoice ${what} is now overdue. You can share the link again from Send → Invoices.` : `⚠️ Your invoice ${what} is still unpaid, 3 days overdue. Cancel it or send the link again.`;
    await notify(v.uid, txt).catch(() => {});
    n++;
  }
  return n;
}

/* ───────── 6. customer "My purchases" ───────── */
export async function purchaseList(uid: string) {
  let rows: Record<string, any> = {};
  try { rows = ((await db().ref(`user_purchases/${uid}`).orderByKey().limitToLast(60).get()).val() || {}) as any; } catch { rows = ((await val(`user_purchases/${uid}`)) || {}) as any; }
  const { pageSig } = await import("./receipt");
  const list = Object.entries(rows).map(([id, x]) => ({ id, at: x.at, a: x.a as "tfuel" | "usdt", amt: Number(x.amt) || 0, shop: String(x.s || "Shop"), note: String(x.n || ""), url: x.tx ? `${appBase()}/receipt?t=${encodeURIComponent(x.tx)}&u=${encodeURIComponent(uid)}&s=${pageSig(x.tx, uid)}` : "" })).sort((a, b) => b.at - a.at);
  const s = await getSettings();
  const tot = { tfuel: 0, usdt: 0 };
  for (const p of list) tot[p.a] += p.amt;
  return { list, cpt: s.coins_per_tfuel, total: { tfuel: Math.round(tot.tfuel / s.coins_per_tfuel * 100) / 100, usdt: r2(tot.usdt / U) } };
}

/* ───────── 9. quick send: people I pay most ───────── */
export async function quickList(uid: string) {
  let rows: any[] = [];
  try { rows = Object.values(((await db().ref(`user_xfers/${uid}`).orderByKey().limitToLast(150).get()).val() || {}) as Record<string, any>); } catch { rows = []; }
  const m = new Map<string, { code: string; name: string; n: number; at: number }>();
  for (const r of rows) {
    if (r.d !== "out" || r.st !== "done" || !r.pc) continue;
    const e = m.get(r.pc) || { code: String(r.pc), name: String(r.peer || ""), n: 0, at: 0 };
    e.n++; e.at = Math.max(e.at, r.at || 0);
    m.set(r.pc, e);
  }
  return [...m.values()].filter((x) => x.n >= 2).sort((a, b) => b.n - a.n || b.at - a.at).slice(0, 5);
}

/* ───────── 8. monthly recap (+ shareable picture) ───────── */
export async function recapGet(uid: string, which: string) {
  const now = new Date();
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (which === "prev" ? 1 : 0), 1);
  const to = which === "prev" ? Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) : Date.now() + 1;
  const s = await getSettings();
  let rows: any[] = [];
  try { rows = Object.values(((await db().ref(`user_xfers/${uid}`).orderByKey().limitToLast(500).get()).val() || {}) as Record<string, any>); } catch { rows = []; }
  rows = rows.filter((r) => r.at >= base && r.at < to && r.st === "done");
  const sum = (d: string, a: string) => rows.filter((r) => r.d === d && r.a === a).reduce((x, r) => x + (Number(r.amt) || 0), 0);
  const out = { n: rows.filter((r) => r.d === "out").length, tfuel: sum("out", "tfuel") / s.coins_per_tfuel, usdt: sum("out", "usdt") / U };
  const inn = { n: rows.filter((r) => r.d === "in").length, tfuel: sum("in", "tfuel") / s.coins_per_tfuel, usdt: sum("in", "usdt") / U };
  const peers = new Map<string, number>();
  for (const r of rows) if (r.d === "out" && r.peer) peers.set(String(r.peer), (peers.get(String(r.peer)) || 0) + 1);
  const top = [...peers.entries()].sort((a, b) => b[1] - a[1])[0];
  const xo = Object.values(((await val(`user_xorders/${uid}`)) || {}) as Record<string, any>).filter((o: any) => o.st === "done" && o.at >= base && o.at < to);
  const ex = { n: xo.length, usdt: r2(xo.reduce((a: number, o: any) => a + (Number(o.usdt_u) || 0), 0) / U) };
  const label = new Date(base).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const r = { label, out: { n: out.n, tfuel: r2(out.tfuel), usdt: r2(out.usdt) }, in: { n: inn.n, tfuel: r2(inn.tfuel), usdt: r2(inn.usdt) }, ex, top: top ? { name: top[0], n: top[1] } : null };
  const d = Buffer.from(JSON.stringify({ l: label, so: r.out.n, si: r.in.n, t1: r.out.tfuel, t2: r.in.tfuel, u1: r.out.usdt, u2: r.in.usdt, x: ex.n, xu: ex.usdt })).toString("base64url");
  return { ...r, img: `${appBase()}/api/recap?d=${d}&s=${sig("rc|" + d)}` };
}

/* ───────── 10. weekly digest (opt-in) ───────── */
export async function digestGet(uid: string) { return !!(await val(`digest_users/${uid}`)); }
export async function digestSet(uid: string, on: any) {
  if (on) await db().ref(`digest_users/${uid}`).set(Date.now()); else await db().ref(`digest_users/${uid}`).remove();
  return !!on;
}
export async function runDigests(): Promise<number> {
  const c = await getCfg2();
  if (!c.v31.digest) return 0;
  const d = new Date();
  if (d.getUTCDay() !== 1 || d.getUTCHours() < 3) return 0;
  const w = weekIndex();
  const users = Object.keys(((await val("digest_users")) || {}) as Record<string, number>).slice(0, 400);
  const s = await getSettings();
  let n = 0;
  for (const uid of users) {
    if (n >= 150) break;
    const g = await db().ref(`digest_sent/${w}/${uid}`).transaction((x: number | null) => (x ? undefined : Date.now()));
    if (!g.committed) continue;
    let rows: any[] = [];
    try { rows = Object.values(((await db().ref(`user_xfers/${uid}`).orderByKey().limitToLast(200).get()).val() || {}) as Record<string, any>); } catch {}
    const since = Date.now() - 7 * 864e5;
    rows = rows.filter((r) => r.at >= since && r.st === "done");
    const sent = rows.filter((r) => r.d === "out").length, got = rows.filter((r) => r.d === "in").length;
    const u = (await val(`users/${uid}`)) as any;
    if (!u) continue;
    const bal = Math.round((Number(u.balance) || 0) / s.coins_per_tfuel * 100) / 100;
    await notify(uid, `📬 Your week: ${sent} sent, ${got} received. Balance ${bal} TFUEL${(u.usdt_u || 0) > 0 ? ` · ${r2(u.usdt_u / U)} USDT` : ""}. Turn this off in Settings any time.`).catch(() => {});
    n++;
  }
  return n;
}

/* ───────── 11. admin morning brief ───────── */
export async function runAdminBrief(): Promise<number> {
  const c = await getCfg2();
  if (!c.v31.adm_daily || new Date().getUTCHours() < 2) return 0;
  const day = dayKey();
  const g = await db().ref("stats/brief31").transaction((x: string | null) => (x === day ? undefined : day));
  if (!g.committed) return 0;
  const text = await adminBriefText();
  let n = 0;
  for (const chat of alertTargets("").slice(0, 3)) { await tgCall("sendMessage", { chat_id: chat, text }).catch(() => {}); n++; }
  return n;
}
export async function adminBriefText() {
  const since = Date.now() - 864e5;
  let ords: any[] = [];
  try { ords = Object.values(((await db().ref("xorders").orderByKey().limitToLast(400).get()).val() || {}) as Record<string, any>); } catch {}
  const done = ords.filter((o) => o.st === "done" && (o.done_at || o.at) >= since);
  const vol = r2(done.reduce((a, o) => a + (o.usdt_u || 0), 0) / U);
  const wait = ords.filter((o) => o.st === "pending" || o.st === "paying").length;
  const { adminTodo } = await import("./v28");
  const t = await adminTodo().catch(() => ({ items: [] as any[], total: 0 }));
  const todo = (t.items as any[]).filter((i) => i.n > 0).map((i) => `• ${i.label}: ${i.n}`).join("\n");
  const users = Number((await val(`stats/new_users/${dayKey(Date.now() - 864e5)}`)) || 0);
  return `☀️ Morning brief\n👤 New users yesterday: ${users}\n💱 Exchange done (24 h): ${done.length} orders · ${vol} USDT\n⏳ Exchange waiting now: ${wait}${todo ? `\n\nTo do:\n${todo}` : "\n\nNothing waiting. 🎉"}`;
}

/* ───────── 12. CSV export ───────── */
const cell = (v: any) => { let s = String(v ?? ""); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function xCsv(days: number) {
  let all: Record<string, any> = {};
  try { all = ((await db().ref("xorders").orderByKey().limitToLast(1000).get()).val() || {}) as any; } catch { all = {}; }
  const from = Date.now() - Math.max(1, Math.min(365, Math.floor(days) || 30)) * 864e5;
  const head = ["order", "date_utc", "user_id", "name", "kind", "method", "usdt", "rate", "fee", "amount", "currency", "status", "payment_ref", "handled_by"];
  const rows = Object.entries(all).filter(([, o]) => o.at >= from).sort((a, b) => a[1].at - b[1].at).map(([id, o]) => [id, new Date(o.at).toISOString().replace("T", " ").slice(0, 19), o.uid, o.name, o.kind, o.mname, (o.usdt_u || 0) / U, o.rate, o.fee_fiat, o.fiat, o.cur, o.st, o.ref || "", o.by || ""]);
  return [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}

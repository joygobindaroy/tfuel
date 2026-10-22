import { db } from "./firebase";
import { dayKey } from "./log";

export interface Row { id: string; c: number; l: number; tasks: string[]; dep: boolean; wd: boolean; did: boolean }
const DAY = 86400000;
let cache: { at: number; rows: Row[] } | null = null;

/** Bounded scan of users (max 30k), compact rows, cached 10 min */
export async function scanUsers(force = false): Promise<Row[]> {
  if (!force && cache && Date.now() - cache.at < 600000) return cache.rows;
  const all = ((await db().ref("users").get()).val() || {}) as Record<string, any>;
  const rows: Row[] = Object.entries(all).slice(0, 30000).map(([id, u]) => ({
    id,
    c: Number(u.created_at) || 0,
    l: Number(u.last_seen) || 0,
    tasks: Object.keys(u.completed_tasks || {}),
    dep: Number(u.usdt_tot?.deposited) > 0,
    wd: Number(u.spent?.withdrawn) > 0 || Number(u.usdt_tot?.withdrawn) > 0,
    did: Object.keys(u.completed_tasks || {}).length > 0 || Number(u.earn?.tasks) > 0 || Number(u.earn?.articles) > 0,
  }));
  cache = { at: Date.now(), rows };
  return rows;
}
export const resetScan = () => { cache = null; };

/** D1/D7/D30: of users old enough, how many were seen again on/after day N after joining (approximate: based on last_seen) */
export function retention(rows: Row[], now = Date.now()) {
  return [1, 7, 30].map((n) => {
    const elig = rows.filter((r) => r.c && r.c <= now - n * DAY && r.c >= now - (n + 60) * DAY);
    const kept = elig.filter((r) => r.l >= r.c + n * DAY).length;
    return { day: n, users: elig.length, kept, pct: elig.length ? Math.round((kept / elig.length) * 1000) / 10 : 0 };
  });
}

export function funnel(rows: Row[]) {
  const joined = rows.length, did = rows.filter((r) => r.did).length, dep = rows.filter((r) => r.dep).length, wd = rows.filter((r) => r.wd).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return [
    { step: "Joined", n: joined, pct: 100 },
    { step: "Did a task / article", n: did, pct: pct(did, joined) },
    { step: "Deposited", n: dep, pct: pct(dep, joined) },
    { step: "Withdrew", n: wd, pct: pct(wd, joined) },
  ];
}

export function taskCounts(rows: Row[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) for (const t of r.tasks) out[t] = (out[t] || 0) + 1;
  return out;
}

async function recent(path: string, n: number) {
  const snap = await db().ref(path).orderByKey().limitToLast(n).get();
  const out: any[] = [];
  snap.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
  return out;
}

/** Per-day series for the last `days` days (oldest first) */
export async function series(days = 30) {
  const [dau, nu, dep, wd, uw] = await Promise.all([
    db().ref("stats/dau").orderByKey().limitToLast(days).get(),
    db().ref("stats/new_users").orderByKey().limitToLast(days).get(),
    recent("deposits", 500), recent("withdrawals", 500), recent("usdt_withdrawals", 500),
  ]);
  const d = (dau.val() || {}) as Record<string, number>, n = (nu.val() || {}) as Record<string, number>;
  const out: Record<string, any>[] = [];
  const idx: Record<string, any> = {};
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(Date.now() - i * DAY);
    idx[k] = { day: k, active: Number(d[k]) || 0, joined: Number(n[k]) || 0, depositU: 0, payoutU: 0, withdraws: 0 };
    out.push(idx[k]);
  }
  for (const x of dep) { const r = idx[dayKey(x.created_at || 0)]; if (r && x.status === "approved") r.depositU += Number(x.amount) || 0; }
  for (const x of uw) { const r = idx[dayKey(x.created_at || 0)]; if (r) { r.withdraws++; if (x.status === "paid") r.payoutU += Number(x.amount) || 0; } }
  for (const x of wd) { const r = idx[dayKey(x.created_at || 0)]; if (r) r.withdraws++; }
  return out;
}

/** Yesterday (UTC) summary */
export async function daySummary(day = dayKey(Date.now() - DAY)) {
  const s = await series(3);
  const r = s.find((x) => x.day === day) || { active: 0, joined: 0, depositU: 0, payoutU: 0, withdraws: 0 };
  const pend = [...(await recent("usdt_withdrawals", 300)), ...(await recent("withdrawals", 300))].filter((x) => x.status === "pending").length;
  const tickets = (await recent("tickets", 200)).filter((t) => t.status === "open").length;
  return { day, joined: r.joined, active: r.active, depositU: Math.round(r.depositU * 100) / 100, payoutU: Math.round(r.payoutU * 100) / 100, withdraws: r.withdraws, pendingPayouts: pend, openTickets: tickets };
}
export const summaryText = (x: Awaited<ReturnType<typeof daySummary>>) =>
  `Daily summary (${x.day.slice(0, 4)}-${x.day.slice(4, 6)}-${x.day.slice(6)} UTC)\n👤 New users: ${x.joined}\n🔥 Active: ${x.active}\n⬇️ Deposits: ${x.depositU} USDT\n⬆️ Paid out: ${x.payoutU} USDT (${x.withdraws} requests)\n⏳ Pending payouts: ${x.pendingPayouts}\n🎫 Open tickets: ${x.openTickets}`;

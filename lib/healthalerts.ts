import { db } from "./firebase";
import { getCfg2 } from "./cfg2";
import { alertAdmins } from "./adminalert";
import { getPrice } from "./market";
import type { Settings } from "./settings";

async function recent(path: string, n: number) {
  const snap = await db().ref(path).orderByKey().limitToLast(n).get();
  const out: any[] = [];
  snap.forEach((c) => { out.push({ id: c.key, ...c.val() }); });
  return out;
}

/** Live health picture (used by the public status page and the alert job) */
export async function healthSnapshot(s: Settings) {
  const cfg = await getCfg2();
  const now = Date.now();
  const comps: { name: string; level: "ok" | "degraded" | "outage"; msg: string }[] = [];
  let cronAt = 0;
  try { cronAt = Number((await db().ref("stats/cron_at").get()).val()) || 0; comps.push({ name: "App & database", level: "ok", msg: "Operational" }); } catch { comps.push({ name: "App & database", level: "outage", msg: "Database not reachable" }); }
  try { const p = await getPrice(s); comps.push({ name: "TFUEL price feed", level: p && !p.stale ? "ok" : "degraded", msg: p && !p.stale ? "Live" : "Delayed — trading may pause" }); } catch { comps.push({ name: "TFUEL price feed", level: "degraded", msg: "Unavailable" }); }
  if (s.binance_auto) { const bc = (await db().ref("stats/binance_check").get()).val() as any; comps.push({ name: "Automatic deposits", level: bc?.ok ? "ok" : "degraded", msg: bc?.ok ? "Operational" : "Slower than usual — deposits are checked manually" }); }
  const [up, wp] = await Promise.all([recent("usdt_withdrawals", 150), recent("withdrawals", 100)]);
  const pend = [...up, ...wp].filter((x) => x.status === "pending");
  const oldest = pend.reduce((a, x) => Math.min(a, x.created_at || now), now);
  const lateH = pend.length ? (now - oldest) / 3600000 : 0;
  comps.push({ name: "Withdrawals", level: lateH > cfg.alerts.pending_hours ? "degraded" : "ok", msg: lateH > cfg.alerts.pending_hours ? "Review is taking longer than usual" : "Processed normally" });
  const cronOld = cronAt && now - cronAt > 36 * 3600000;
  comps.push({ name: "Scheduled jobs", level: cronOld ? "degraded" : "ok", msg: cronOld ? "Delayed" : "Running" });
  const worst = comps.some((c) => c.level === "outage") ? "outage" : comps.some((c) => c.level === "degraded") ? "degraded" : "ok";
  const level = cfg.status.level !== "ok" ? cfg.status.level : worst;
  return { level, note: cfg.status.note, comps, pending: pend.length, lateH: Math.round(lateH), at: now };
}

/** Cron: alert the admin on a problem, at most once per 6 h per problem */
export async function runHealthAlerts(s: Settings): Promise<number> {
  const cfg = await getCfg2();
  if (!cfg.alerts.enabled) return 0;
  const snap = await healthSnapshot(s);
  let sent = 0;
  for (const c of snap.comps) {
    if (c.level === "ok") continue;
    const key = "h_" + c.name.replace(/\W+/g, "_").toLowerCase();
    const r = await db().ref(`alerts_state/${key}`).transaction((t: number | null) => (t && Date.now() - t < 6 * 3600000 ? undefined : Date.now()));
    if (!r.committed) continue;
    if (await alertAdmins("error", `Health: ${c.name} — ${c.msg}`)) sent++;
  }
  return sent;
}

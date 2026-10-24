import type { Settings } from "./settings";
import { db } from "./firebase";
import { pumpBroadcasts, runSchedule } from "./broadcast";
import { daySummary, summaryText } from "./insights";
import { alertTargets, alertAdmins } from "./adminalert";
import { tgCall } from "./telegram";
import { dayKey } from "./log";
import { snapDaily } from "./snapshot";

/** Cron: admin-side jobs (scheduled items, broadcasts, daily summary). Called from /api/cron. Must never throw. */
export async function runAdminJobs(s: Settings): Promise<Record<string, any>> {
  const out: Record<string, any> = {};
  try {
    out.schedule = (await runSchedule()).ran;
    out.broadcast = await pumpBroadcasts();
  } catch (e: any) {
    await alertAdmins("error", `Scheduled job failed: ${String(e?.message || e).slice(0, 120)}`).catch(() => {});
  }
  out.snapshot = await snapDaily().catch(() => false);
  try {
    const now = new Date();
    if (s.summary_enabled && now.getUTCHours() >= s.summary_hour_utc) {
      const today = dayKey();
      const r = await db().ref("stats/summary_sent").transaction((c: any) => (c === today ? undefined : today));
      if (r.committed) {
        const text = summaryText(await daySummary());
        let ok = 0;
        for (const c of alertTargets(s.alert_chat)) if ((await tgCall("sendMessage", { chat_id: c, text })).ok) ok++;
        out.summary = ok;
      }
    }
  } catch {}
  return out;
}

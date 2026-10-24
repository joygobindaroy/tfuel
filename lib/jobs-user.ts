import type { Settings } from "./settings";
import { sendEnergyFull } from "./jobs-energy";
import { sendDaySummaries } from "./jobs-summary";
import { runRetentionJobs } from "./jobs-retention";
import { ensureBotSynced } from "./botsync";
import { sendMoveAlerts } from "./moves";
import { runAutoBan } from "./risk";

/** Cron: user-side jobs (energy-full message, comeback, anniversary, …). Called from /api/cron. Must never throw. */
export async function runUserJobs(s: Settings): Promise<Record<string, any>> {
  void s;
  const out: Record<string, any> = {};
  out.energyFull = await sendEnergyFull(s).catch(() => 0); // fork-B
  out.summaries = await sendDaySummaries(s).catch(() => 0);
  await ensureBotSynced();
  out.moves = await sendMoveAlerts(s).catch(() => 0);
  out.autoban = await runAutoBan().catch(() => 0);
  out.retention = await runRetentionJobs(s).catch(() => null);
  return out;
}

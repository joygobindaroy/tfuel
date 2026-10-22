import type { Settings } from "./settings";
import { sendEnergyFull } from "./jobs-energy";
import { sendDaySummaries } from "./jobs-summary";

/** Cron: user-side jobs (energy-full message, comeback, anniversary, …). Called from /api/cron. Must never throw. */
export async function runUserJobs(s: Settings): Promise<Record<string, any>> {
  void s;
  const out: Record<string, any> = {};
  out.energyFull = await sendEnergyFull(s).catch(() => 0); // fork-B
  out.summaries = await sendDaySummaries(s).catch(() => 0);
  return out;
}

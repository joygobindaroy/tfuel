import type { Settings } from "./settings";
import { payClanWeek } from "./clan";
import { paySeason } from "./collect";
import { postWeeklyWinners, bossAlerts } from "./jobs-bot";

/** Cron: weekly clan prizes + collectibles season payout. Never throws. */
export async function runGameJobs(s: Settings): Promise<Record<string, any>> {
  return { clan: await payClanWeek().catch(() => 0), season: await paySeason().catch(() => 0), winners: await postWeeklyWinners(s).catch(() => 0), boss: await bossAlerts(s).catch(() => 0) };
}

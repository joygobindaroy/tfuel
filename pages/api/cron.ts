import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebase";
import { getSettings } from "@/lib/settings";
import { getPrice } from "@/lib/market";
import { processTriggers } from "@/lib/triggers";
import { payWeek } from "@/lib/leaderboard";
import { weekIndex } from "@/lib/wallet";
import { recheckAuto } from "@/lib/deposits";
import { healRecentStars } from "@/lib/stars";
import { runUserJobs } from "@/lib/jobs-user";
import { runAdminJobs } from "@/lib/jobs-admin";
import { sendDailyReminders } from "@/lib/remind";
import { runHealthAlerts } from "@/lib/healthalerts";
import { payRefContest } from "@/lib/growth2";
import { runGameJobs } from "@/lib/jobs-games";
import { releaseDueHolds } from "@/lib/transfer";
import { expireLinks } from "@/lib/xlink";
import { settleTours, remindTours } from "@/lib/mini";
import { runAutoPosts } from "@/lib/autopost";
import { runScheds, runNudges, sendStatements } from "@/lib/plus";
import { retryFailedHooks, runSubs } from "@/lib/shop";

/**
 * পর্যায়ক্রমে চলে (Vercel Cron বা cron-job.org থেকে প্রতি মিনিটে/৫ মিনিটে GET)।
 * Authorization: Bearer <CRON_SECRET>  অথবা ?key=<CRON_SECRET>
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const secret = process.env.CRON_SECRET || "";
  const given = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "") || String(req.query.key || "");
  if (!secret || given !== secret) return res.status(401).json({ success: false, error: "Unauthorized" });
  try {
    const s = await getSettings(true);
    const p = await getPrice(s);
    const t = await processTriggers(p && !p.stale ? p.price : null);
    // গত সপ্তাহের leaderboard prize (একবারই)
    let paid: any = null;
    if (s.lb_enabled) paid = await payWeek(weekIndex() - 1, s);
    const dep = await recheckAuto().catch(() => null);
    const stars = await healRecentStars().catch(() => null);
    const reminded = await sendDailyReminders(s).catch(() => null);
    const userJobs = await runUserJobs(s).catch(() => null);
    const health = await runHealthAlerts(s).catch(() => null);
    const contest = await payRefContest().catch(() => null);
    const games = await runGameJobs(s).catch(() => null);
    const holds = await releaseDueHolds(s).catch(() => null);
    const links = await expireLinks().catch(() => null);
    const tours = await settleTours().catch(() => null);
    const reminders = await remindTours().catch(() => null);
    const scheds = await runScheds(s).catch(() => null);
    const autoposts = await runAutoPosts(s).catch(() => null);
    const nudges = await runNudges().catch(() => null);
    const stmts = await sendStatements().catch(() => null);
    const subs = await runSubs().catch(() => null);
    const hooks = await retryFailedHooks().catch(() => null);
    const adminJobs = await runAdminJobs(s).catch(() => null);
    await db().ref("stats/cron_at").set(Date.now()).catch(() => {});
    res.json({ success: true, ...t, leaderboard: paid, deposits: dep, stars, reminded, userJobs, health, contest, games, holds, links, tours, autoposts, reminders, scheds, nudges, stmts, subs, hooks, adminJobs });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

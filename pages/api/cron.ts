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
import { logErr, errTrim, runGroupQuest, runEvents, runTicketClose } from "@/lib/v20";
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
    const dep = await recheckAuto().catch((e) => logErr("cron:dep", e));
    const stars = await healRecentStars().catch((e) => logErr("cron:stars", e));
    const reminded = await sendDailyReminders(s).catch((e) => logErr("cron:reminded", e));
    const userJobs = await runUserJobs(s).catch((e) => logErr("cron:userJobs", e));
    const health = await runHealthAlerts(s).catch((e) => logErr("cron:health", e));
    const contest = await payRefContest().catch((e) => logErr("cron:contest", e));
    const games = await runGameJobs(s).catch((e) => logErr("cron:games", e));
    const holds = await releaseDueHolds(s).catch((e) => logErr("cron:holds", e));
    const links = await expireLinks().catch((e) => logErr("cron:links", e));
    const tours = await settleTours().catch((e) => logErr("cron:tours", e));
    const reminders = await remindTours().catch((e) => logErr("cron:reminders", e));
    const scheds = await runScheds(s).catch((e) => logErr("cron:scheds", e));
    const autoposts = await runAutoPosts(s).catch((e) => logErr("cron:autoposts", e));
    const nudges = await runNudges().catch((e) => logErr("cron:nudges", e));
    const stmts = await sendStatements().catch((e) => logErr("cron:stmts", e));
    const subs = await runSubs().catch((e) => logErr("cron:subs", e));
    const hooks = await retryFailedHooks().catch((e) => logErr("cron:hooks", e));
    const quest = await runGroupQuest().catch((e) => logErr("cron:quest", e));
    const events = await runEvents().catch((e) => logErr("cron:events", e));
    const tclose = await runTicketClose().catch((e) => logErr("cron:tclose", e));
    await errTrim().catch(() => {});
    const adminJobs = await runAdminJobs(s).catch((e) => logErr("cron:adminJobs", e));
    await db().ref("stats/cron_at").set(Date.now()).catch(() => {});
    res.json({ success: true, ...t, leaderboard: paid, deposits: dep, stars, reminded, userJobs, health, contest, games, holds, links, tours, autoposts, reminders, scheds, nudges, stmts, subs, hooks, adminJobs });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ success: false, error: "Server error" });
  }
}

import type { AdminMod } from "./types";
import { db } from "../firebase";
import { scanUsers, retention, funnel, taskCounts, series, daySummary } from "../insights";

/** Admin → Insights: charts, retention, funnel, task/site stats, yesterday summary */
const mod: AdminMod = async (action, b, ctx) => {
  void ctx;
  switch (action) {
    case "insightsData": {
      const rows = await scanUsers(!!b.refresh);
      const days = Math.min(90, Math.max(7, Math.floor(Number(b.days)) || 30));
      const [ser, sum] = await Promise.all([series(days), daySummary()]);
      return { series: ser, retention: retention(rows), funnel: funnel(rows), summary: sum, scanned: rows.length };
    }
    case "taskStats": {
      const rows = await scanUsers();
      const cnt = taskCounts(rows);
      const total = rows.length || 1;
      const [t, s] = await Promise.all([db().ref("tasks").get(), db().ref("article_sites").get()]);
      const tasks = Object.entries((t.val() || {}) as Record<string, any>).map(([id, x]) => ({ id, title: x.title, type: x.type, reward: x.reward, done: cnt[id] || 0, pct: Math.round(((cnt[id] || 0) / total) * 1000) / 10 }));
      const sites = Object.entries((s.val() || {}) as Record<string, any>).map(([id, x]) => ({ id, title: x.name, reward: x.reward, active: x.is_active !== false, done: cnt[id] || 0, pct: Math.round(((cnt[id] || 0) / total) * 1000) / 10 }));
      return { tasks: tasks.sort((a, c) => c.done - a.done), sites: sites.sort((a, c) => c.done - a.done), users: rows.length };
    }
    default:
      return undefined;
  }
};
export default mod;

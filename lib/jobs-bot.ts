import { db } from "./firebase";
import { top, names } from "./leaderboard";
import { getCfg2 } from "./cfg2";
import { clanView } from "./clan";
import { weekIndex } from "./wallet";
import { notify } from "./notify";
import { postToChannel } from "./broadcast";
import type { Settings } from "./settings";

const tf = (c: number, cpt: number) => (c / Math.max(1, cpt)).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Once per finished week: post the top earners + invite-contest winners to the channel (names respect "Hide me" / nickname). */
export async function postWeeklyWinners(s: Settings): Promise<number> {
  if (!s.autopost_enabled || !s.autopost_winners || !s.autopost_channel || !s.lb_enabled) return 0;
  const idx = weekIndex() - 1;
  if (idx < 0) return 0;
  let first = false;
  await db().ref(`lb_paid/post_w_${idx}`).transaction((c: number | null) => { first = c === null; return c === null ? Date.now() : undefined; });
  if (!first) return 0;
  const earn = (await top(`w_${idx}`, 5)).filter((x) => x.v > 0);
  const inv = (await top(`ref_w_${idx}`, 3)).filter((x) => x.v > 0);
  if (!earn.length && !inv.length) return 0;
  const nm = await names([...earn, ...inv].map((x) => x.id));
  const medal = ["🥇", "🥈", "🥉", "4.", "5."];
  const lines = ["🏆 Last week's winners", ""];
  if (earn.length) { lines.push("⛏ Top earners"); earn.forEach((x, i) => lines.push(`${medal[i]} ${nm[x.id]} — ${tf(x.v, s.coins_per_tfuel)} TFUEL`)); }
  if (inv.length) { lines.push("", "👥 Top inviters"); inv.forEach((x, i) => lines.push(`${medal[i]} ${nm[x.id]} — ${x.v} friend${x.v === 1 ? "" : "s"}`)); }
  lines.push("", "Congratulations! 🎉 A new week has started — your turn to climb.");
  if (s.referral_link) lines.push(`👉 ${s.referral_link}`);
  const r = await postToChannel(lines.join("\n"));
  if (!r.ok) await db().ref(`lb_paid/post_w_${idx}`).remove().catch(() => {}); // try again next run
  return r.ok ? 1 : 0;
}

/** Clan raid boss: tell every member once when the boss is half-way down and once when it is defeated (top 30 clans by score this week). */
export async function bossAlerts(s: Settings): Promise<number> {
  const cfg = await getCfg2();
  if (!cfg.clan.enabled || !cfg.clan.boss.enabled || !s.notify_enabled) return 0;
  const w = weekIndex();
  let n = 0;
  for (const t of (await top(`clan_w_${w}`, 30)).filter((x) => x.v > 0)) {
    try {
      const mem = Object.keys(((await db().ref(`clan_members/${t.id}`).get()).val() || {}) as Record<string, number>);
      if (!mem.length) continue;
      const first = await clanView(mem[0]);
      const boss = first.mine?.boss;
      if (!boss) continue;
      const stage = boss.defeated ? "done" : boss.pct >= 50 ? "half" : "";
      if (!stage) continue;
      const seen = (await db().ref(`boss_notified/${w}/${t.id}`).get()).val() as string | null;
      if (seen === "done" || seen === stage) continue;
      await db().ref(`boss_notified/${w}/${t.id}`).set(stage);
      const msg = stage === "done" ? `🎉 Your clan defeated ${boss.emoji} ${boss.name}! Open the app to claim your reward.` : `🎉 ${boss.emoji} ${boss.name} is down to ${100 - boss.pct}% HP — your clan is winning! Keep tapping.`;
      for (const uid of mem) { await notify(uid, msg); n++; }
    } catch {}
  }
  return n;
}

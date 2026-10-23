import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import type { Settings } from "./settings";
import type { Tier } from "./cfg2";
import { getCfg2 } from "./cfg2";
import { weekIndex, activity } from "./wallet";
import { top, names } from "./leaderboard";
import { notify } from "./notify";
import { alertAdmins } from "./adminalert";

/** Referral tiers: more friends → higher commission %. Base % (settings) applies below the first tier. */
export function tierPct(tiers: Tier[], count: number, base: number): number {
  let pct = base;
  for (const t of tiers) if (count >= t.n && t.pct > pct) pct = t.pct;
  return pct;
}
export function tierInfo(tiers: Tier[], count: number, base: number) {
  const pct = tierPct(tiers, count, base);
  const next = tiers.find((t) => t.n > count && t.pct > pct) || null;
  return { count, pct, next: next ? { n: next.n, pct: next.pct, need: next.n - count } : null, tiers: [{ n: 0, pct: base }, ...tiers] };
}

/** Referral leaderboard counters: qualified friends this week / all time */
export async function refBoardAdd(refId: string) {
  try {
    await db().ref().update({ [`lb/ref_w_${weekIndex()}/${refId}`]: ServerValue.increment(1), [`lb/ref_all/${refId}`]: ServerValue.increment(1) });
  } catch {}
}
export async function refBoard(uid: string, board: "w" | "all", s: Settings) {
  const key = board === "all" ? "ref_all" : `ref_w_${weekIndex()}`;
  const t = (await top(key, 20)).filter((x) => x.v > 0);
  const nm = await names(t.map((x) => x.id));
  const mine = Number((await db().ref(`lb/${key}/${uid}`).get()).val()) || 0;
  const cfg = await getCfg2();
  void s;
  return { list: t.map((x, i) => ({ rank: i + 1, name: nm[x.id], v: x.v, me: x.id === uid })), mine, contest: board === "w" && cfg.contest.enabled ? { name: cfg.contest.name, prizes: cfg.contest.prizes } : null };
}

/** Pay last week's invite-contest prizes (once, marker lb_paid/ref_w_<idx>) */
export async function payRefContest(idx = weekIndex() - 1): Promise<{ paid: number; already?: boolean }> {
  const cfg = await getCfg2();
  if (!cfg.contest.enabled || !cfg.contest.prizes.length || idx < 0) return { paid: 0 };
  let first = false;
  await db().ref(`lb_paid/ref_w_${idx}`).transaction((c: number | null) => { first = c === null; return c === null ? Date.now() : undefined; });
  if (!first) return { paid: 0, already: true };
  const t = (await top(`ref_w_${idx}`, cfg.contest.prizes.length)).filter((x) => x.v > 0);
  let paid = 0;
  for (let i = 0; i < t.length; i++) {
    const coins = Math.floor(cfg.contest.prizes[i]);
    const uid = t[i].id;
    if (coins < 1 || (await db().ref(`users/${uid}/balance`).get()).val() === null) continue;
    await db().ref().update({ [`users/${uid}/balance`]: ServerValue.increment(coins), [`users/${uid}/earn/prize`]: ServerValue.increment(coins) });
    await activity(uid, "prize", { coins, note: `Invite contest #${i + 1}` });
    await notify(uid, `🏆 You finished #${i + 1} in the invite contest (${t[i].v} friends)! +${coins} coins were added.`);
    paid++;
  }
  if (paid) await alertAdmins("error", `Invite contest paid: ${paid} winner(s) for week ${idx}.`);
  return { paid };
}

/** Admin: campaigns = start links `?startapp=cmp_<tag>`; counts come from the members who joined through them */
export async function campaignStats(s: Settings) {
  const [meta, idx] = await Promise.all([db().ref("campaign_meta").get(), db().ref("campaigns").get()]);
  const m = (meta.val() || {}) as Record<string, { name?: string; created_at?: number }>;
  const members = (idx.val() || {}) as Record<string, Record<string, number>>;
  const tags = Array.from(new Set([...Object.keys(m), ...Object.keys(members)]));
  const now = Date.now();
  const rows = [];
  for (const tag of tags) {
    const ids = Object.keys(members[tag] || {}).slice(0, 2000);
    let active = 0, task = 0, dep = 0;
    await Promise.all(ids.map(async (id) => {
      const u = (await db().ref(`users/${id}`).get()).val() as any;
      if (!u) return;
      if (u.last_seen && now - u.last_seen < 7 * 86400000) active++;
      if ((u.earn?.tasks || 0) + (u.earn?.articles || 0) > 0) task++;
      if ((u.usdt_tot?.deposited || 0) > 0) dep++;
    }));
    rows.push({ tag, name: m[tag]?.name || tag, joined: Object.keys(members[tag] || {}).length, active, task, dep, link: s.referral_link ? `${s.referral_link}?startapp=cmp_${tag}` : "", created_at: m[tag]?.created_at || 0 });
  }
  return rows.sort((a, b) => b.joined - a.joined);
}

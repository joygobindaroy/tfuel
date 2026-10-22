import { db } from "./firebase";
import { HttpError } from "./auth";
import { dayKey } from "./log";
import { earn, spend, activity, lbAdd, weekIndex } from "./wallet";
import { notify } from "./notify";
import type { Settings, GameEvent } from "./settings";
import type { UserRecord } from "./user";

/** Retention: streak freeze/recovery, achievements, comeback, weekly challenge, anniversary, seasonal events, level + badge */

// ---------- level + badge ----------
const LIFE_KEYS = ["tap", "articles", "tasks", "daily", "mining", "spin", "ads", "referral", "staking", "prize", "promo"];
export const lifetimeEarn = (u: UserRecord) => LIFE_KEYS.reduce((a, k) => a + (Number(u.earn?.[k]) || 0), 0);
const BADGES = ["Rookie", "Miner", "Silver", "Gold", "Platinum", "Diamond", "Legend"];
export function levelInfo(u: UserRecord) {
  const total = lifetimeEarn(u);
  const level = Math.min(100, Math.floor(Math.sqrt(total / 500)) + 1);
  const cur = (level - 1) ** 2 * 500;
  const next = level >= 100 ? cur : level ** 2 * 500;
  return { level, total, badge: BADGES[Math.min(BADGES.length - 1, Math.floor((level - 1) / 5))], from: cur, to: next, pct: next > cur ? Math.min(100, Math.floor(((total - cur) / (next - cur)) * 100)) : 100 };
}

// ---------- seasonal events ----------
export const activeEvent = (s: Settings, now = Date.now()): GameEvent | null => (s.events || []).find((e) => e.start <= now && now < e.end) || null;
export const tapMult = (s: Settings, now = Date.now()) => activeEvent(s, now)?.tap_mult || 1;
export const dailyMult = (s: Settings, now = Date.now()) => activeEvent(s, now)?.daily_mult || 1;

// ---------- achievements ----------
export interface AchDef { id: string; title: string; text: string; icon: string; goal: number; reward: number; val: (u: UserRecord) => number }
const taskCount = (u: UserRecord) => Object.values(u.completed_tasks || {}).filter((t) => t?.claimed).length;
export const ACHIEVEMENTS: AchDef[] = [
  { id: "first_tasks", title: "Getting started", text: "Complete 1 task or article", icon: "check", goal: 1, reward: 200, val: taskCount },
  { id: "tasks_25", title: "Task master", text: "Complete 25 tasks / articles", icon: "check", goal: 25, reward: 2000, val: taskCount },
  { id: "tap_10k", title: "Tap machine", text: "Earn 10,000 from tapping", icon: "bolt", goal: 10000, reward: 1000, val: (u) => Number(u.earn?.tap) || 0 },
  { id: "tap_100k", title: "Tap legend", text: "Earn 100,000 from tapping", icon: "bolt", goal: 100000, reward: 5000, val: (u) => Number(u.earn?.tap) || 0 },
  { id: "streak_7", title: "One week streak", text: "Reach a 7-day daily streak", icon: "fire", goal: 7, reward: 1000, val: (u) => u.daily?.streak || 0 },
  { id: "streak_30", title: "Monthly streak", text: "Reach a 30-day daily streak", icon: "fire", goal: 30, reward: 5000, val: (u) => u.daily?.streak || 0 },
  { id: "friends_3", title: "Friendly", text: "Invite 3 friends", icon: "users", goal: 3, reward: 1500, val: (u) => u.ref_count || 0 },
  { id: "friends_10", title: "Community builder", text: "Invite 10 friends", icon: "users", goal: 10, reward: 6000, val: (u) => u.ref_count || 0 },
  { id: "first_deposit", title: "Investor", text: "Make your first deposit", icon: "wallet", goal: 1, reward: 1000, val: (u) => ((u.usdt_tot?.deposited || 0) > 0 ? 1 : 0) },
  { id: "first_stake", title: "Staker", text: "Start a stake", icon: "lock", goal: 1, reward: 1000, val: (u) => Object.keys(u.stakes || {}).length },
  { id: "level_10", title: "Level 10", text: "Reach level 10", icon: "star", goal: 10, reward: 3000, val: (u) => levelInfo(u).level },
];
export const achProgress = (u: UserRecord) =>
  ACHIEVEMENTS.map((a) => {
    const v = Math.min(a.goal, a.val(u));
    return { id: a.id, title: a.title, text: a.text, icon: a.icon, goal: a.goal, value: v, reward: a.reward, done: v >= a.goal, claimed: !!(u as any).ach?.[a.id] };
  });

// ---------- comeback / anniversary ----------
/** Called on app open with the user record read BEFORE last_seen was refreshed. Marks a pending comeback bonus. */
export async function markComeback(uid: string, u: UserRecord, s: Settings, now = Date.now()) {
  try {
    if (!s.comeback_enabled || !(s.comeback_bonus > 0) || !u.last_seen) return;
    if (now - u.last_seen < s.comeback_days * 86400000) return;
    if ((u as any).comeback?.at && (u as any).comeback.at > u.last_seen) return; // already pending/claimed for this absence
    await db().ref(`users/${uid}/comeback`).set({ at: now, away_days: Math.floor((now - u.last_seen) / 86400000), claimed: false });
    (u as any).comeback = { at: now, away_days: Math.floor((now - u.last_seen) / 86400000), claimed: false };
  } catch {}
}
/** Which anniversary (if any) is claimable today: "1y", "2y"… or "30d" */
export function annivKey(u: UserRecord, now = Date.now()): string | null {
  if (!u.created_at) return null;
  const days = Math.floor((now - u.created_at) / 86400000);
  if (days === 30) return "30d";
  if (days >= 365) {
    const c = new Date(u.created_at), n = new Date(now);
    if (c.getUTCMonth() === n.getUTCMonth() && c.getUTCDate() === n.getUTCDate()) return `${n.getUTCFullYear() - c.getUTCFullYear()}y`;
  }
  return null;
}

// ---------- weekly challenge ----------
export async function weeklyBump(uid: string) {
  try {
    const { ServerValue } = await import("firebase-admin/database");
    await db().ref().update({ [`weekly/${uid}/${weekIndex()}/n`]: ServerValue.increment(1) });
  } catch {}
}

// ---------- state for the app ----------
export async function retentionState(uid: string, u: UserRecord, s: Settings, now = Date.now()) {
  const wk = weekIndex(now);
  const w = ((await db().ref(`weekly/${uid}/${wk}`).get()).val() || {}) as { n?: number; claimed?: boolean };
  const lv = levelInfo(u);
  const ev = activeEvent(s, now);
  const ak = s.anniv_enabled && s.anniv_bonus > 0 ? annivKey(u, now) : null;
  const cb = (u as any).comeback as { at: number; away_days: number; claimed: boolean } | undefined;
  const lost = (u as any).streak_lost as { streak: number; at: number } | undefined;
  const recoverPrice = s.streak_freeze_price * 2;
  return {
    level: lv,
    freeze: { enabled: s.streak_freeze_enabled, count: (u as any).freezes || 0, max: s.streak_freeze_max, price: s.streak_freeze_price, recoverPrice },
    recover: lost && now - lost.at < 48 * 3600000 && s.streak_freeze_enabled ? { streak: lost.streak, price: recoverPrice, until: lost.at + 48 * 3600000 } : null,
    ach: s.ach_enabled ? achProgress(u) : [],
    comeback: s.comeback_enabled && cb && !cb.claimed ? { bonus: s.comeback_bonus, days: cb.away_days } : null,
    anniv: ak && !(u as any).anniv?.[ak] ? { key: ak, bonus: s.anniv_bonus } : null,
    weekly: s.weekly_enabled ? { n: Math.min(w.n || 0, s.weekly_target), target: s.weekly_target, reward: s.weekly_reward, claimed: !!w.claimed, ends: weekStart(wk + 1) } : null,
    event: ev ? { id: ev.id, name: ev.name, text: ev.text, end: ev.end, tap_mult: ev.tap_mult, daily_mult: ev.daily_mult, bonus: ev.bonus, claimed: !!(u as any).ev?.[ev.id] } : null,
    streak: u.daily?.streak || 0,
  };
}
const weekStart = (idx: number) => (idx * 7 + 4) * 86400000;

// ---------- claims (each is one transaction; idempotent) ----------
async function credit(uid: string, coins: number, note: string, mutate: (cur: any) => string | null) {
  let err: string | null = null;
  let bal = 0;
  await db().ref(`users/${uid}`).transaction((cur: any) => {
    err = null;
    if (cur === null) return cur;
    err = mutate(cur);
    if (err) return;
    cur.balance += coins;
    earn(cur, "prize", coins);
    bal = cur.balance;
    return cur;
  });
  if (err) throw new HttpError(409, err);
  await lbAdd(uid, coins);
  await activity(uid, "prize", { coins, note });
  return bal;
}

export async function claimRetention(uid: string, kind: string, id: string, s: Settings, now = Date.now()) {
  const u = (await db().ref(`users/${uid}`).get()).val() as UserRecord | null;
  if (!u) throw new HttpError(404, "no_user");
  if (kind === "ach") {
    if (!s.ach_enabled) throw new HttpError(403, "ret_disabled");
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    if (!a) throw new HttpError(400, "bad_request");
    const bal = await credit(uid, a.reward, `Achievement: ${a.title}`, (c) => {
      if (c.ach?.[a.id]) return "ret_claimed";
      if (a.val(c) < a.goal) return "ret_not_ready";
      c.ach = { ...(c.ach || {}), [a.id]: now };
      return null;
    });
    return { reward: a.reward, balance: bal };
  }
  if (kind === "comeback") {
    if (!s.comeback_enabled) throw new HttpError(403, "ret_disabled");
    const bal = await credit(uid, s.comeback_bonus, "Welcome back bonus", (c) => {
      if (!c.comeback || c.comeback.claimed) return "ret_claimed";
      c.comeback.claimed = true;
      return null;
    });
    return { reward: s.comeback_bonus, balance: bal };
  }
  if (kind === "anniv") {
    const key = annivKey(u, now);
    if (!s.anniv_enabled || !key) throw new HttpError(409, "ret_not_ready");
    const bal = await credit(uid, s.anniv_bonus, `Anniversary ${key}`, (c) => {
      if (c.anniv?.[key]) return "ret_claimed";
      c.anniv = { ...(c.anniv || {}), [key]: now };
      return null;
    });
    return { reward: s.anniv_bonus, balance: bal };
  }
  if (kind === "event") {
    const ev = activeEvent(s, now);
    if (!ev || ev.id !== id || !(ev.bonus > 0)) throw new HttpError(409, "ret_not_ready");
    const bal = await credit(uid, ev.bonus, `Event: ${ev.name}`, (c) => {
      if (c.ev?.[ev.id]) return "ret_claimed";
      c.ev = { ...(c.ev || {}), [ev.id]: now };
      return null;
    });
    return { reward: ev.bonus, balance: bal };
  }
  if (kind === "weekly") {
    if (!s.weekly_enabled) throw new HttpError(403, "ret_disabled");
    const wk = weekIndex(now);
    const ref = db().ref(`weekly/${uid}/${wk}`);
    let err: string | null = null;
    await ref.transaction((c: any) => {
      err = null;
      if (!c || (c.n || 0) < s.weekly_target) { err = "ret_not_ready"; return; }
      if (c.claimed) { err = "ret_claimed"; return; }
      c.claimed = now;
      return c;
    });
    if (err) throw new HttpError(409, err);
    const bal = await credit(uid, s.weekly_reward, "Weekly challenge", () => null);
    return { reward: s.weekly_reward, balance: bal };
  }
  throw new HttpError(400, "bad_request");
}

export async function buyFreeze(uid: string, s: Settings) {
  if (!s.streak_freeze_enabled) throw new HttpError(403, "ret_disabled");
  let err: string | null = null;
  let out = { freezes: 0, balance: 0 };
  await db().ref(`users/${uid}`).transaction((c: any) => {
    err = null;
    if (c === null) return c;
    const n = c.freezes || 0;
    if (n >= s.streak_freeze_max) { err = "max_freezes"; return; }
    if (c.balance < s.streak_freeze_price) { err = "insufficient"; return; }
    c.balance -= s.streak_freeze_price;
    spend(c, "boosts", s.streak_freeze_price);
    c.freezes = n + 1;
    out = { freezes: c.freezes, balance: c.balance };
    return c;
  });
  if (err) throw new HttpError(409, err);
  await activity(uid, "boost", { coins: -s.streak_freeze_price, note: "Streak freeze" });
  return out;
}

/** Restore a streak lost in the last 48 h (pays 2× freeze price). The day just claimed counts too. */
export async function recoverStreak(uid: string, s: Settings, now = Date.now()) {
  if (!s.streak_freeze_enabled) throw new HttpError(403, "ret_disabled");
  const price = s.streak_freeze_price * 2;
  let err: string | null = null;
  let out = { streak: 0, balance: 0 };
  await db().ref(`users/${uid}`).transaction((c: any) => {
    err = null;
    if (c === null) return c;
    const l = c.streak_lost;
    if (!l || now - l.at >= 48 * 3600000) { err = "ret_not_ready"; return; }
    if (c.balance < price) { err = "insufficient"; return; }
    c.balance -= price;
    spend(c, "boosts", price);
    c.daily = { day: c.daily?.day || dayKey(now), streak: l.streak + 1 };
    c.streak_lost = null;
    out = { streak: c.daily.streak, balance: c.balance };
    return c;
  });
  if (err) throw new HttpError(409, err);
  await activity(uid, "boost", { coins: -price, note: "Streak recovery" });
  return out;
}

/** Cron: tell users who just reached the weekly target / ach? (kept light) — nothing heavy here */
export async function notifyAnniv(uid: string, key: string) { await notify(uid, `🎉 Happy anniversary! Open the app to claim your ${key} bonus.`); }

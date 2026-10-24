import { db } from "./firebase";
import { notify } from "./notify";
import { dayKey } from "./log";
import { activeEvent } from "./retention";
import { startBroadcast } from "./broadcast";
import { feedPrune } from "./feed";
import type { Settings } from "./settings";
import type { UserRecord } from "./user";

const DAY = 86400000;
const CAP = 400;

/** "We miss you": once per absence, to users last seen exactly comeback_msg_days ago (index seen_day/<day>) */
export async function winback(s: Settings, now = Date.now()): Promise<number> {
  if (!(s.comeback_msg_days > 0) || !s.notify_enabled) return 0;
  const day = dayKey(now - s.comeback_msg_days * DAY);
  const ids = Object.keys(((await db().ref(`seen_day/${day}`).limitToFirst(CAP).get()).val() || {}) as Record<string, any>);
  let n = 0;
  for (const uid of ids) {
    try {
      const u = (await db().ref(`users/${uid}`).get()).val() as UserRecord | null;
      if (!u || u.banned || !u.last_seen || dayKey(u.last_seen) !== day) continue; // came back since
      const at = Number((await db().ref(`user_prefs/${uid}/winback_at`).get()).val()) || 0;
      if (at > u.last_seen) continue;
      await db().ref(`user_prefs/${uid}/winback_at`).set(now);
      await notify(uid, `👋 We miss you${u.name ? ", " + String(u.name).slice(0, 20) : ""}! It's been ${s.comeback_msg_days} days.${s.comeback_enabled && s.comeback_bonus > 0 ? " A welcome-back bonus is waiting for you." : " Your daily reward and new tasks are waiting."}`);
      n++;
    } catch {}
  }
  await db().ref(`seen_day/${dayKey(now - 10 * DAY)}`).remove().catch(() => {});
  return n;
}

/** Streak in danger: from streak_warn_hour_utc on, users who claimed yesterday (streak ≥ 3) but not yet today get one reminder with a Claim button */
export async function streakDanger(s: Settings, now = Date.now()): Promise<number> {
  if (!s.daily_enabled || !s.notify_enabled) return 0;
  const hour = new Date(now).getUTCHours();
  if (hour < s.streak_warn_hour_utc) return 0;
  const today = dayKey(now);
  const list = ((await db().ref(`daily_day/${dayKey(now - DAY)}`).limitToFirst(CAP * 3).get()).val() || {}) as Record<string, number>;
  let n = 0;
  for (const [uid, streak] of Object.entries(list)) {
    if (n >= CAP || Number(streak) < 3) continue;
    try {
      const [d, w] = await Promise.all([db().ref(`users/${uid}/daily/day`).get(), db().ref(`user_prefs/${uid}/streak_warn`).get()]);
      if (d.val() === today || w.val() === today) continue;
      await db().ref(`user_prefs/${uid}/streak_warn`).set(today);
      await notify(uid, `🔥 Your ${streak}-day streak ends in about ${24 - hour}h! Claim today's reward to keep it.`, false, [[{ text: "🎁 Claim now", callback_data: "d" }]]);
      n++;
    } catch {}
  }
  await db().ref(`daily_day/${dayKey(now - 4 * DAY)}`).remove().catch(() => {});
  return n;
}

/** New seasonal event → one message to everyone (when event_announce is on) */
export async function eventAnnounce(s: Settings, now = Date.now()): Promise<number> {
  if (!s.event_announce || !s.notify_enabled) return 0;
  const ev = activeEvent(s, now);
  if (!ev) return 0;
  let first = false;
  await db().ref(`event_announced/${ev.id}`).transaction((c: number | null) => { first = c === null; return c === null ? now : undefined; });
  if (!first) return 0;
  const bits = [ev.tap_mult > 1 ? `×${ev.tap_mult} taps` : "", ev.daily_mult > 1 ? `×${ev.daily_mult} daily reward` : "", ev.bonus > 0 ? "a bonus to claim" : ""].filter(Boolean).join(", ");
  const r = await startBroadcast({ text: `🎉 ${ev.name}${ev.text ? " — " + ev.text : ""}${bits ? `\n${bits}` : ""}\nOpen the app now!`, url: s.referral_link || undefined, btn: "⛏ Open TFUEL", aud: { kind: "all" }, inbox: true }, "event");
  return r.total;
}

export async function runRetentionJobs(s: Settings): Promise<Record<string, any>> {
  return { winback: await winback(s).catch(() => 0), streak: await streakDanger(s).catch(() => 0), event: await eventAnnounce(s).catch(() => 0), feed: await feedPrune().catch(() => 0) };
}

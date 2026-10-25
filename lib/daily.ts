import { db } from "./firebase";
import { HttpError } from "./auth";
import { dayKey } from "./log";
import { earn, activity, lbAdd } from "./wallet";
import { dailyMult } from "./retention";
import { abMult } from "./abtest";
import { vipPerks } from "./vip";
import { newUser, UserRecord } from "./user";
import type { Settings } from "./settings";

/** Claim today's daily reward (UTC day). Shared by the app and the bot. Throws HttpError(409, "already_claimed_today"). */
export async function claimDaily(uid: string, s: Settings, now = Date.now()) {
  if (!s.daily_enabled) throw new HttpError(403, "daily_disabled");
  const today = dayKey(now);
  const yesterday = dayKey(now - 86400000);
  const abm = await abMult(uid).catch(() => 1);
  const vp = await vipPerks(uid);
  const vipm = vp.active ? 1 + vp.daily_pct / 100 : 1;
  let err = "";
  let saved = 0;
  let out = { reward: 0, streak: 0, balance: 0, saved: 0 };
  await db().ref(`users/${uid}`).transaction((cur: UserRecord | null) => {
    err = "";
    if (cur === null) return newUser();
    if (cur.daily?.day === today) { err = "already_claimed_today"; return; }
    let streak = 1;
    if (cur.daily?.day === yesterday) streak = cur.daily.streak + 1;
    else if (cur.daily?.day) {
      // missed whole days: a streak freeze covers each one
      const missed = Math.max(1, Math.round((Date.parse(today.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) - Date.parse(cur.daily.day.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"))) / 86400000) - 1);
      const fr = (cur as any).freezes || 0;
      if (s.streak_freeze_enabled && fr >= missed) { (cur as any).freezes = fr - missed; streak = cur.daily.streak + 1; saved = missed; }
      else if (cur.daily.streak >= 3) (cur as any).streak_lost = { streak: cur.daily.streak, at: now };
    }
    const reward = Math.floor((s.daily_rewards[(streak - 1) % s.daily_rewards.length] || 0) * dailyMult(s, now) * abm * vipm);
    cur.daily = { day: today, streak };
    cur.balance += reward;
    earn(cur, "daily", reward);
    out = { reward, streak, balance: cur.balance, saved: 0 };
    return cur;
  });
  if (err) throw new HttpError(409, err);
  out.saved = saved;
  await lbAdd(uid, out.reward);
  await db().ref(`daily_day/${today}/${uid}`).set(out.streak).catch(() => {});
  await activity(uid, "daily", { coins: out.reward, note: `Day ${out.streak}` });
  return out;
}

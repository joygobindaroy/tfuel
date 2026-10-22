import { db } from "./firebase";
import { notify } from "./notify";
import { dayKey } from "./log";
import type { Settings } from "./settings";

/** opt-in "Daily summary": every morning (from 04:00 UTC) one message with yesterday's earnings, once per day per user */
export async function sendDaySummaries(s: Settings, now = Date.now()): Promise<number> {
  if (!s.notify_enabled || new Date(now).getUTCHours() < 4) return 0;
  const today = dayKey(now);
  const y = dayKey(now - 86400000);
  const snap = await db().ref("summary_users").limitToFirst(300).get();
  let n = 0;
  for (const uid of Object.keys((snap.val() || {}) as Record<string, any>)) {
    try {
      const last = await db().ref(`user_prefs/${uid}/sum_last`).get();
      if (last.val() === today) continue;
      await db().ref(`user_prefs/${uid}/sum_last`).set(today);
      const e = Number((await db().ref(`lb/d_${y}/${uid}`).get()).val()) || 0;
      const bal = Number((await db().ref(`users/${uid}/balance`).get()).val()) || 0;
      const f = (c: number) => (c / Math.max(1, s.coins_per_tfuel)).toLocaleString("en-US", { maximumFractionDigits: 2 });
      await notify(uid, `🎁 Daily summary: yesterday you earned ${f(e)} TFUEL. Balance now ${f(bal)} TFUEL.`);
      n++;
    } catch {}
  }
  return n;
}

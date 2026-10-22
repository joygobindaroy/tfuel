import { db } from "./firebase";
import { notify } from "./notify";
import { dayKey } from "./log";
import type { Settings } from "./settings";

/** opt-in daily reward reminder: যাদের আজ এখনও claim হয়নি, নির্ধারিত UTC ঘণ্টার পর একবার বার্তা */
export async function sendDailyReminders(s: Settings, now = Date.now()): Promise<number> {
  if (!s.daily_enabled || new Date(now).getUTCHours() < s.remind_hour_utc) return 0;
  const today = dayKey(now);
  const snap = await db().ref("remind_users").limitToFirst(300).get();
  let n = 0;
  for (const uid of Object.keys((snap.val() || {}) as Record<string, any>)) {
    try {
      const [last, day] = await Promise.all([db().ref(`user_prefs/${uid}/remind_last`).get(), db().ref(`users/${uid}/daily/day`).get()]);
      if (last.val() === today) continue;
      await db().ref(`user_prefs/${uid}/remind_last`).set(today);
      if (day.val() === today) continue; // আজ ইতিমধ্যে নিয়েছে
      await notify(uid, "🎁 Your daily reward is waiting — open the app and claim it to keep your streak!");
      n++;
    } catch {}
  }
  return n;
}

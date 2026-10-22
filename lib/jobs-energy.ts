import { db } from "./firebase";
import { notify } from "./notify";
import { currentEnergy, effective, UserRecord } from "./user";
import type { Settings } from "./settings";

/**
 * opt-in "Energy full" বার্তা (Settings-এ চালু করলে). প্রতিবার energy খরচের পর পূর্ণ হলে একবারই:
 * শেষ tap > শেষ বার্তার সময় হলেই পাঠানো হয়। cron প্রতি চলায় সর্বোচ্চ ২০০ জন দেখে।
 */
export async function sendEnergyFull(s: Settings, now = Date.now()): Promise<number> {
  if (!s.notify_enabled) return 0;
  const snap = await db().ref("energy_users").limitToFirst(200).get();
  let n = 0;
  for (const uid of Object.keys((snap.val() || {}) as Record<string, any>)) {
    try {
      const u = (await db().ref(`users/${uid}`).get()).val() as UserRecord | null;
      if (!u || u.banned || !u.last_tap_time) continue;
      const last = Number((await db().ref(`user_prefs/${uid}/energy_msg_at`).get()).val()) || 0;
      if (u.last_tap_time <= last) continue; // এই খরচের পর আগেই জানানো হয়েছে
      if (u.empty_at) { await db().ref(`user_prefs/${uid}/energy_msg_at`).set(now); continue; } // পুরো খালি হলে আলাদা বার্তা আগেই যায় (triggers)
      const eff = effective(u, s, now);
      if (currentEnergy(eff, now, s.empty_refill_hours) < eff.max_energy - 0.5) continue;
      await db().ref(`user_prefs/${uid}/energy_msg_at`).set(now);
      await notify(uid, "⚡ Your energy is full — come back and tap!");
      n++;
    } catch {}
  }
  return n;
}

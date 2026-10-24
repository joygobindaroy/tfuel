import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { flag } from "@/lib/log";
import { enqueue } from "@/lib/queue";
import { earn, lbAdd } from "@/lib/wallet";
import { tapMult } from "@/lib/retention";
import { getCfg2 } from "@/lib/cfg2";
import { alertAdmins } from "@/lib/adminalert";
import { dmBump } from "@/lib/missions";
import {
  ensureUser,
  currentEnergy,
  effective,
  newUser,
  UserRecord,
  MAX_BATCH_LIMIT,
  MAX_TAPS_PER_SEC,
} from "@/lib/user";

export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "tap", 120);

  // client-এর batchDurationMs ইচ্ছাকৃতভাবে উপেক্ষা করা হয়: সময় server নিজেই মাপে
  const tapCount = Math.floor(Number(req.body?.tapCount));
  if (!Number.isFinite(tapCount) || tapCount < 1 || tapCount > MAX_BATCH_LIMIT) {
    throw new HttpError(400, "Invalid tapCount");
  }

  const { settings } = await ensureUser(user);

  const botCfg = (await getCfg2()).bot;
  let botNow = false;
  let failure: string | null = null;
  let earnedTap = 0;
  let accepted = 0;
  const result = await db()
    .ref(`users/${user.id}`)
    .transaction((cur: UserRecord | null) => {
      if (cur === null) return newUser(); // cache miss: retry জোর করে
      failure = null;
      const now = Date.now();

      // শেষ tap থেকে server-মাপা সময়ের ভিত্তিতে অনুমোদিত tap সংখ্যা
      const sinceLastSec = cur.last_tap_time
        ? Math.min(10, Math.max(0, (now - cur.last_tap_time) / 1000))
        : 1;
      const allowed = Math.ceil(sinceLastSec * MAX_TAPS_PER_SEC);
      if (tapCount > allowed) {
        failure = "Too fast";
        return; // abort
      }

      const eff = effective(cur, settings, now);
      const cost = settings.energy_cost;
      const rh = settings.empty_refill_hours;
      const energy = currentEnergy(eff, now, rh);
      cur.max_energy = eff.max_energy;
      cur.energy_regen_rate = eff.energy_regen_rate;
      cur.earn_per_tap = eff.earn_per_tap;
      if (energy >= cost) cur.empty_at = null;

      // energy যতটা পারে তত tap গ্রহণ (পুরো batch বাতিল নয়)
      const n = Math.min(tapCount, Math.floor((energy + 1e-9) / cost));
      accepted = n;
      cur.energy = energy - n * cost;
      cur.last_energy_calc_time = now;
      if (n < 1) {
        // খালি: সময় শুরু করে রাখি (commit করি), তারপর client-কে জানাই
        if (rh > 0 && !cur.empty_at) cur.empty_at = now;
        failure = "Not enough energy";
        return cur;
      }
      if (botCfg.enabled && cur.last_tap_time) {
        const iv = (now - cur.last_tap_time) / 1000;
        if (iv > 0.2) {
          const rate = n / iv;
          let sc = (cur as any).bot_score || 0;
          if (n >= 8 && rate >= 11) sc += 1; else if (rate < 6) sc = Math.max(0, sc - 2);
          (cur as any).bot_score = sc;
          if (sc >= botCfg.threshold && !(cur as any).bot_flagged) { (cur as any).bot_flagged = now; botNow = true; }
        }
      }
      cur.last_tap_time = now;
      const per = Math.floor(eff.earn_per_tap * tapMult(settings, now));
      cur.balance += n * per;
      earn(cur, "tap", n * per);
      earnedTap = n * per;
      if (cur.energy < cost && rh > 0 && !cur.empty_at) cur.empty_at = now;
      return cur;
    });

  if (failure === "Not enough energy") {
    const u0 = result.snapshot.val() as UserRecord;
    return void res.status(429).json({ success: false, error: failure, energy: Math.round(u0.energy * 100) / 100, refillAt: u0.empty_at && settings.empty_refill_hours > 0 ? u0.empty_at + settings.empty_refill_hours * 3600000 : null });
  }
  if (!result.committed) {
    if (failure === "Too fast") await flag(user.id, "too_fast");
    throw new HttpError(429, failure || "Rejected");
  }
  const u = result.snapshot.val() as UserRecord;
  if (botNow) {
    await flag(user.id, "auto_tap");
    if (botCfg.action === "freeze") await db().ref(`frozen/${user.id}`).set({ reason: "Auto-tap detected", by: "system", at: Date.now() }).catch(() => {});
    await alertAdmins("error", `Auto-tap suspected: user ${user.id} (${u.name || "?"}) tapped at a machine-like rate for a long time.${botCfg.action === "freeze" ? " Account frozen (withdraw/send blocked)." : ""}`);
  }
  await lbAdd(user.id, earnedTap);
  dmBump(user.id, "taps", accepted).catch(() => {});
  if (u.empty_at && u.energy < settings.energy_cost && settings.empty_refill_hours > 0)
    await enqueue("energy", u.empty_at + settings.empty_refill_hours * 3600000, user.id, { uid: user.id, ea: u.empty_at });
  res.json({
    success: true,
    accepted,
    balance: u.balance,
    energy: Math.round(u.energy * 100) / 100,
    maxEnergy: u.max_energy,
    refillAt: u.empty_at && u.energy < settings.energy_cost && settings.empty_refill_hours > 0 ? u.empty_at + settings.empty_refill_hours * 3600000 : null,
  });
});

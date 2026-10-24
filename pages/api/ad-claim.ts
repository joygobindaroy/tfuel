import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { dayKey } from "@/lib/log";
import { earn, activity, lbAdd } from "@/lib/wallet";
import { ensureUser, newUser, effective, UserRecord } from "@/lib/user";
import { MIN_AD_SECONDS } from "./ad-start";
import { getCfg2 } from "@/lib/cfg2";
import { rollBox } from "@/lib/eng";

/**
 * ad শেষ হলে reward। যাচাই: টোকেন মেলে + কমপক্ষে MIN_AD_SECONDS পার + দৈনিক সীমা।
 * ADS_SECRET সেট থাকলে ad-network-এর server callback (/api/ad-callback) ছাড়া reward নয়।
 */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "ad-claim", 12);
  const { settings: s } = await ensureUser(user);
  const nonce = String(req.body?.nonce || "");
  const cfg2 = await getCfg2();
  const boxCoins = rollBox(cfg2);
  const strict = !!process.env.ADS_SECRET && s.ads_provider === "adsgram";
  const now = Date.now();
  const day = dayKey(now);
  let err = "";
  let out: any = null;
  await db()
    .ref(`users/${user.id}`)
    .transaction((cur: UserRecord | null) => {
      err = "";
      out = null;
      if (cur === null) return newUser();
      const a = cur.ads;
      if (!a || a.day !== day || !a.nonce || a.nonce !== nonce || !a.p) {
        err = "ad_invalid";
        return;
      }
      if (now - (a.ns || 0) < MIN_AD_SECONDS * 1000) {
        err = "ad_too_fast";
        return;
      }
      if (now - (a.ns || 0) > 15 * 60000) {
        err = "ad_invalid";
        return;
      }
      if (strict) {
        if ((a.srv || 0) < 1) {
          err = "ad_unverified";
          return;
        }
        a.srv = (a.srv || 0) - 1;
      }
      const p = a.p as "coins" | "energy" | "spin" | "box" | "boost";
      const limit = p === "coins" ? s.ads_coins_per_day : p === "energy" ? s.ads_energy_per_day : p === "box" ? (cfg2.eng.luckybox.enabled ? cfg2.eng.luckybox.per_day : 0) : p === "boost" ? (cfg2.eng.adboost.enabled ? cfg2.eng.adboost.per_day : 0) : s.ads_spin_per_day;
      if ((a[p] || 0) >= limit) {
        err = "ads_limit";
        return;
      }
      a[p] = (a[p] || 0) + 1;
      delete a.nonce;
      delete a.p;
      if (p === "coins") {
        cur.balance += s.ads_coins;
        earn(cur, "ads", s.ads_coins);
        out = { purpose: p, coins: s.ads_coins };
      } else if (p === "box") {
        cur.balance += boxCoins;
        earn(cur, "ads", boxCoins);
        out = { purpose: p, coins: boxCoins };
      } else if (p === "boost") {
        const until = Math.max(now, Number((cur as any).ab_until) || 0) + cfg2.eng.adboost.minutes * 60000;
        (cur as any).ab_until = until;
        out = { purpose: p, until, mult: cfg2.eng.adboost.mult };
      } else if (p === "energy") {
        const eff = effective(cur, s, now);
        cur.energy = eff.max_energy;
        cur.max_energy = eff.max_energy;
        cur.last_energy_calc_time = now;
        cur.empty_at = null;
        out = { purpose: p };
      } else {
        const sp = cur.spin && cur.spin.day === day ? cur.spin : { day, used: 0, extra: cur.spin?.extra || 0 };
        sp.extra += 1;
        cur.spin = sp;
        out = { purpose: p };
      }
      cur.ads = a;
      out.balance = cur.balance;
      return cur;
    });
  if (err) throw new HttpError(409, err);
  if (out.purpose === "coins") {
    await lbAdd(user.id, s.ads_coins);
    await activity(user.id, "ads", { coins: s.ads_coins, note: "Watched an ad" });
  } else if (out.purpose === "box") {
    await lbAdd(user.id, out.coins);
    await activity(user.id, "ads", { coins: out.coins, note: "Lucky box" });
  }
  res.json({ success: true, ...out });
});

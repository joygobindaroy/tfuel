import { db } from "./firebase";
import { sortableId } from "./crypto";
import { earn, spend, usdtTot, activity } from "./wallet";
import { getCfg2 } from "./cfg2";
import { getPrice, toU, U } from "./market";
import { commissionBase, UserRecord } from "./user";
import { recordFill } from "./position";
import type { Settings } from "./settings";

/** Auto-convert: the user picks X%; X% of what they EARN (tap, tasks, articles, mining…) is sold for USDT at market price (normal trade fee).
 *  Works on app open (throttled). Tracks progress in users/<uid>/ac_base so each coin is converted once. */
export async function settleAutoConvert(uid: string, u: UserRecord, s: Settings, now = Date.now()): Promise<number> {
  try {
    const pct = Number((u as any).ac_pct) || 0;
    if (!(pct > 0) || !s.trade_enabled || !s.sell_enabled) return 0;
    const cfg = await getCfg2();
    if (!cfg.autoconv.enabled) return 0;
    if (now - ((u as any).ac_at || 0) < 10 * 60000) return 0;
    const base = commissionBase(u.earn);
    const delta = base - (Number((u as any).ac_base) || 0);
    const want = Math.floor((delta * pct) / 100);
    if (want < 1) return 0;
    const p = await getPrice(s);
    if (!p || p.stale) return 0;
    const gross = Math.round((want / s.coins_per_tfuel) * p.price * U);
    if (gross < toU(s.min_trade_usdt)) { await db().ref(`users/${uid}/ac_at`).set(now); return 0; }
    const fee = Math.floor(gross * (s.trade_fee_pct / 100));
    const net = gross - fee;
    const id = sortableId();
    let done = 0;
    await db().ref(`users/${uid}`).transaction((cur: any) => {
      done = 0;
      if (cur === null) return cur;
      const b = commissionBase(cur.earn);
      const d = b - (Number(cur.ac_base) || 0);
      if (Math.floor((d * pct) / 100) < want || cur.balance < want) return; // changed meanwhile → retry next time
      cur.balance -= want;
      spend(cur, "sold", want);
      usdtTot(cur, "sold", net);
      cur.usdt_u = (cur.usdt_u || 0) + net;
      cur.ac_base = b;
      cur.ac_at = now;
      cur.ac_total = (cur.ac_total || 0) + want;
      done = want;
      return cur;
    });
    if (!done) return 0;
    await db().ref(`trades/${id}`).set({ uid, side: "sell", coins: want, usdt_u: net, fee_u: fee, price: p.price, at: now, auto: true }).catch(() => {});
    await activity(uid, "sell", { coins: -want, usdt_u: net, note: `Auto-convert @ $${p.price}` });
    await recordFill(uid, "sell", want, net);
    return want;
  } catch (e) {
    console.error("autoconv", e);
    return 0;
  }
}
void earn;

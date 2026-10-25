import { db } from "./firebase";
import { getCfg2 } from "./cfg2";

export interface VipPerks { active: boolean; until: number; daily_pct: number; fee_off_pct: number; badge: string }
const NONE: VipPerks = { active: false, until: 0, daily_pct: 0, fee_off_pct: 0, badge: "" };

/** VIP pass perks for a user (inactive when the feature is off or the pass has expired) */
export async function vipPerks(uid: string): Promise<VipPerks> {
  try {
    const c = (await getCfg2()).vip;
    if (!c.enabled) return NONE;
    const until = Number((await db().ref(`vip/${uid}/until`).get()).val()) || 0;
    if (until <= Date.now()) return { ...NONE, until };
    return { active: true, until, daily_pct: c.daily_pct, fee_off_pct: c.fee_off_pct, badge: c.badge };
  } catch { return NONE; }
}

import { HttpError } from "./auth";
import { toU } from "./market";
import { usdtTot, activity } from "./wallet";
import { notify } from "./notify";
import type { UserRecord } from "./user";

export async function vipView(uid: string) {
  const c = (await getCfg2()).vip;
  const p = await vipPerks(uid);
  return { enabled: c.enabled, price: c.price, days: c.days, daily_pct: c.daily_pct, fee_off_pct: c.fee_off_pct, badge: c.badge, active: p.active, until: p.active ? p.until : 0 };
}
/** Buy / extend the VIP pass with USDT balance */
export async function vipBuy(uid: string) {
  const c = (await getCfg2(true)).vip;
  if (!c.enabled) throw new HttpError(403, "feature_off");
  const price = toU(c.price);
  let err = "";
  let charged = false;
  const r = await db().ref(`users/${uid}`).transaction((cur: UserRecord | null) => {
    err = "";
    charged = false;
    if (cur === null) return cur;
    if ((cur.usdt_u || 0) < price) { err = "insufficient_usdt"; return; }
    cur.usdt_u = (cur.usdt_u || 0) - price;
    usdtTot(cur, "vip", -price);
    charged = true;
    return cur;
  });
  if (err) throw new HttpError(409, err);
  if (!r.committed || !charged) throw new HttpError(409, "insufficient_usdt");
  const cur0 = Number((await db().ref(`vip/${uid}/until`).get()).val()) || 0;
  const until = Math.max(Date.now(), cur0) + c.days * 86400000;
  await db().ref().update({ [`vip/${uid}/until`]: until, "stats/vip_u": ServerValueInc(price), "stats/vip_n": ServerValueInc(1) });
  await activity(uid, "vip", { usdt_u: -price, note: `VIP pass · ${c.days} days` });
  await notify(uid, `${c.badge} VIP pass active until ${new Date(until).toISOString().slice(0, 10)}. Enjoy the perks!`).catch(() => {});
  return { until };
}
import { ServerValue } from "firebase-admin/database";
const ServerValueInc = (n: number) => ServerValue.increment(n);

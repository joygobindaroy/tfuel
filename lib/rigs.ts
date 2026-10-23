import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2, RigTier } from "./cfg2";
import { chargeCoins, creditCoins } from "./coins";

interface Rigs { n?: Record<string, number>; at?: number; pend?: number }
const rate = (tiers: RigTier[], n: Record<string, number>) => tiers.reduce((a, t) => a + t.rate * (n[t.id] || 0), 0);
export const rigPrice = (t: RigTier, owned: number, growth: number) => Math.max(1, Math.floor(t.price * Math.pow(1 + growth / 100, owned)));

export async function rigsView(uid: string) {
  const cfg = await getCfg2();
  const r = ((await db().ref(`rigs/${uid}`).get()).val() || {}) as Rigs;
  const n = r.n || {};
  const now = Date.now();
  const hours = r.at ? Math.min(cfg.rigs.cap_hours, Math.max(0, (now - r.at) / 3600000)) : 0;
  const perHour = rate(cfg.rigs.tiers, n);
  const pending = Math.floor((r.pend || 0) + perHour * hours);
  return {
    enabled: cfg.rigs.enabled, capHours: cfg.rigs.cap_hours, perHour, pending, full: hours >= cfg.rigs.cap_hours,
    tiers: cfg.rigs.tiers.map((t) => ({ ...t, owned: n[t.id] || 0, next: rigPrice(t, n[t.id] || 0, cfg.rigs.growth_pct) })),
  };
}

export async function rigBuy(uid: string, id: string) {
  const cfg = await getCfg2();
  if (!cfg.rigs.enabled) throw new HttpError(403, "feature_off");
  const t = cfg.rigs.tiers.find((x) => x.id === id);
  if (!t) throw new HttpError(404, "not_found");
  const owned = Number((await db().ref(`rigs/${uid}/n/${id}`).get()).val()) || 0;
  if (owned >= 100) throw new HttpError(409, "rig_max");
  const price = rigPrice(t, owned, cfg.rigs.growth_pct);
  await chargeCoins(uid, price, "boosts");
  const now = Date.now();
  await db().ref(`rigs/${uid}`).transaction((c: Rigs | null) => {
    const r: Rigs = c || {};
    const n = r.n || {};
    // bank what the current rigs produced so far, so a new rig only works from now on
    if (r.at) r.pend = (r.pend || 0) + rate(cfg.rigs.tiers, n) * Math.min(cfg.rigs.cap_hours, Math.max(0, (now - r.at) / 3600000));
    r.at = now;
    n[id] = (n[id] || 0) + 1;
    r.n = n;
    return r;
  });
  return price;
}

export async function rigCollect(uid: string) {
  const cfg = await getCfg2();
  if (!cfg.rigs.enabled) throw new HttpError(403, "feature_off");
  const now = Date.now();
  let amount = 0;
  await db().ref(`rigs/${uid}`).transaction((c: Rigs | null) => {
    amount = 0;
    if (!c || !c.n) return c;
    const hours = c.at ? Math.min(cfg.rigs.cap_hours, Math.max(0, (now - c.at) / 3600000)) : 0;
    amount = Math.floor((c.pend || 0) + rate(cfg.rigs.tiers, c.n) * hours);
    if (amount < 1) { amount = 0; return; }
    c.pend = 0;
    c.at = now;
    return c;
  });
  if (amount < 1) throw new HttpError(409, "nothing_to_collect");
  await creditCoins(uid, amount, "mining", "mining", "Rig collected");
  return amount;
}

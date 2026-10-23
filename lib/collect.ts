import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2, markSeasonPaid } from "./cfg2";
import { chargeCoins, creditCoins } from "./coins";
import { notify } from "./notify";
import { alertAdmins } from "./adminalert";

/**
 * Collectibles: in-app items at a FIXED price (coins). No resale/trading. Holding points (item pts × owned) decide each owner's share of the
 * season pool, which the admin funds. A share is not guaranteed to exceed what was paid.
 */
export async function collectView(uid: string) {
  const cfg = await getCfg2();
  const [mine, sold, st] = await Promise.all([db().ref(`collect/${uid}`).get(), db().ref("collect_sold").get(), db().ref("collect_stats").get()]);
  const m = (mine.val() || {}) as Record<string, number>;
  const sd = (sold.val() || {}) as Record<string, number>;
  const totalPts = Number(st.val()?.pts) || 0;
  const myPts = cfg.collect.items.reduce((a, it) => a + (m[it.id] || 0) * it.pts, 0);
  const s = cfg.collect.season;
  return {
    enabled: cfg.collect.enabled, season: { name: s.name, end: s.end, pool: s.pool, paid: s.paid },
    myPts, totalPts, share: totalPts > 0 ? Math.floor((s.pool * myPts) / totalPts) : 0, holders: Number(st.val()?.holders) || 0,
    items: cfg.collect.items.map((it) => ({ ...it, owned: m[it.id] || 0, left: it.supply > 0 ? Math.max(0, it.supply - (sd[it.id] || 0)) : null })),
  };
}

export async function collectBuy(uid: string, id: string) {
  const cfg = await getCfg2();
  if (!cfg.collect.enabled) throw new HttpError(403, "feature_off");
  const s = cfg.collect.season;
  if (s.end && Date.now() >= s.end) throw new HttpError(409, "season_over");
  const it = cfg.collect.items.find((x) => x.id === id);
  if (!it) throw new HttpError(404, "not_found");
  const owned = Number((await db().ref(`collect/${uid}/${id}`).get()).val()) || 0;
  if (it.max > 0 && owned >= it.max) throw new HttpError(409, "collect_max");
  let ok = true;
  await db().ref(`collect_sold/${id}`).transaction((c: number | null) => { ok = it.supply <= 0 || (c || 0) < it.supply; return ok ? (c || 0) + 1 : undefined; });
  if (!ok) throw new HttpError(409, "sold_out");
  try { await chargeCoins(uid, it.price, "shop"); }
  catch (e) { await db().ref(`collect_sold/${id}`).transaction((c: number | null) => Math.max(0, (c || 1) - 1)).catch(() => {}); throw e; }
  await db().ref().update({
    [`collect/${uid}/${id}`]: ServerValue.increment(1),
    "collect_stats/pts": ServerValue.increment(it.pts),
    ...(owned === 0 && !(await hasAny(uid, id)) ? { "collect_stats/holders": ServerValue.increment(1) } : {}),
  });
  return { price: it.price };
}
const hasAny = async (uid: string, except: string) => {
  const m = ((await db().ref(`collect/${uid}`).get()).val() || {}) as Record<string, number>;
  return Object.keys(m).some((k) => k !== except && m[k] > 0);
};

/** Cron: when the season ends, split the admin-funded pool by holding points (once) */
export async function paySeason(): Promise<number> {
  const cfg = await getCfg2(true);
  const s = cfg.collect.season;
  if (!cfg.collect.enabled || !s.end || Date.now() < s.end || s.paid || !(s.pool > 0)) return 0;
  let first = false;
  await db().ref(`lb_paid/collect_${s.end}`).transaction((c: number | null) => { first = c === null; return c === null ? Date.now() : undefined; });
  if (!first) return 0;
  const all = ((await db().ref("collect").get()).val() || {}) as Record<string, Record<string, number>>;
  const pts: [string, number][] = Object.entries(all).map(([uid, m]) => [uid, cfg.collect.items.reduce((a, it) => a + (m[it.id] || 0) * it.pts, 0)] as [string, number]).filter(([, p]) => p > 0);
  const total = pts.reduce((a, [, p]) => a + p, 0);
  let n = 0;
  for (const [uid, p] of pts) {
    const coins = Math.floor((s.pool * p) / total);
    if (coins > 0 && (await creditCoins(uid, coins, "prize", "prize", `${s.name} collectibles reward`, false))) { n++; await notify(uid, `🎉 ${s.name} has ended — your collection earned +${coins} coins!`); }
  }
  await markSeasonPaid();
  await alertAdmins("error", `Collectibles ${s.name} paid: ${n} holder(s), pool ${s.pool}.`);
  return n;
}

import { db } from "./firebase";

/** Average buy price + profit/loss tracking: pos/<uid> = { coins held from buys, cost_u (micro-USDT paid), real_u (realised P/L) } */
export interface Pos { coins: number; cost_u: number; real_u: number }
export async function recordFill(uid: string, side: "buy" | "sell", coins: number, usdt_u: number) {
  try {
    await db().ref(`pos/${uid}`).transaction((cur: Pos | null) => {
      const p: Pos = { coins: 0, cost_u: 0, real_u: 0, ...(cur || {}) };
      if (side === "buy") { p.coins += coins; p.cost_u += usdt_u; }
      else {
        const used = Math.min(coins, p.coins);
        const basis = p.coins > 0 ? Math.round((p.cost_u * used) / p.coins) : 0;
        p.real_u += usdt_u - basis;
        p.coins -= used;
        p.cost_u -= basis;
      }
      return p;
    });
  } catch {}
}
export async function plSummary(uid: string, price: number | null, cpt: number) {
  const p = ((await db().ref(`pos/${uid}`).get()).val() || null) as Pos | null;
  if (!p || (p.coins <= 0 && !p.real_u)) return null;
  const tf = p.coins / cpt;
  const avg = p.coins > 0 ? p.cost_u / 1e6 / tf : 0;
  const value = price ? tf * price : 0;
  return { tfuel: tf, avg, cost: p.cost_u / 1e6, value, unreal: price && p.coins > 0 ? value - p.cost_u / 1e6 : 0, realized: p.real_u / 1e6 };
}

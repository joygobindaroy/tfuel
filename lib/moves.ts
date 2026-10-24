import { db } from "./firebase";
import { getCfg2 } from "./cfg2";
import { peekPrice } from "./market";
import { notify } from "./notify";
import type { Settings } from "./settings";

/** Cron: price-move alerts. Each user picks 5 / 10 / 20 %; the reference price resets every 24 h. One message per user per period. */
export async function sendMoveAlerts(s: Settings): Promise<number> {
  const cfg = await getCfg2();
  if (!cfg.moves.enabled) return 0;
  const price = await peekPrice(s);
  if (!price || price <= 0) return 0;
  const now = Date.now();
  let ref = (await db().ref("stats/mv_ref").get()).val() as { price: number; at: number } | null;
  if (!ref || now - ref.at > 24 * 3600000) { ref = { price, at: now }; await db().ref("stats/mv_ref").set(ref); return 0; }
  const change = ((price - ref.price) / ref.price) * 100;
  if (Math.abs(change) < Math.min(...cfg.moves.options, 100)) return 0;
  const users = ((await db().ref("mv_users").get()).val() || {}) as Record<string, number>;
  let n = 0;
  for (const [uid, pct] of Object.entries(users)) {
    if (!(pct > 0) || Math.abs(change) < pct) continue;
    let first = false;
    await db().ref(`mv_sent/${uid}`).transaction((c: number | null) => { first = c !== ref!.at; return first ? ref!.at : undefined; });
    if (!first) continue;
    await notify(uid, `🔔 TFUEL price ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% in the last 24h — now $${price}.`, false, [[{ text: "📈 Price", callback_data: "x" }]]);
    n++;
  }
  return n;
}

import { db } from "./firebase";
import { sha256 } from "./crypto";
import { getCfg2 } from "./cfg2";
import { lifetimeEarn } from "./retention";

/** A/B reward test: users are split 50/50 by a hash of their id. Group B gets the daily reward × mult_b while the test is on. */
export const abGroup = (uid: string): "A" | "B" => (parseInt(sha256("ab:" + uid).slice(0, 6), 16) % 2 === 0 ? "A" : "B");
export async function abMult(uid: string): Promise<number> {
  const c = (await getCfg2()).ab;
  return c.enabled && abGroup(uid) === "B" ? c.mult_b : 1;
}

/** Admin: how the two groups behave (counts users who joined after the test started when a start time exists) */
export async function abStats() {
  const cfg = await getCfg2(true);
  const users = ((await db().ref("users").get()).val() || {}) as Record<string, any>;
  const now = Date.now();
  const g: Record<"A" | "B", { n: number; active7: number; streak: number; earn: number; deposit: number; daily7: number }> = { A: { n: 0, active7: 0, streak: 0, earn: 0, deposit: 0, daily7: 0 }, B: { n: 0, active7: 0, streak: 0, earn: 0, deposit: 0, daily7: 0 } };
  for (const [id, u] of Object.entries(users)) {
    if (u.banned) continue;
    const x = g[abGroup(id)];
    x.n++;
    if ((u.last_seen || 0) > now - 7 * 86400000) x.active7++;
    x.streak += u.daily?.streak || 0;
    x.earn += lifetimeEarn(u);
    if ((u.usdt_tot?.deposited || 0) > 0) x.deposit++;
    if (u.daily?.day && (u.last_seen || 0) > now - 7 * 86400000) x.daily7++;
  }
  const out = (k: "A" | "B") => { const x = g[k]; const n = Math.max(1, x.n); return { group: k, users: x.n, active7: Math.round((x.active7 / n) * 1000) / 10, avgStreak: Math.round((x.streak / n) * 10) / 10, avgEarn: Math.round(x.earn / n), depositors: Math.round((x.deposit / n) * 1000) / 10 }; };
  return { cfg: cfg.ab, a: out("A"), b: out("B") };
}

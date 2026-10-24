import crypto from "crypto";
import { HttpError } from "./auth";
import { db } from "./firebase";
import { dayKey } from "./log";
import { earn, activity, lbAdd } from "./wallet";
import { newUser, UserRecord } from "./user";
import type { Settings } from "./settings";

/** Lucky Spin (app + bot): free spins per day, then extra spins from ads. Prize is chosen on the server by weight. */
export async function doSpin(uid: string, s: Settings) {
  if (!s.spin_enabled) throw new HttpError(403, "spin_disabled");
  const total = s.spin_prizes.reduce((a, p) => a + p.weight, 0);
  let r = (crypto.randomInt(0, 1_000_000) / 1_000_000) * total;
  let idx = 0;
  for (let i = 0; i < s.spin_prizes.length; i++) {
    r -= s.spin_prizes[i].weight;
    if (r < 0) { idx = i; break; }
    idx = i;
  }
  const coins = s.spin_prizes[idx].coins;
  const day = dayKey();
  let err = "";
  let balance = 0;
  let left = { free: 0, extra: 0 };
  await db().ref(`users/${uid}`).transaction((cur: UserRecord | null) => {
    err = "";
    if (cur === null) return newUser();
    const sp = cur.spin && cur.spin.day === day ? cur.spin : { day, used: 0, extra: cur.spin?.extra || 0 };
    if (sp.used < s.spin_free_per_day) sp.used += 1;
    else if (sp.extra > 0) sp.extra -= 1;
    else { err = "no_spins"; return; }
    cur.spin = sp;
    cur.spin_last = [{ c: coins, at: Date.now() }, ...(cur.spin_last || [])].slice(0, 5);
    cur.balance += coins;
    earn(cur, "spin", coins);
    balance = cur.balance;
    left = { free: Math.max(0, s.spin_free_per_day - sp.used), extra: sp.extra };
    return cur;
  });
  if (err) throw new HttpError(409, err);
  await lbAdd(uid, coins);
  await activity(uid, "spin", { coins, note: "Lucky Spin" });
  return { index: idx, coins, balance, ...left };
}
export async function spinLeft(uid: string, s: Settings) {
  const sp = ((await db().ref(`users/${uid}/spin`).get()).val() || {}) as { day?: string; used?: number; extra?: number };
  const used = sp.day === dayKey() ? sp.used || 0 : 0;
  return { free: Math.max(0, s.spin_free_per_day - used), extra: sp.extra || 0 };
}

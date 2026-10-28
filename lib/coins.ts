import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { eventMult } from "./events";
import { earn, spend, lbAdd, activity, EarnKey, SpendKey, ActType } from "./wallet";
import type { UserRecord } from "./user";

/** Pay coins to a user (admin-funded rewards): balance + earn counter + leaderboard + activity. Returns false if the user doesn't exist. */
export async function creditCoins(uid: string, coins: number, key: EarnKey, type: ActType, note: string, lb = true): Promise<boolean> {
  if (key === "tasks") coins *= await eventMult(); // bonus event: tasks, games, puzzles
  coins = Math.floor(coins);
  if (coins < 1) return false;
  if ((await db().ref(`users/${uid}/balance`).get()).val() === null) return false;
  await db().ref().update({ [`users/${uid}/balance`]: ServerValue.increment(coins), [`users/${uid}/earn/${key}`]: ServerValue.increment(coins) });
  if (lb) await lbAdd(uid, coins);
  await activity(uid, type, { coins, note });
  return true;
}

/** Charge coins (throws HttpError insufficient). Optional extra mutation runs inside the same transaction. */
export async function chargeCoins(uid: string, coins: number, key: SpendKey, mutate?: (cur: UserRecord) => string | null): Promise<number> {
  coins = Math.floor(coins);
  let err = "";
  let bal = 0;
  const r = await db().ref(`users/${uid}`).transaction((cur: UserRecord | null) => {
    err = "";
    if (cur === null) return cur;
    if ((cur.balance || 0) < coins) { err = "insufficient"; return; }
    const m = mutate ? mutate(cur) : null;
    if (m) { err = m; return; }
    cur.balance -= coins;
    spend(cur, key, coins);
    bal = cur.balance;
    return cur;
  });
  if (err) throw new HttpError(409, err);
  if (!r.committed) throw new HttpError(409, "insufficient");
  return bal;
}
void earn;

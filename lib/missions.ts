import { db } from "./firebase";
import { HttpError } from "./auth";
import { dayKey } from "./log";
import { creditCoins } from "./coins";
import type { Settings } from "./settings";

/** Daily missions: tap N times · finish M tasks/articles · claim the daily reward → bonus. Counters live at dm/<uid>/<day>. */
export async function dmBump(uid: string, key: "taps" | "tasks", n = 1) {
  try {
    const { ServerValue } = await import("firebase-admin/database");
    await db().ref(`dm/${uid}/${dayKey()}/${key}`).set(ServerValue.increment(n));
  } catch {}
}

export async function missionsView(uid: string, s: Settings) {
  if (!s.dm_enabled) return { enabled: false };
  const day = dayKey();
  const [c, d] = await Promise.all([db().ref(`dm/${uid}/${day}`).get(), db().ref(`users/${uid}/daily/day`).get()]);
  const v = (c.val() || {}) as { taps?: number; tasks?: number; claimed?: number };
  const items = [
    { id: "taps", title: `Tap ${s.dm_taps} times`, have: Math.min(s.dm_taps, v.taps || 0), goal: s.dm_taps },
    { id: "tasks", title: s.dm_tasks === 1 ? "Finish 1 task or article" : `Finish ${s.dm_tasks} tasks or articles`, have: Math.min(s.dm_tasks, v.tasks || 0), goal: s.dm_tasks },
    ...(s.daily_enabled ? [{ id: "daily", title: "Claim your daily reward", have: d.val() === day ? 1 : 0, goal: 1 }] : []),
  ].map((m) => ({ ...m, done: m.have >= m.goal }));
  const all = items.every((m) => m.done);
  return { enabled: true, items, bonus: s.dm_bonus, all, claimed: !!v.claimed };
}

export async function missionsClaim(uid: string, s: Settings): Promise<number> {
  const v: any = await missionsView(uid, s);
  if (!v.enabled) throw new HttpError(403, "feature_off");
  if (!v.all) throw new HttpError(409, "missions_not_done");
  if (!(s.dm_bonus > 0)) throw new HttpError(409, "missions_no_bonus");
  let first = false;
  await db().ref(`dm/${uid}/${dayKey()}/claimed`).transaction((c: number | null) => { first = !c; return c ? undefined : Date.now(); });
  if (!first) throw new HttpError(409, "missions_claimed");
  await creditCoins(uid, s.dm_bonus, "prize", "prize", "Daily missions");
  return s.dm_bonus;
}

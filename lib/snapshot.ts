import { db } from "./firebase";
import { HttpError } from "./auth";
import { sortableId } from "./crypto";
import { dayKey } from "./log";
import { fromU } from "./market";
import { activity } from "./wallet";

/** Money snapshots: every balance (coins + micro-USDT) at one moment. Stored in the database (last 7 kept). Restore is per user. */
const KEEP = 7;
export async function snapCreate(by: string): Promise<{ id: string; users: number }> {
  const users = ((await db().ref("users").get()).val() || {}) as Record<string, any>;
  const m: Record<string, [number, number]> = {};
  for (const [id, u] of Object.entries(users)) m[id] = [Number(u.balance) || 0, Number(u.usdt_u) || 0];
  const id = sortableId();
  await db().ref(`snapshots/${id}`).set({ at: Date.now(), by, n: Object.keys(m).length, m });
  const all = Object.keys(((await db().ref("snapshots").get()).val() || {}) as Record<string, any>).sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) await db().ref(`snapshots/${old}`).remove();
  return { id, users: Object.keys(m).length };
}
export async function snapList() {
  const v = ((await db().ref("snapshots").get()).val() || {}) as Record<string, any>;
  return Object.entries(v).sort(([a], [b]) => (a < b ? 1 : -1)).map(([id, s]) => ({ id, at: s.at, by: s.by, n: s.n }));
}
export async function snapLook(id: string, uid: string) {
  const s = (await db().ref(`snapshots/${id}`).get()).val();
  if (!s) throw new HttpError(404, "Snapshot not found");
  const row = s.m?.[uid];
  if (!row) throw new HttpError(404, "This user is not in that snapshot");
  const cur = (await db().ref(`users/${uid}`).get()).val();
  return { at: s.at, snap: { coins: row[0], usdt: fromU(row[1]) }, now: { coins: Number(cur?.balance) || 0, usdt: fromU(Number(cur?.usdt_u) || 0) } };
}
export async function snapRestoreUser(id: string, uid: string, by: string, reason: string) {
  const l = await snapLook(id, uid);
  const s = (await db().ref(`snapshots/${id}/m/${uid}`).get()).val() as [number, number];
  await db().ref(`users/${uid}`).update({ balance: s[0], usdt_u: s[1] });
  await activity(uid, "adjust", { coins: s[0] - l.now.coins, note: `Restored from backup (${by})` });
  return { before: l.now, after: l.snap, reason };
}
export async function snapDaily(): Promise<boolean> {
  const day = dayKey();
  const r = await db().ref("stats/snap_day").transaction((c: any) => (c === day ? undefined : day));
  if (!r.committed) return false;
  await snapCreate("auto");
  return true;
}

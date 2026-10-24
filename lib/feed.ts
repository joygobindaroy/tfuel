import { db } from "./firebase";
import { sortableId } from "./crypto";
import { getSettings } from "./settings";

/** Community activity feed (public wins). Names respect nickname / "Hide me". Kept short; old entries are pruned by cron. */
export async function feedAdd(uid: string, text: string) {
  try {
    const s = await getSettings();
    if (!s.feed_enabled) return;
    const [n, p] = await Promise.all([db().ref(`users/${uid}/name`).get(), db().ref(`user_prefs/${uid}`).get()]);
    const pr = (p.val() || {}) as any;
    const name = pr.lb_hide ? "Someone" : String(pr.nick || n.val() || "A player").slice(0, 20);
    await db().ref(`feed/${sortableId()}`).set({ t: `${name} ${text}`.slice(0, 120), at: Date.now() });
  } catch {}
}
export async function feedList(n = 12): Promise<{ t: string; at: number }[]> {
  let v: Record<string, any>;
  try { v = ((await db().ref("feed").orderByKey().limitToLast(n).get()).val() || {}) as Record<string, any>; }
  catch { v = ((await db().ref("feed").get()).val() || {}) as Record<string, any>; }
  return Object.values(v).sort((a: any, b: any) => b.at - a.at).slice(0, n) as any;
}
export async function feedPrune(maxAgeMs = 3 * 86400000): Promise<number> {
  const v = ((await db().ref("feed").get()).val() || {}) as Record<string, any>;
  const cut = Date.now() - maxAgeMs;
  const up: Record<string, null> = {};
  for (const [k, x] of Object.entries(v)) if ((x?.at || 0) < cut) up[`feed/${k}`] = null;
  const n = Object.keys(up).length;
  if (n) await db().ref().update(up);
  return n;
}

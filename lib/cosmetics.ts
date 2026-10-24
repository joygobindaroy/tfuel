import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2 } from "./cfg2";
import { chargeCoins } from "./coins";

export async function cosView(uid: string) {
  const cfg = await getCfg2();
  const [own, eq] = await Promise.all([db().ref(`cos_owned/${uid}`).get(), db().ref(`user_prefs/${uid}/cos`).get()]);
  const o = (own.val() || {}) as Record<string, number>;
  const e = (eq.val() || {}) as { badge?: string; frame?: string };
  return { enabled: cfg.cosmetics.enabled, equipped: e, items: cfg.cosmetics.items.map((i) => ({ ...i, owned: !!o[i.id], on: e[i.kind] === i.id })) };
}
export async function cosBuy(uid: string, id: string) {
  const cfg = await getCfg2();
  if (!cfg.cosmetics.enabled) throw new HttpError(403, "feature_off");
  const it = cfg.cosmetics.items.find((x) => x.id === id);
  if (!it) throw new HttpError(404, "not_found");
  if ((await db().ref(`cos_owned/${uid}/${id}`).get()).val()) throw new HttpError(409, "cos_owned");
  await chargeCoins(uid, it.price, "shop");
  await db().ref().update({ [`cos_owned/${uid}/${id}`]: Date.now(), [`user_prefs/${uid}/cos/${it.kind}`]: id });
}
export async function cosEquip(uid: string, id: string, kind: string) {
  if (!id) { if (kind !== "badge" && kind !== "frame") throw new HttpError(400, "bad_request"); await db().ref(`user_prefs/${uid}/cos/${kind}`).remove(); return; }
  const cfg = await getCfg2();
  const it = cfg.cosmetics.items.find((x) => x.id === id);
  if (!it || !(await db().ref(`cos_owned/${uid}/${id}`).get()).val()) throw new HttpError(403, "cos_not_owned");
  await db().ref(`user_prefs/${uid}/cos/${it.kind}`).set(id);
}
/** "✨🔥 Name" for leaderboards etc. (called with the user's prefs object) */
export function decorate(name: string, cos: any, items: { id: string; emoji: string }[]): string {
  if (!cos) return name;
  const e = (id?: string) => items.find((x) => x.id === id)?.emoji || "";
  return `${e(cos.frame)}${e(cos.badge)} ${name}`.trim();
}

import { db } from "./firebase";
import { HttpError } from "./auth";
import type { Settings } from "./settings";

/** Money-out guard: a frozen account (admin action, not a ban) or a blocked country can't withdraw / send. */
export async function assertCanMoveMoney(uid: string, s?: Settings) {
  const f = (await db().ref(`frozen/${uid}`).get()).val();
  if (f) throw new HttpError(403, "account_frozen");
  const safe = Number((await db().ref(`user_prefs/${uid}/safe_until`).get()).val()) || 0;
  if (safe > Date.now()) throw new HttpError(403, "safe_mode");
  const list = (s?.blocked_countries || []).map((x) => String(x).toUpperCase());
  if (list.length) {
    const cc = String((await db().ref(`user_prefs/${uid}/geo/cc`).get()).val() || "").toUpperCase();
    if (cc && list.includes(cc)) throw new HttpError(403, "country_blocked");
  }
}

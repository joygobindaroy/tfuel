import crypto from "crypto";
import { db } from "./firebase";
import { HttpError } from "./auth";
import type { Settings } from "./settings";

const h = (a: string) => crypto.createHash("sha256").update(a.trim().toLowerCase()).digest("hex").slice(0, 24);

/** withdraw ঠিকানার নিরাপত্তা: whitelist + নতুন ঠিকানার cooldown */
export async function checkAddress(uid: string, address: string, s: Settings): Promise<void> {
  const own = !!(await db().ref(`user_prefs/${uid}/wl_only`).get()).val();
  if (!own && !s.withdraw_whitelist_only && !(s.addr_cooldown_hours > 0)) return;
  const addrs = ((await db().ref(`user_prefs/${uid}/addrs`).get()).val() || {}) as Record<string, { address: string; added_at?: number }>;
  const saved = Object.values(addrs).find((a) => a.address.trim().toLowerCase() === address.trim().toLowerCase());
  if ((own || s.withdraw_whitelist_only) && !saved) throw new HttpError(403, "addr_not_saved");
  if (!(s.addr_cooldown_hours > 0)) return;
  const now = Date.now();
  let first = saved?.added_at;
  if (first === undefined) {
    const k = `user_prefs/${uid}/addr_seen/${h(address)}`;
    const r = await db().ref(k).transaction((c) => (c === null ? now : undefined));
    first = r.committed ? now : Number(r.snapshot.val()) || now;
  }
  const ready = first + s.addr_cooldown_hours * 3600000;
  if (now < ready) throw new HttpError(403, "addr_cooldown");
}

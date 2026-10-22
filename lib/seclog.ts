import { db } from "./firebase";
import { sortableId } from "./crypto";
import type { ReqCtx } from "./reqctx";

export type SecType = "email_verified" | "email_changed" | "pin_set" | "pin_changed" | "pin_removed" | "pin_reset" | "addr_added" | "addr_removed" | "new_device" | "withdraw_request" | "withdraw_held" | "terms_accepted" | "device_removed" | "devices_revoked";

/** user-এর নিরাপত্তা-সংক্রান্ত ঘটনার ইতিহাস (admin দেখতে পায়) — best-effort */
export async function secLog(uid: string, type: SecType, ctx?: ReqCtx, note = "") {
  try {
    await db().ref(`sec_log/${uid}/${sortableId()}`).set({ t: type, at: Date.now(), ip: ctx?.ip || "", dev: ctx?.device || "", where: ctx?.where || "", n: note.slice(0, 120) });
  } catch {}
}

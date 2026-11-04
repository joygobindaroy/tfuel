import { db } from "./firebase";
import { HttpError } from "./auth";
import { getRefCode } from "./refcode";
import { isBlocked } from "./blocks";
import { Pv, PV_DEFAULT, pvClean } from "./pvtypes";
export * from "./pvtypes";

export async function pvGet(uid: string): Promise<Pv> {
  try { return pvClean((await db().ref(`user_prefs/${uid}/pv`).get()).val() || {}); } catch { return PV_DEFAULT; }
}
export async function pvSet(uid: string, patch: any): Promise<Pv> {
  const cur = await pvGet(uid);
  const next = pvClean(patch, cur);
  await db().ref().update({ [`user_prefs/${uid}/pv`]: next, [`weekly_users/${uid}`]: next.wk ? true : null });
  return next;
}

/** Is `other` one of `owner`'s saved contacts? (contacts are stored by the contact's 10-character ID) */
async function inContacts(owner: string, other: string): Promise<boolean> {
  const code = await getRefCode(other).catch(() => "");
  return !!code && (await db().ref(`contacts/${owner}/${code}`).get()).exists();
}
/** Receiver's rule for money coming in */
export async function assertReceiverOk(from: string, to: string) {
  if (await isBlocked(to, from)) throw new HttpError(403, "recipient_blocks");
  const p = await pvGet(to);
  if (p.rx === "all") return;
  if (p.rx === "none") throw new HttpError(403, "recipient_blocks");
  if (!(await inContacts(to, from))) throw new HttpError(403, "recipient_blocks");
}
/** Payer's rule for payment requests */
export async function assertRequestOk(payer: string, requester: string) {
  if (await isBlocked(payer, requester)) throw new HttpError(403, "requests_off");
  const p = await pvGet(payer);
  if (p.rq === "all") return;
  if (p.rq === "none") throw new HttpError(403, "requests_off");
  if (!(await inContacts(payer, requester))) throw new HttpError(403, "requests_off");
}

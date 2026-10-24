import { db } from "./firebase";
import { notify } from "./notify";
import { alertAdmins } from "./adminalert";
import { secLog } from "./seclog";

/** "🚫 It wasn't me" on a new-device alert: freeze money-out at once, forget the device, tell the admin. Admin can lift the freeze from the user page. */
export async function itWasntMe(uid: string, dev: string): Promise<string> {
  const now = Date.now();
  const up: Record<string, any> = { [`frozen/${uid}`]: { reason: "User reported an unknown device", by: "user", at: now }, [`user_prefs/${uid}/sess_epoch`]: now };
  if (/^[\w-]{1,40}$/.test(dev)) up[`user_prefs/${uid}/devices/${dev}`] = null;
  await db().ref().update(up);
  await secLog(uid, "not_me", undefined, "reported from the bot");
  await alertAdmins("error", `User ${uid} says a new-device login wasn't them. Withdraw/send is frozen. Review in Admin → Users.`);
  await notify(uid, "🔒 Withdrawals and transfers are paused for your safety. Contact support from the app (Profile → Support) to unlock, and set a Withdraw PIN.", true);
  return "🔒 Done. Money-out is paused. Contact support to unlock.";
}

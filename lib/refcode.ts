import crypto from "crypto";
import { db } from "./firebase";

const ALPHA = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const gen = () => Array.from(crypto.randomBytes(10), (b) => ALPHA[b % ALPHA.length]).join("");

/** প্রতিটা user-এর একটাই এলোমেলো referral code (Telegram ID লুকানো থাকে) */
export async function getRefCode(uid: string): Promise<string> {
  const cur = (await db().ref(`user_prefs/${uid}/refcode`).get()).val();
  if (typeof cur === "string" && cur) return cur;
  for (let i = 0; i < 8; i++) {
    const code = gen();
    const r = await db().ref(`ref_codes/${code}`).transaction((c) => (c === null ? uid : undefined));
    if (r.committed) {
      await db().ref(`user_prefs/${uid}/refcode`).set(code);
      return code;
    }
  }
  throw new Error("refcode_failed");
}

/** start_param থেকে referrer-এর id: নতুন random code বা পুরনো ref_<id> */
export async function resolveRef(param: string | undefined): Promise<string | null> {
  if (!param) return null;
  const old = /^ref_(\d{1,20})$/.exec(param);
  if (old) return old[1];
  if (/^[A-Za-z0-9]{10}$/.test(param)) {
    const v = (await db().ref(`ref_codes/${param}`).get()).val();
    return typeof v === "string" ? v : null;
  }
  return null;
}

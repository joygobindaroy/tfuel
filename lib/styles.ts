import { db } from "./firebase";
import { cardStyleOk, type CardStyle } from "./cardkit";
import { rcptStyleOk, type RcptStyle } from "./rcptkit";

/** The person's own choice of card look (invite / win / earnings) and receipt look. Stored in user_prefs/<uid>/{card,rcpt}. */
export async function cardStyleOf(uid: string): Promise<CardStyle> {
  try { return cardStyleOk((await db().ref(`user_prefs/${uid}/card`).get()).val()); } catch { return "1"; }
}
export async function rcptStyleOf(uid: string): Promise<RcptStyle> {
  try { return rcptStyleOk((await db().ref(`user_prefs/${uid}/rcpt`).get()).val()); } catch { return "b"; }
}

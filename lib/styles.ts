import { db } from "./firebase";
import { getCfg2 } from "./cfg2";
import { cardStyleOk, type CardStyle } from "./cardkit";
import { rcptStyleOk, type RcptStyle } from "./rcptkit";

/** The person's own choice of card look (invite / win / earnings) and receipt look. Stored in user_prefs/<uid>/{card,rcpt}. */
export async function cardStyleOf(uid: string): Promise<CardStyle> {
  try { const v = (await db().ref(`user_prefs/${uid}/card`).get()).val(); return cardStyleOk(v || (await getCfg2()).brand.def_card); } catch { return "1"; }
}
export async function rcptStyleOf(uid: string): Promise<RcptStyle> {
  try { const v = (await db().ref(`user_prefs/${uid}/rcpt`).get()).val(); return rcptStyleOk(v || (await getCfg2()).brand.def_rcpt); } catch { return "b"; }
}

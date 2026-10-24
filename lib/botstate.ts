import { db } from "./firebase";
/** Short conversation state in the bot ("send me your message for the ticket"). Expires after 15 minutes. */
export type BotState = { a: "ticket_new" | "ticket_reply"; id?: string; at: number };
export const setState = (uid: string, st: Omit<BotState, "at">) => db().ref(`bot_state/${uid}`).set({ ...st, at: Date.now() });
export const clearState = (uid: string) => db().ref(`bot_state/${uid}`).remove();
export async function getState(uid: string): Promise<BotState | null> {
  const v = (await db().ref(`bot_state/${uid}`).get()).val() as BotState | null;
  if (!v) return null;
  if (Date.now() - v.at > 15 * 60000) { await clearState(uid); return null; }
  return v;
}

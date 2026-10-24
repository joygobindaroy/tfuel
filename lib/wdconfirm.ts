import { db } from "./firebase";
import { tgCall } from "./telegram";
import { notify } from "./notify";
import { settleUsdtWithdrawal } from "./payouts";
import type { Settings } from "./settings";

export const CONFIRM_TAG = "Waiting for the user's confirmation in the bot";
const mask = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-6)}` : a);

/** Big USDT withdrawal: ask the user in the bot "was this you?". If the message can't be delivered (bot never started) nothing changes. */
export async function askConfirm(uid: string, id: string, s: Settings, w: { amount: number; network_name: string; address: string }): Promise<boolean> {
  if (!(s.confirm_bot_usdt > 0) || w.amount < s.confirm_bot_usdt) return false;
  const r = await tgCall("sendMessage", {
    chat_id: uid,
    text: `⚠️ Confirm your withdrawal\n\nAmount: ${w.amount} USDT\nNetwork: ${w.network_name}\nTo: ${mask(w.address)}\n\nWas this you? We only process it after you confirm.`,
    reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "✅ Yes, it was me", callback_data: `wc:y:${id}` }, { text: "❌ No, cancel it", callback_data: `wc:n:${id}` }]] }),
  });
  if (!r.ok) return false;
  await db().ref(`usdt_withdrawals/${id}`).transaction((c: any) => {
    if (!c || c.status !== "pending") return c;
    c.hold = c.hold ? `${c.hold}; ${CONFIRM_TAG}` : CONFIRM_TAG;
    c.bot_confirm = "pending";
    return c;
  });
  return true;
}

export async function answerConfirm(uid: string, id: string, yes: boolean, s: Settings): Promise<string> {
  const w = (await db().ref(`usdt_withdrawals/${id}`).get()).val();
  if (!w || String(w.uid) !== uid) return "This request wasn't found.";
  if (w.status !== "pending") return `This withdrawal is already ${w.status}.`;
  if (w.bot_confirm !== "pending") return "This request was already answered.";
  if (!yes) {
    try { await settleUsdtWithdrawal(id, false, "Cancelled by the user in the bot", `user:${uid}`); } catch { return "Couldn't cancel right now. Contact support."; }
    return "❌ Cancelled. Your USDT was returned to your wallet.";
  }
  await db().ref(`usdt_withdrawals/${id}`).transaction((c: any) => {
    if (!c) return c;
    const parts = String(c.hold || "").split("; ").filter((x) => x && x !== CONFIRM_TAG);
    if (parts.length) c.hold = parts.join("; "); else delete c.hold;
    c.bot_confirm = "yes";
    return c;
  });
  void s;
  await notify(uid, "✅ Thanks — your withdrawal was confirmed and is in review.", true);
  return "✅ Confirmed. Your withdrawal is in review.";
}

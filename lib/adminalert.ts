import { getSettings } from "./settings";
import { tgCall } from "./telegram";

export type AlertKind = "big_withdraw" | "hold" | "ticket" | "error";
const sent = new Map<string, number[]>();

/** Chats that receive admin alerts: Settings → alert_chat plus every ADMIN_TELEGRAM_IDS entry */
export function alertTargets(chat: string): string[] {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map((x) => x.trim()).filter((x) => /^-?\d+$/.test(x));
  return Array.from(new Set([...(chat ? [chat] : []), ...ids]));
}

/** Telegram message to the admin(s). Obeys the alert_* switches, max 8 per kind per minute. Never throws. */
export async function alertAdmins(kind: AlertKind, text: string, o: { amountUsdt?: number } = {}): Promise<boolean> {
  try {
    const s = await getSettings();
    if (kind === "big_withdraw" && !(s.alert_big_usdt > 0 && (o.amountUsdt || 0) >= s.alert_big_usdt)) return false;
    if (kind === "hold" && !s.alert_hold) return false;
    if (kind === "ticket" && !s.alert_ticket) return false;
    if (kind === "error" && !s.alert_errors) return false;
    const now = Date.now();
    const arr = (sent.get(kind) || []).filter((t) => now - t < 60000);
    if (arr.length >= 8) return false;
    arr.push(now);
    sent.set(kind, arr);
    const icon = { big_withdraw: "💸", hold: "⏸", ticket: "🎫", error: "⚠️" }[kind];
    let ok = false;
    for (const chat of alertTargets(s.alert_chat)) {
      const r = await tgCall("sendMessage", { chat_id: chat, text: `${icon} ${text}`.slice(0, 900), disable_web_page_preview: "true" });
      ok = ok || !!r.ok;
    }
    return ok;
  } catch {
    return false;
  }
}

import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { randomId } from "./crypto";
import { getSettings } from "./settings";
import { tgCall } from "./telegram";

/** অ্যাপের ভেতরের inbox (🔔)। Telegram বন্ধ/ব্লক থাকলেও জমা হয়। counter আলাদা node-এ, যাতে user record অক্ষত থাকে */
export async function inboxPush(uid: string, text: string) {
  try {
    await db().ref().update({
      [`inbox/${uid}/${String(Date.now()).padStart(13, "0")}${randomId().slice(0, 6)}`]: { m: String(text).slice(0, 300), at: Date.now() },
      [`inbox_meta/${uid}/unread`]: ServerValue.increment(1),
    });
  } catch {}
}

export type NotifCat = "money" | "rewards" | "tasks" | "news" | "security";
/** বার্তার ধরন (emoji/লেখা দেখে): security সবসময় যায়, বাকি গ্রুপ user বন্ধ করতে পারে */
export function catOf(text: string): NotifCat {
  if (/^(🔐|🔒|🔔 New login)/.test(text)) return "security";
  if (/^(✅|❌|↩️|💸|🛍|🔓|🔔 TFUEL price)/.test(text)) return "money";
  if (/^(⚡|🎁|👋|🎉|🏆|🔥|🏅|🎯)/.test(text)) return "rewards";
  if (/^(📝|☑️)/.test(text)) return "tasks";
  return "news";
}
/** quiet hours: user-এর স্থানীয় সময়ে from..to (ঘণ্টা) */
export function inQuiet(q: any, now = Date.now()): boolean {
  if (!q?.on) return false;
  const tz = Number.isFinite(Number(q.tz)) ? Number(q.tz) : 0; // মিনিট (UTC থেকে পার্থক্য)
  const h = new Date(now + tz * 60000).getUTCHours();
  const f = Number(q.from), t = Number(q.to);
  if (f === t) return false;
  return f < t ? h >= f && h < t : h >= f || h < t;
}

/** Telegram bot দিয়ে user-কে বার্তা (best-effort: user bot চালু না করলে/ব্লক করলে চুপচাপ বাদ) */
export type NBtn = { text: string; url?: string; callback_data?: string };
export async function notify(uid: string, text: string, force = false, kb?: NBtn[][]) {
  await inboxPush(uid, text);
  try {
    const s = await getSettings();
    if (!s.notify_enabled && !force) return false;
    if (!force && (await db().ref(`users/${uid}/notify_off`).get()).val()) return false;
    if (!force) {
      const cat = catOf(text);
      if (cat !== "security") {
        const pr = ((await db().ref(`user_prefs/${uid}`).get()).val() || {}) as any;
        if (pr.notif && pr.notif[cat] === false) return false;
        if (inQuiet(pr.quiet)) return false;
      }
    }
    const params: Record<string, string | number> = { chat_id: uid, text: text.slice(0, 600), disable_web_page_preview: "true" };
    const link = s.referral_link;
    const rows: NBtn[][] = [...(kb || [])];
    if (link) rows.push([{ text: "Open app", url: link }]);
    if (rows.length) params.reply_markup = JSON.stringify({ inline_keyboard: rows });
    const r = await tgCall("sendMessage", params);
    return !!r.ok;
  } catch {
    return false;
  }
}

import { faqReply } from "./faqbot";
import { tgCall } from "./telegram";
import { getSettings, Settings } from "./settings";
import { getRefCode } from "./refcode";
import { claimJoin } from "./taskclaim";
import { rateLimit } from "./api";
import { HttpError } from "./auth";
import {
  View, Kb, esc, openBtn, tf, welcomeView, profileView, inviteView, tasksView, dailyView, walletView, leaderboardView, boardText,
  priceView, priceText, clanBotView, helpView, faqAnswerView, settingsView, toggleSetting, receiptView, deepLink,
} from "./botviews";

/** Commands shown in Telegram's "Menu" (set by Admin → Connect Telegram) */
export const BOT_COMMANDS = [
  { command: "start", description: "Open TFUEL" },
  { command: "daily", description: "Claim your daily reward" },
  { command: "balance", description: "My wallet" },
  { command: "profile", description: "My profile & invite link" },
  { command: "tasks", description: "Tasks you can do" },
  { command: "top", description: "Leaderboard" },
  { command: "price", description: "TFUEL price" },
  { command: "clan", description: "My clan & raid boss" },
  { command: "invite", description: "Invite friends" },
  { command: "settings", description: "Notifications" },
  { command: "help", description: "Help & FAQ" },
];

const mk = (v: View) => JSON.stringify({ inline_keyboard: v.kb });
const send = (chat: number | string, v: View, html = true) =>
  tgCall("sendMessage", { chat_id: chat, text: v.text, ...(html ? { parse_mode: "HTML" } : {}), disable_web_page_preview: "true", reply_markup: mk(v) });
/** /start (and "back"): banner photo on top when the admin set one */
async function sendHome(chat: number | string, v: View, s: Settings) {
  if (s.bot_photo) {
    if (v.text.length <= 1000) { const r = await tgCall("sendPhoto", { chat_id: chat, photo: s.bot_photo, caption: v.text, reply_markup: mk(v) }); if (r.ok) return; }
    else { const r = await tgCall("sendPhoto", { chat_id: chat, photo: s.bot_photo }); void r; }
  }
  await send(chat, v, false);
}
const edit = (chat: number | string, mid: number, v: View, html: boolean, photo: boolean) =>
  photo
    ? tgCall("editMessageCaption", { chat_id: chat, message_id: mid, caption: v.text.slice(0, 1000), ...(html ? { parse_mode: "HTML" } : {}), reply_markup: mk(v) })
    : tgCall("editMessageText", { chat_id: chat, message_id: mid, text: v.text, ...(html ? { parse_mode: "HTML" } : {}), disable_web_page_preview: "true", reply_markup: mk(v) });

/** message / callback_query / inline_query — Stars are handled separately (tg-webhook) */
export async function handleBot(u: any): Promise<boolean> {
  const s = await getSettings();

  // ---- inline mode: @bot → "Invite friends" card with the user's own link ----
  if (u.inline_query) {
    const q = u.inline_query;
    if (!s.bot_inline || !s.referral_enabled) { await tgCall("answerInlineQuery", { inline_query_id: q.id, results: "[]", cache_time: 60 }); return true; }
    try { await rateLimit(String(q.from?.id), "botinline", 20); } catch { return true; }
    const code = await getRefCode(String(q.from?.id)).catch(() => "");
    const link = s.referral_link ? `${s.referral_link}${code ? `?startapp=${code}` : ""}` : "";
    if (!link) { await tgCall("answerInlineQuery", { inline_query_id: q.id, results: "[]", cache_time: 60 }); return true; }
    const msg = `${s.invite_msg || "Join me on TFUEL and start mining!"}\n\n👉 ${link}`;
    const results = [{ type: "article", id: "invite", title: "📤 Invite friends to TFUEL", description: "Send your personal invite link", input_message_content: { message_text: msg, disable_web_page_preview: true }, reply_markup: { inline_keyboard: [[{ text: "⛏ Start Mining", url: link }]] } }];
    await tgCall("answerInlineQuery", { inline_query_id: q.id, results: JSON.stringify(results), cache_time: 30, is_personal: "true" });
    return true;
  }

  if (u.message?.text) {
    const chatType = u.message.chat?.type;
    const m = /^\/(start|profile|tasks|invite|help|menu|balance|wallet|daily|top|price|clan|settings)(?:@\w+)?(?:\s+(\S+))?/i.exec(u.message.text);
    const chat = u.message.chat.id;

    // ---- groups: only /top and /price (public info) ----
    if (chatType === "group" || chatType === "supergroup") {
      if (!s.bot_groups || !m) return false;
      const cmd = m[1].toLowerCase();
      if (cmd !== "top" && cmd !== "price") return false;
      try { await rateLimit(String(chat), "botgrp", 8); } catch { return true; }
      const text = cmd === "top" ? await boardText(null, s, "d") : await priceText(s);
      await tgCall("sendMessage", { chat_id: chat, text, parse_mode: "HTML", disable_web_page_preview: "true", reply_markup: JSON.stringify({ inline_keyboard: [[openBtn(s, "⛏ Open TFUEL")]] }) });
      return true;
    }
    if (chatType !== "private") return false;

    if (!m) {
      // free text → FAQ auto-reply (commands that aren't ours are ignored)
      const txt = String(u.message.text || "").trim();
      if (txt.startsWith("/") || txt.length < 4) return false;
      const fid = String(u.message.from?.id || chat);
      try { await rateLimit(fid, "botfaq", 6); } catch { return true; }
      const r = await faqReply(txt, s);
      if (!r) return false;
      await tgCall("sendMessage", { chat_id: chat, text: r.text.slice(0, 1500), disable_web_page_preview: "true", reply_markup: JSON.stringify({ inline_keyboard: [[openBtn(s, r.found ? "📱 Open app" : "💬 Open Support", r.found ? undefined : "go_support")]] }) });
      return true;
    }
    const uid = String(u.message.from?.id || chat);
    try { await rateLimit(uid, "botcmd", 20); } catch { return true; }
    const cmd = m[1].toLowerCase();
    if (cmd === "profile") await send(chat, await profileView(uid, s));
    else if (cmd === "tasks") await send(chat, await tasksView(uid, s));
    else if (cmd === "invite") {
      const v = await inviteView(uid, s);
      if (s.bot_photo && v.text.length <= 1000) { const r = await tgCall("sendPhoto", { chat_id: chat, photo: s.bot_photo, caption: v.text, parse_mode: "HTML", reply_markup: mk(v) }); if (!r.ok) await send(chat, v); }
      else await send(chat, v);
    }
    else if (cmd === "balance" || cmd === "wallet") await send(chat, await walletView(uid, s));
    else if (cmd === "daily") await send(chat, await dailyView(uid, s));
    else if (cmd === "top") await send(chat, await leaderboardView(uid, s, "d"));
    else if (cmd === "price") await send(chat, await priceView(s));
    else if (cmd === "clan") await send(chat, await clanBotView(uid, s));
    else if (cmd === "settings") await send(chat, await settingsView(uid, s));
    else if (cmd === "help" && !m[2]) await send(chat, helpView(s));
    else {
      const param = m[2] && /^[\w-]{1,64}$/.test(m[2]) ? m[2] : undefined;
      await sendHome(chat, await welcomeView(uid, s, u.message.from?.first_name, param), s);
    }
    return true;
  }

  const q = u.callback_query;
  if (q?.data && q.message) {
    const chat = q.message.chat.id;
    const mid = q.message.message_id;
    const uid = String(q.from?.id);
    const photo = !!q.message.photo;
    try { await rateLimit(uid, "botcb", 30); } catch { await tgCall("answerCallbackQuery", { callback_query_id: q.id, text: "Slow down a little." }); return true; }
    const d = String(q.data);
    let note = "";
    let view: View | null = null;
    let html = true;
    if (d === "m") { view = await welcomeView(uid, s, q.from?.first_name); html = false; }
    else if (d === "p") view = await profileView(uid, s);
    else if (d === "i") view = await inviteView(uid, s);
    else if (d === "t") view = await tasksView(uid, s);
    else if (d === "d") view = await dailyView(uid, s);
    else if (d === "w") view = await walletView(uid, s);
    else if (d === "l" || d.startsWith("l:")) view = await leaderboardView(uid, s, (["d", "w", "a"].includes(d.slice(2)) ? d.slice(2) : "d") as "d" | "w" | "a");
    else if (d === "x") view = await priceView(s);
    else if (d === "c") view = await clanBotView(uid, s);
    else if (d === "h") view = helpView(s);
    else if (d.startsWith("q:")) view = faqAnswerView(s, Number(d.slice(2)) || 0);
    else if (d === "s") view = await settingsView(uid, s);
    else if (d.startsWith("st:")) { await toggleSetting(uid, d.slice(3)); view = await settingsView(uid, s); note = "Saved"; }
    else if (d.startsWith("r:")) { const [, k, id] = d.split(":"); view = await receiptView(uid, s, k, id || ""); }
    else if (d.startsWith("v:")) {
      try {
        const r = await claimJoin({ id: uid, first_name: q.from?.first_name, username: q.from?.username }, d.slice(2));
        note = `✅ +${tf(r.reward, s.coins_per_tfuel)} TFUEL added!`;
      } catch (e: any) {
        note = e instanceof HttpError ? ({ not_joined: "You haven't joined yet. Join, then tap Verify.", verify_unavailable: "Can't verify right now. Try the app.", "Already claimed": "Already claimed." } as Record<string, string>)[e.message] || "Couldn't verify this task." : "Something went wrong.";
      }
      view = await tasksView(uid, s);
    }
    await tgCall("answerCallbackQuery", { callback_query_id: q.id, ...(note ? { text: note } : {}) });
    if (view) await edit(chat, mid, view, html, photo);
    return true;
  }
  return false;
}
void esc; void deepLink;
export type { Kb };

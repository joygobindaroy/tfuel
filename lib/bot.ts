import { faqReply } from "./faqbot";
import { tgCall } from "./telegram";
import { getSettings, Settings } from "./settings";
import { getRefCode } from "./refcode";
import { claimJoin } from "./taskclaim";
import { rateLimit } from "./api";
import { HttpError } from "./auth";
import { adminIds, isAdmin, myStatsView, missionsBotView, spinBotView, withdrawalsView, supportBotView, ticketBotView, depositBotView, depositNetView, cardInfo, adminStatsView, adminPendingView, adminSettle } from "./botviews2";
import { getState, setState, clearState } from "./botstate";
import { createTicket, replyTicket } from "./tickets";
import { answerConfirm } from "./wdconfirm";
import { itWasntMe } from "./notme";
import { cancelHold } from "./transfer";
import { claimRetention } from "./retention";
import {
  View, Kb, esc, openBtn, tf, welcomeView, profileView, inviteView, tasksView, dailyView, walletView, leaderboardView, boardText,
  priceView, priceText, clanBotView, helpView, faqAnswerView, settingsView, toggleSetting, receiptView, deepLink,
} from "./botviews";

/** Commands shown in Telegram's "Menu" (set by Admin → Connect Telegram) */
export const BOT_COMMANDS = [
  { command: "start", description: "Open TFUEL" },
  { command: "daily", description: "Claim your daily reward" },
  { command: "spin", description: "Lucky Spin" },
  { command: "missions", description: "Today's missions" },
  { command: "mystats", description: "My earnings & level" },
  { command: "withdrawals", description: "My withdrawals" },
  { command: "deposit", description: "Deposit address & QR" },
  { command: "support", description: "My support tickets" },
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

/** 🖼 invite card (signed image from /api/card) with the link as caption; falls back to the plain invite message */
async function sendCard(chat: number | string, uid: string, s: Settings, name?: string) {
  const c = await cardInfo(uid, s, name || "");
  if (c) { const r = await tgCall("sendPhoto", { chat_id: chat, photo: c.url, caption: c.caption.slice(0, 1000), reply_markup: JSON.stringify({ inline_keyboard: [[{ text: "⛏ Start Mining", url: c.link }]] }) }); if (r.ok) return; }
  await send(chat, await inviteView(uid, s));
}

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
    const m = /^\/(start|profile|tasks|invite|help|menu|balance|wallet|daily|top|price|clan|settings|spin|missions|mystats|withdrawals|deposit|support|card|stats|pending|cancel)(?:@\w+)?(?:\s+(\S+))?/i.exec(u.message.text);
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

    const fromId = String(u.message.from?.id || chat);
    if (!m || m[1].toLowerCase() === "cancel") {
      const st = await getState(fromId);
      if (st && m) { await clearState(fromId); await send(chat, { text: "Cancelled.", kb: [[{ text: "⬅ Menu", callback_data: "m" }]] }); return true; }
      if (st && !m) {
        const txt = String(u.message.text || "").trim();
        await clearState(fromId);
        try {
          if (st.a === "ticket_new") { await createTicket(fromId, u.message.from?.first_name || "User", `Bot: ${txt.slice(0, 40)}`, txt, "bot"); await send(chat, { text: "✅ Ticket opened. We'll reply here and in the app.", kb: [[{ text: "🎫 My tickets", callback_data: "sup" }]] }); }
          else if (st.a === "ticket_reply" && st.id) { await replyTicket(fromId, st.id, txt); await send(chat, { text: "✅ Reply sent.", kb: [[{ text: "🎫 Back to ticket", callback_data: `tk:${st.id}` }]] }); }
        } catch (e: any) { await send(chat, { text: e instanceof HttpError && e.message === "ticket_limit" ? "You already have 3 open tickets. Wait for a reply first." : "Couldn't send that — please write a little more (at least 5 characters) and try /support again.", kb: [[{ text: "🎫 Support", callback_data: "sup" }]] }); }
        return true;
      }
    }
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
    else if (cmd === "spin") await send(chat, await spinBotView(uid, s));
    else if (cmd === "missions") await send(chat, await missionsBotView(uid, s));
    else if (cmd === "mystats") await send(chat, await myStatsView(uid, s));
    else if (cmd === "withdrawals") await send(chat, await withdrawalsView(uid, s));
    else if (cmd === "deposit") await send(chat, depositBotView(s));
    else if (cmd === "support") await send(chat, await supportBotView(uid, s));
    else if (cmd === "card") await sendCard(chat, uid, s, u.message.from?.first_name);
    else if (cmd === "stats") { if (isAdmin(uid)) await send(chat, await adminStatsView(s)); else return false; }
    else if (cmd === "pending") { if (isAdmin(uid)) await send(chat, await adminPendingView(s)); else return false; }
    else if (cmd === "cancel") { /* handled above */ }
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
    else if (d === "sn") view = await spinBotView(uid, s);
    else if (d === "mi") view = await missionsBotView(uid, s);
    else if (d === "mc") view = await missionsBotView(uid, s, true);
    else if (d === "wd") view = await withdrawalsView(uid, s);
    else if (d === "sup") view = await supportBotView(uid, s);
    else if (d.startsWith("tk:")) view = await ticketBotView(uid, s, d.slice(3));
    else if (d === "tkn") { await setState(uid, { a: "ticket_new" }); view = { text: "📝 <b>New ticket</b>\n\nType your problem in the next message (include amounts / TxID if it's about money). Send /cancel to stop.", kb: [[{ text: "✖ Cancel", callback_data: "sup" }]] }; }
    else if (d.startsWith("tkr:")) { await setState(uid, { a: "ticket_reply", id: d.slice(4) }); view = { text: "✍ <b>Reply</b>\n\nType your reply in the next message. Send /cancel to stop.", kb: [[{ text: "✖ Cancel", callback_data: `tk:${d.slice(4)}` }]] }; }
    else if (d === "dep") view = depositBotView(s);
    else if (d.startsWith("dp:")) {
      const v = depositNetView(s, d.slice(3));
      if (v.qr) await tgCall("sendPhoto", { chat_id: chat, photo: v.qr, caption: "Scan to copy the address" });
      view = v;
    }
    else if (d === "cd") { await tgCall("answerCallbackQuery", { callback_query_id: q.id }); await sendCard(chat, uid, s, q.from?.first_name); return true; }
    else if (d === "ast" && isAdmin(uid)) view = await adminStatsView(s);
    else if (d === "apl" && isAdmin(uid)) view = await adminPendingView(s);
    else if (/^a[pr]2?:/.test(d) && isAdmin(uid)) { const [k, id] = d.split(":"); view = await adminSettle(uid, k, id, s); }
    else if (d.startsWith("wc:")) { const [, yn, id] = d.split(":"); note = await answerConfirm(uid, id || "", yn === "y", s); view = { text: note, kb: [[openBtn(s, "📱 Open app", "go_history")], [{ text: "⬅ Menu", callback_data: "m" }]] }; html = false; note = ""; }
    else if (d.startsWith("xc:")) { try { await cancelHold(uid, d.slice(3)); view = { text: "✅ Transfer cancelled. The money is back in your wallet.", kb: [] }; } catch { view = { text: "This transfer can no longer be cancelled.", kb: [] }; } html = false; }
    else if (d.startsWith("nm:")) { const t = await itWasntMe(uid, d.slice(3)); view = { text: t, kb: [[openBtn(s, "💬 Contact support", "go_support")]] }; html = false; }
    else if (d === "ok") { note = "Thanks for confirming."; view = { text: "✅ Thanks for confirming.", kb: [] }; html = false; }
    else if (d.startsWith("ac:")) {
      try { const r = await claimRetention(uid, "ach", d.slice(3), s); note = `🏅 +${tf(r.reward, s.coins_per_tfuel)} TFUEL claimed!`; } catch { note = "Already claimed or not ready."; }
      view = { text: note || "Done.", kb: [[openBtn(s, "📱 Open app", "go_tasks")]] }; html = false;
    }
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
void esc; void deepLink; void adminIds;
export type { Kb };

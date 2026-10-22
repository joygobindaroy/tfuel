import { db } from "./firebase";
import { tgCall } from "./telegram";
import { getSettings, Settings } from "./settings";
import { getRefCode } from "./refcode";
import { peekPrice, fromU } from "./market";
import { claimJoin } from "./taskclaim";
import { rateLimit } from "./api";
import { HttpError } from "./auth";

type Kb = { text: string; url?: string; callback_data?: string; web_app?: { url: string } }[][];
const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
const tf = (coins: number, cpt: number) => {
  const d = Math.min(6, Math.max(0, Math.round(Math.log10(Math.max(1, cpt)))));
  return (coins / cpt).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};

/** "Open app" বাটন: t.me লিংক থাকলে সেটা (referral param সহ), নইলে সরাসরি web_app */
function openBtn(s: Settings, label: string, param?: string) {
  if (s.referral_link) return { text: label, url: s.referral_link + (param ? `?startapp=${param}` : "") };
  const u = appUrl();
  return u ? { text: label, web_app: { url: u } } : { text: label, callback_data: "m" };
}

export function startView(s: Settings, param?: string): { text: string; kb: Kb } {
  const kb: Kb = [
    [openBtn(s, s.bot_start_label, param)],
    [{ text: "👤 My Profile", callback_data: "p" }, { text: "✅ Tasks", callback_data: "t" }],
    [{ text: "👥 Invite Friends", callback_data: "i" }],
    ...s.bot_buttons.map((b) => [{ text: b.text, url: b.url }]),
  ];
  return { text: s.bot_welcome, kb };
}

async function profileView(uid: string, s: Settings): Promise<{ text: string; kb: Kb }> {
  const u = (await db().ref(`users/${uid}`).get()).val();
  if (!u) return { text: "Open the app once to create your account, then come back here.", kb: [[openBtn(s, s.bot_start_label)], [{ text: "⬅ Back", callback_data: "m" }]] };
  const price = await peekPrice(s).catch(() => null);
  const cpt = s.coins_per_tfuel;
  const code = await getRefCode(uid).catch(() => "");
  const link = s.referral_link && code ? `${s.referral_link}?startapp=${code}` : "";
  const bal = Number(u.balance) || 0;
  const lines = [
    `👤 <b>${esc(u.name || "My profile")}</b>`,
    "",
    `💰 TFUEL: <b>${tf(bal, cpt)}</b>${price ? ` (≈ $${((bal / cpt) * price).toFixed(2)})` : ""}`,
    `💵 USDT: <b>${fromU(u.usdt_u || 0).toFixed(2)}</b>`,
    `👥 Friends invited: <b>${u.ref_count || 0}</b> · earned <b>${tf(u.ref_earned || 0, cpt)}</b> TFUEL`,
  ];
  if (link) lines.push("", "🔗 Your invite link:", `<code>${esc(link)}</code>`);
  const kb: Kb = [[openBtn(s, "📱 Open app")], [{ text: "✅ Tasks", callback_data: "t" }, { text: "👥 Invite", callback_data: "i" }], [{ text: "⬅ Back", callback_data: "m" }]];
  return { text: lines.join("\n"), kb };
}

async function inviteView(uid: string, s: Settings): Promise<{ text: string; kb: Kb }> {
  const code = await getRefCode(uid).catch(() => "");
  const link = s.referral_link && code ? `${s.referral_link}?startapp=${code}` : "";
  if (!link || !s.referral_enabled) return { text: "Invites are not available right now.", kb: [[{ text: "⬅ Back", callback_data: "m" }]] };
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join me on TFUEL — tap, earn and invite friends!")}`;
  return {
    text: `👥 <b>Invite friends</b>\n\nYou get <b>${tf(s.referrer_bonus, s.coins_per_tfuel)} TFUEL</b> for each friend who joins and completes a task, plus <b>${s.referral_commission_pct}%</b> of their earnings — for life.\n\n🔗 <code>${esc(link)}</code>`,
    kb: [[{ text: "📤 Share link", url: share }], [{ text: "⬅ Back", callback_data: "m" }]],
  };
}

async function tasksView(uid: string, s: Settings): Promise<{ text: string; kb: Kb }> {
  const [tSnap, uSnap] = await Promise.all([db().ref("tasks").get(), db().ref(`users/${uid}/completed_tasks`).get()]);
  const done = (uSnap.val() || {}) as Record<string, any>;
  const all = Object.entries((tSnap.val() || {}) as Record<string, any>).filter(([id]) => !done[id]?.claimed);
  const join = all.filter(([, t]) => t.type === "telegram_join").slice(0, 6);
  const rest = all.length - join.length;
  const cpt = s.coins_per_tfuel;
  const kb: Kb = [];
  const lines = ["✅ <b>Tasks</b>", ""];
  if (!all.length) lines.push("You've completed everything for now. New tasks appear here — check back soon!");
  for (const [id, t] of join) {
    lines.push(`• ${esc(t.title)} — <b>+${tf(Number(t.reward) || 0, cpt)} TFUEL</b>`);
    const ch = String(t.channel_id || "");
    const url = t.url || (ch.startsWith("@") ? `https://t.me/${ch.slice(1)}` : "");
    kb.push([...(url ? [{ text: "📢 Join", url }] : []), { text: "✅ Verify", callback_data: `v:${id}` }]);
  }
  if (rest > 0) lines.push("", `…and ${rest} more task${rest > 1 ? "s" : ""} (articles, visits, daily reward) inside the app.`);
  kb.push([openBtn(s, "📱 Open app")], [{ text: "⬅ Back", callback_data: "m" }]);
  return { text: lines.join("\n"), kb };
}

const send = (chat: number | string, v: { text: string; kb: Kb }, html = true) =>
  tgCall("sendMessage", { chat_id: chat, text: v.text, ...(html ? { parse_mode: "HTML" } : {}), disable_web_page_preview: "true", reply_markup: JSON.stringify({ inline_keyboard: v.kb }) });
const edit = (chat: number | string, mid: number, v: { text: string; kb: Kb }, html = true) =>
  tgCall("editMessageText", { chat_id: chat, message_id: mid, text: v.text, ...(html ? { parse_mode: "HTML" } : {}), disable_web_page_preview: "true", reply_markup: JSON.stringify({ inline_keyboard: v.kb }) });

/** message / callback_query — Stars আলাদা (tg-webhook) */
export async function handleBot(u: any): Promise<boolean> {
  const s = await getSettings();
  if (u.message?.text && u.message.chat?.type === "private") {
    const m = /^\/(start|profile|tasks|invite|help|menu)(?:@\w+)?(?:\s+(\S+))?/i.exec(u.message.text);
    if (!m) return false;
    const chat = u.message.chat.id;
    const uid = String(u.message.from?.id || chat);
    const cmd = m[1].toLowerCase();
    if (cmd === "profile") await send(chat, await profileView(uid, s));
    else if (cmd === "tasks") await send(chat, await tasksView(uid, s));
    else if (cmd === "invite") await send(chat, await inviteView(uid, s));
    else {
      const param = m[2] && /^[\w-]{1,64}$/.test(m[2]) ? m[2] : undefined;
      await send(chat, startView(s, param), false);
    }
    return true;
  }
  const q = u.callback_query;
  if (q?.data && q.message) {
    const chat = q.message.chat.id;
    const mid = q.message.message_id;
    const uid = String(q.from?.id);
    try { await rateLimit(uid, "botcb", 30); } catch { await tgCall("answerCallbackQuery", { callback_query_id: q.id, text: "Slow down a little." }); return true; }
    const d = String(q.data);
    let note = "";
    let view: { text: string; kb: Kb } | null = null;
    let html = true;
    if (d === "m") { view = startView(s); html = false; }
    else if (d === "p") view = await profileView(uid, s);
    else if (d === "i") view = await inviteView(uid, s);
    else if (d === "t") view = await tasksView(uid, s);
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
    if (view) await edit(chat, mid, view, html);
    return true;
  }
  return false;
}

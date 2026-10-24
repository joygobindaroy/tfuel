import { pickAd, adImp } from "./ads";
import { db } from "./firebase";
import { getSettings, Settings } from "./settings";
import { getRefCode } from "./refcode";
import { peekPrice, fromU, getChart } from "./market";
import { top, names } from "./leaderboard";
import { clanView } from "./clan";
import { getCfg2 } from "./cfg2";
import { featureOn } from "./features";
import { claimDaily } from "./daily";
import { dayKey } from "./log";
import { weekIndex } from "./wallet";
import { HttpError } from "./auth";

export type Kb = { text: string; url?: string; callback_data?: string; web_app?: { url: string } }[][];
export type View = { text: string; kb: Kb };
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
export const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
export const tf = (coins: number, cpt: number) => {
  const d = Math.min(6, Math.max(0, Math.round(Math.log10(Math.max(1, cpt)))));
  return (coins / cpt).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};
const back: Kb[number] = [{ text: "⬅ Back", callback_data: "m" }];

/** "Open app" button: t.me link (with start param, e.g. go_deposit) if configured, else a web_app button */
export function openBtn(s: Settings, label: string, param?: string) {
  if (s.referral_link) return { text: label, url: s.referral_link + (param ? `?startapp=${param}` : "") };
  const u = appUrl();
  return u ? { text: label, web_app: { url: u } } : { text: label, callback_data: "m" };
}
export const deepLink = (s: Settings, param: string) => (s.referral_link ? `${s.referral_link}?startapp=${param}` : "");

const CB: Record<string, string> = { profile: "p", tasks: "t", invite: "i", daily: "d", spin: "sn", missions: "mi", wallet: "w", leaderboard: "l", price: "x", clan: "c", help: "h", settings: "s" };

/** welcome keyboard from the admin-edited menu (2 per row) */
export async function menuKb(s: Settings, param?: string): Promise<Kb> {
  const c2 = await getCfg2().catch(() => null);
  const clanOn = !!c2 && c2.clan.enabled && featureOn(s, "clans");
  const items = s.bot_menu.filter((m) => m.on && CB[m.k] && (m.k !== "clan" || clanOn) && (m.k !== "daily" || s.daily_enabled) && (m.k !== "spin" || s.spin_enabled) && (m.k !== "missions" || s.dm_enabled) && (m.k !== "invite" || s.referral_enabled));
  const rows: Kb = [[openBtn(s, s.bot_start_label, param)]];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2).map((m) => ({ text: m.text, callback_data: CB[m.k] })));
  try {
    const ad = c2?.adsmkt.enabled ? await pickAd("bot_button") : null;
    if (ad) {
      const base = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/+$/, "");
      rows.push([{ text: `📣 ${ad.title}`.slice(0, 40), url: base ? `${base}/api/ad-click?id=${ad.id}` : ad.url }]);
      void adImp(ad.id);
    }
  } catch {}
  if (s.bot_sponsor_text && s.bot_sponsor_url) rows.push([{ text: `📣 ${s.bot_sponsor_text}`, url: s.bot_sponsor_url }]);
  for (const b of s.bot_buttons) rows.push([{ text: b.text, url: b.url }]);
  return rows;
}

/** /start: new users see the full welcome; returning users a short summary (when enabled). Plain text (no HTML). */
export async function welcomeView(uid: string, s: Settings, firstName?: string, param?: string): Promise<View> {
  const name = String(firstName || "").trim().slice(0, 24) || "Miner";
  const kb = await menuKb(s, param);
  const u = (await db().ref(`users/${uid}`).get()).val();
  const returning = !!u && !u.banned && (Number(u.balance) > 0 || !!u.earn || !!u.daily);
  if (returning && s.bot_returning) {
    const price = await peekPrice(s).catch(() => null);
    const bal = Number(u.balance) || 0;
    const ready = s.daily_enabled && u.daily?.day !== dayKey();
    const lines = [
      `👋 Welcome back, ${name}!`,
      "",
      `💰 ${tf(bal, s.coins_per_tfuel)} TFUEL${price ? ` (≈ $${((bal / s.coins_per_tfuel) * price).toFixed(2)})` : ""}`,
      `🔥 Streak: ${u.daily?.streak || 0} day${(u.daily?.streak || 0) === 1 ? "" : "s"}${s.daily_enabled ? ` · 🎁 Daily reward: ${ready ? "ready to claim!" : "claimed"}` : ""}`,
      `👥 Friends invited: ${u.ref_count || 0}`,
      "",
      "Tap ⛏ Start Mining to keep earning.",
    ];
    return { text: lines.join("\n"), kb };
  }
  const text = s.bot_welcome.replace(/\{name\}/gi, name).replace(/\bHey Miner\b/g, `Hey ${name}`);
  return { text, kb };
}

export async function profileView(uid: string, s: Settings): Promise<View> {
  const u = (await db().ref(`users/${uid}`).get()).val();
  if (!u) return { text: "Open the app once to create your account, then come back here.", kb: [[openBtn(s, s.bot_start_label)], back] };
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
  return { text: lines.join("\n"), kb: [[openBtn(s, "📱 Open app")], [{ text: "✅ Tasks", callback_data: "t" }, { text: "👥 Invite", callback_data: "i" }], back] };
}

export async function inviteView(uid: string, s: Settings): Promise<View> {
  const code = await getRefCode(uid).catch(() => "");
  const link = s.referral_link && code ? `${s.referral_link}?startapp=${code}` : "";
  if (!link || !s.referral_enabled) return { text: "Invites are not available right now.", kb: [back] };
  const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(s.invite_msg || "Join me on TFUEL — tap, earn and invite friends!")}`;
  return {
    text: `👥 <b>Invite friends</b>\n\nYou get <b>${tf(s.referrer_bonus, s.coins_per_tfuel)} TFUEL</b> for each friend who joins and completes a task, plus <b>${s.referral_commission_pct}%</b> of their earnings — for life.\n\n🔗 <code>${esc(link)}</code>`,
    kb: [[{ text: "📤 Share link", url: share }, { text: "🖼 Share card", callback_data: "cd" }], back],
  };
}

export async function tasksView(uid: string, s: Settings): Promise<View> {
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
    lines.push(`• ${esc(t.title)}${t.sponsor ? ` ⭐ <i>${esc(t.sponsor)}</i>` : ""} — <b>+${tf(Number(t.reward) || 0, cpt)} TFUEL</b>`);
    const ch = String(t.channel_id || "");
    const url = t.url || (ch.startsWith("@") ? `https://t.me/${ch.slice(1)}` : "");
    kb.push([...(url ? [{ text: "📢 Join", url }] : []), { text: "✅ Verify", callback_data: `v:${id}` }]);
  }
  if (rest > 0) lines.push("", `…and ${rest} more task${rest > 1 ? "s" : ""} (articles, visits, daily reward) inside the app.`);
  kb.push([openBtn(s, "📱 Open app", "go_tasks")], back);
  return { text: lines.join("\n"), kb };
}

/** 🎁 claim today's reward right in the bot */
export async function dailyView(uid: string, s: Settings): Promise<View> {
  if (!s.daily_enabled) return { text: "🎁 Daily rewards are turned off right now.", kb: [back] };
  const exists = (await db().ref(`users/${uid}/balance`).get()).val() !== null;
  if (!exists) return { text: "Open the app once to create your account, then claim your daily reward here.", kb: [[openBtn(s, s.bot_start_label)], back] };
  const cpt = s.coins_per_tfuel;
  try {
    const r = await claimDaily(uid, s);
    const nextR = s.daily_rewards[r.streak % s.daily_rewards.length] || 0;
    return { text: `🎁 <b>Daily reward claimed!</b>\n\n+<b>${tf(r.reward, cpt)} TFUEL</b>\n🔥 Streak: <b>${r.streak}</b> day${r.streak === 1 ? "" : "s"}${r.saved ? ` (a streak freeze saved ${r.saved} missed day${r.saved > 1 ? "s" : ""})` : ""}\n\nTomorrow: +${tf(nextR, cpt)} TFUEL — come back to keep the streak!`, kb: [[openBtn(s, "📱 Open app")], back] };
  } catch (e: any) {
    if (e instanceof HttpError && e.message === "already_claimed_today") {
      const u = (await db().ref(`users/${uid}/daily`).get()).val() || {};
      const nextR = s.daily_rewards[(u.streak || 0) % s.daily_rewards.length] || 0;
      return { text: `🎁 You already claimed today's reward.\n\n🔥 Streak: <b>${u.streak || 1}</b> day(s)\nTomorrow: +${tf(nextR, cpt)} TFUEL`, kb: [[openBtn(s, "📱 Open app")], back] };
    }
    return { text: "Couldn't claim the reward right now. Please try again in the app.", kb: [[openBtn(s, "📱 Open app")], back] };
  }
}

export async function walletView(uid: string, s: Settings): Promise<View> {
  const u = (await db().ref(`users/${uid}`).get()).val();
  if (!u) return { text: "Open the app once to create your account, then come back here.", kb: [[openBtn(s, s.bot_start_label)], back] };
  const price = await peekPrice(s).catch(() => null);
  const cpt = s.coins_per_tfuel;
  const bal = Number(u.balance) || 0;
  const usdt = fromU(u.usdt_u || 0);
  const tfUsd = price ? (bal / cpt) * price : 0;
  const lines = [
    "💰 <b>Wallet</b>", "",
    `TFUEL: <b>${tf(bal, cpt)}</b>${price ? ` (≈ $${tfUsd.toFixed(2)})` : ""}`,
    `USDT: <b>${usdt.toFixed(2)}</b>`,
    ...(price ? ["", `Total ≈ <b>$${(tfUsd + usdt).toFixed(2)}</b>`] : []),
  ];
  return { text: lines.join("\n"), kb: [[openBtn(s, "⬇ Deposit", "go_deposit"), openBtn(s, "⬆ Withdraw", "go_withdraw")], [{ text: "📥 Address & QR", callback_data: "dep" }, { text: "⬆ My withdrawals", callback_data: "wd" }], [openBtn(s, "📈 Trade", "go_trade"), openBtn(s, "🧾 History", "go_history")], back] };
}

type Board = "d" | "w" | "a";
export async function boardText(uid: string | null, s: Settings, b: Board = "d"): Promise<string> {
  const key = b === "a" ? "all" : b === "w" ? `w_${weekIndex()}` : `d_${dayKey()}`;
  const t = (await top(key, 10)).filter((x) => x.v > 0);
  const nm = await names(t.map((x) => x.id));
  const medal = ["🥇", "🥈", "🥉"];
  const lines = [`🏆 <b>Leaderboard — ${b === "a" ? "all time" : b === "w" ? "this week" : "today"}</b>`, ""];
  if (!t.length) lines.push("No earnings yet — be the first!");
  t.forEach((x, i) => lines.push(`${medal[i] || `${i + 1}.`} ${esc(nm[x.id])}${x.id === uid ? " (you)" : ""} — <b>${tf(x.v, s.coins_per_tfuel)}</b>`));
  if (uid && !t.some((x) => x.id === uid)) {
    const mine = Number((await db().ref(`lb/${key}/${uid}`).get()).val()) || 0;
    if (mine > 0) lines.push("", `You: <b>${tf(mine, s.coins_per_tfuel)}</b> TFUEL`);
  }
  return lines.join("\n");
}
export async function leaderboardView(uid: string, s: Settings, b: Board = "d"): Promise<View> {
  if (!s.lb_enabled) return { text: "🏆 The leaderboard is off right now.", kb: [back] };
  const tab = (k: Board, l: string) => ({ text: (b === k ? "• " : "") + l, callback_data: `l:${k}` });
  return { text: await boardText(uid, s, b), kb: [[tab("d", "Today"), tab("w", "Week"), tab("a", "All time")], [openBtn(s, "📱 Open app")], back] };
}

export async function priceText(s: Settings): Promise<string> {
  const price = await peekPrice(s).catch(() => null);
  if (!price) return "📈 The TFUEL price isn't available right now. Try again in a minute.";
  const ch = await getChart("1d").then((c) => c.change).catch(() => null);
  const arrow = ch === null ? "" : ch >= 0 ? "🟢 ▲" : "🔴 ▼";
  return `📈 <b>TFUEL price</b>\n\n<b>$${price < 1 ? price.toFixed(5) : price.toFixed(3)}</b> USDT${ch === null ? "" : `\n24h: ${arrow} ${Math.abs(ch).toFixed(2)}%`}`;
}
export async function priceView(s: Settings): Promise<View> {
  return { text: await priceText(s), kb: [[{ text: "🔄 Refresh", callback_data: "x" }, openBtn(s, "📈 Trade", "go_trade")], back] };
}

const bar = (pct: number) => { const n = Math.round(Math.max(0, Math.min(100, pct)) / 10); return "█".repeat(n) + "░".repeat(10 - n); };
export async function clanBotView(uid: string, s: Settings): Promise<View> {
  const c2 = await getCfg2();
  if (!c2.clan.enabled || !featureOn(s, "clans")) return { text: "🛡 Clans are not available right now.", kb: [back] };
  const v = await clanView(uid);
  const m = v.mine;
  if (!m) return { text: "🛡 <b>Clans</b>\n\nYou're not in a clan yet. Join or create one in the app, earn together and beat the weekly raid boss!", kb: [[openBtn(s, "🛡 Open Clans", "go_clan")], back] };
  const lines = [`🛡 <b>${esc(m.name)}</b> [${esc(m.tag)}]`, "", `👥 Members: <b>${m.members}</b>`, `⭐ Weekly score: <b>${tf(m.score, s.coins_per_tfuel)}</b>${m.rank ? ` · rank #${m.rank}` : ""}`, `💪 Your share: <b>${tf(m.myContribution, s.coins_per_tfuel)}</b>`];
  if (m.boss) lines.push("", `${m.boss.emoji} <b>${esc(m.boss.name)}</b>`, `${bar(m.boss.pct)} ${m.boss.pct}%`, m.boss.defeated ? `✅ Defeated! ${m.myContribution > 0 && !m.bossClaimed ? "Claim your reward in the app." : ""}` : `HP ${tf(m.boss.hp - m.boss.damage, s.coins_per_tfuel)} left`);
  return { text: lines.join("\n"), kb: [[openBtn(s, "🛡 Open Clan", "go_clan")], back] };
}

export function helpView(s: Settings): View {
  const kb: Kb = s.faq.slice(0, 8).map((f, i) => [{ text: `❓ ${String(f.q).slice(0, 48)}`, callback_data: `q:${i}` }]);
  kb.push([{ text: "🎫 My tickets / new ticket", callback_data: "sup" }], back);
  return { text: `❓ <b>Help</b>\n\nPick a question, or just type yours here and I'll try to answer. If I can't, open a support ticket.`, kb };
}
export function faqAnswerView(s: Settings, i: number): View {
  const f = s.faq[i];
  if (!f) return helpView(s);
  return { text: `❓ <b>${esc(f.q)}</b>\n\n${esc(f.a)}`, kb: [[{ text: "⬅ Help", callback_data: "h" }, openBtn(s, "💬 Support", "go_support")]] };
}

/** Settings toggles kept in the bot: bot messages, daily reminder, energy-full, daily summary, new-task alerts */
const TOG: { k: string; text: string }[] = [
  { k: "msg", text: "Bot messages" }, { k: "remind", text: "Daily reward reminder" }, { k: "energy", text: "Energy-full message" },
  { k: "sum", text: "Daily summary" }, { k: "task", text: "New task alerts" },
];
export async function settingsState(uid: string) {
  const [p, off] = await Promise.all([db().ref(`user_prefs/${uid}`).get(), db().ref(`users/${uid}/notify_off`).get()]);
  const v = (p.val() || {}) as any;
  return { msg: !off.val(), remind: !!v.remind_daily, energy: !!v.energy_msg, sum: !!v.sum_daily, task: !!v.task_alert } as Record<string, boolean>;
}
export async function toggleSetting(uid: string, k: string) {
  const st = await settingsState(uid);
  if (!(k in st)) return;
  const on = !st[k];
  const base = `user_prefs/${uid}`;
  const up: Record<string, any> =
    k === "msg" ? { [`users/${uid}/notify_off`]: on ? null : true }
    : k === "remind" ? { [`${base}/remind_daily`]: on, [`remind_users/${uid}`]: on ? true : null }
    : k === "energy" ? { [`${base}/energy_msg`]: on, [`energy_users/${uid}`]: on ? true : null }
    : k === "sum" ? { [`${base}/sum_daily`]: on ? true : null, [`summary_users/${uid}`]: on ? true : null }
    : { [`${base}/task_alert`]: on ? true : null, [`task_users/${uid}`]: on ? true : null };
  await db().ref().update(up);
}
export async function settingsView(uid: string, s: Settings): Promise<View> {
  const st = await settingsState(uid);
  const kb: Kb = TOG.map((t) => [{ text: `${st[t.k] ? "✅" : "⬜"} ${t.text}`, callback_data: `st:${t.k}` }]);
  kb.push([openBtn(s, "⚙️ More settings", "go_settings")], back);
  return { text: "⚙️ <b>Settings</b>\n\nTap to switch on/off. Quiet hours, PIN, email and addresses are in the app.", kb };
}

/** 🧾 withdrawal receipt (from the "paid" message) */
export async function receiptView(uid: string, s: Settings, kind: string, id: string): Promise<View> {
  const r = ((await db().ref(`${kind === "u" ? "usdt_withdrawals" : "withdrawals"}/${id}`).get()).val() || null) as any;
  if (!r || String(r.uid) !== uid) return { text: "Receipt not found.", kb: [back] };
  const addr = String(r.address || r.account || "");
  const masked = addr.length > 14 ? `${addr.slice(0, 6)}…${addr.slice(-6)}` : addr;
  const amount = kind === "u" ? `${r.amount} USDT` : `${tf(Number(r.amount) || 0, s.coins_per_tfuel)} TFUEL`;
  const lines = ["🧾 <b>Withdrawal receipt</b>", "", `Status: <b>${esc(r.status)}</b>`, `Amount: <b>${esc(amount)}</b>`, ...(kind === "u" && r.receive ? [`You receive: <b>${esc(r.receive)} USDT</b>`] : []), `To: ${esc(r.network_name || r.method || "")}${masked ? ` · <code>${esc(masked)}</code>` : ""}`, `Requested: ${new Date(r.created_at || 0).toISOString().replace("T", " ").slice(0, 16)} UTC`, ...(r.handled_at ? [`Paid: ${new Date(r.handled_at).toISOString().replace("T", " ").slice(0, 16)} UTC`] : []), `ID: <code>${esc(id)}</code>`];
  return { text: lines.join("\n"), kb: [[openBtn(s, "📱 Open app", "go_history")], back] };
}
void getSettings;

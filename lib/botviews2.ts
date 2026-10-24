import { db } from "./firebase";
import type { Settings } from "./settings";
import { View, Kb, esc, openBtn, tf, appUrl } from "./botviews";
import { dayKey } from "./log";
import { weekIndex } from "./wallet";
import { levelInfo } from "./retention";
import { missionsView, missionsClaim } from "./missions";
import { doSpin, spinLeft } from "./spin";
import { myTickets, getTicket } from "./tickets";
import { getRefCode } from "./refcode";
import { cardUrl } from "./cardsig";
import { settleUsdtWithdrawal } from "./payouts";
import { HttpError } from "./auth";
import { fromU } from "./market";

const back: Kb[number] = [{ text: "⬅ Back", callback_data: "m" }];
const bar = (a: number, b: number) => { const n = Math.round((Math.max(0, Math.min(b, a)) / Math.max(1, b)) * 8); return "▰".repeat(n) + "▱".repeat(8 - n); };
const when = (t: number) => new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC";

export const adminIds = () => (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
export const isAdmin = (uid: string) => adminIds().includes(uid);

// ---------------- my stats ----------------
export async function myStatsView(uid: string, s: Settings): Promise<View> {
  const u = (await db().ref(`users/${uid}`).get()).val();
  if (!u) return { text: "Open the app once to create your account.", kb: [[openBtn(s, s.bot_start_label)], back] };
  const [d, w, a] = await Promise.all([`d_${dayKey()}`, `w_${weekIndex()}`, "all"].map(async (k) => Number((await db().ref(`lb/${k}/${uid}`).get()).val()) || 0));
  const lv = levelInfo(u);
  const lines = [
    `📊 <b>My stats</b>`, "",
    `Today: <b>${tf(d, s.coins_per_tfuel)}</b> TFUEL`, `This week: <b>${tf(w, s.coins_per_tfuel)}</b>`, `All time: <b>${tf(a, s.coins_per_tfuel)}</b>`, "",
    `🏅 Level <b>${lv.level}</b> · ${esc(lv.badge)}  ${bar(lv.pct, 100)} ${lv.pct}%`,
    `🔥 Streak: <b>${u.daily?.streak || 0}</b> day(s)`, `👥 Friends: <b>${u.ref_count || 0}</b>`,
  ];
  return { text: lines.join("\n"), kb: [[openBtn(s, "📱 Open app")], back] };
}

// ---------------- missions ----------------
export async function missionsBotView(uid: string, s: Settings, claim = false): Promise<View> {
  let note = "";
  if (claim) { try { const c = await missionsClaim(uid, s); note = `\n\n🎉 Bonus claimed: +<b>${tf(c, s.coins_per_tfuel)} TFUEL</b>`; } catch (e: any) { note = e instanceof HttpError ? "\n\nNot ready yet — finish all missions first." : ""; } }
  const v: any = await missionsView(uid, s);
  if (!v.enabled) return { text: "🎯 Daily missions are off right now.", kb: [back] };
  const lines = ["🎯 <b>Today's missions</b>", "", ...v.items.map((m: any) => `${m.done ? "✅" : "⬜"} ${esc(m.title)} — ${m.have}/${m.goal}`)];
  if (v.bonus > 0) lines.push("", `Finish all 3 for <b>+${tf(v.bonus, s.coins_per_tfuel)} TFUEL</b>${v.claimed ? " — claimed ✔" : ""}`);
  const kb: Kb = [];
  if (v.all && !v.claimed && v.bonus > 0) kb.push([{ text: "🎁 Claim bonus", callback_data: "mc" }]);
  kb.push([openBtn(s, "📱 Open app", "go_tasks")], back);
  return { text: lines.join("\n") + note, kb };
}

// ---------------- spin ----------------
export async function spinBotView(uid: string, s: Settings): Promise<View> {
  if (!s.spin_enabled) return { text: "🎰 Lucky Spin is off right now.", kb: [back] };
  if ((await db().ref(`users/${uid}/balance`).get()).val() === null) return { text: "Open the app once to create your account.", kb: [[openBtn(s, s.bot_start_label)], back] };
  try {
    const r = await doSpin(uid, s);
    const left = r.free + r.extra;
    return { text: `🎰 <b>Lucky Spin</b>\n\nYou won <b>+${tf(r.coins, s.coins_per_tfuel)} TFUEL</b>! 🎉\n\nSpins left today: <b>${left}</b>`, kb: [...(left > 0 ? [[{ text: "🎰 Spin again", callback_data: "sn" }]] : []), [openBtn(s, "📱 Open app")], back] };
  } catch (e: any) {
    if (e instanceof HttpError && e.message === "no_spins") return { text: "🎰 No spins left today.\n\nCome back tomorrow — or watch an ad in the app for an extra spin.", kb: [[openBtn(s, "📺 Get extra spin", "go_tasks")], back] };
    return { text: "Couldn't spin right now. Try the app.", kb: [[openBtn(s, "📱 Open app")], back] };
  }
}
export { spinLeft };

// ---------------- my withdrawals ----------------
export async function withdrawalsView(uid: string, s: Settings): Promise<View> {
  const [a, b] = await Promise.all([db().ref(`usdt_withdrawals`).orderByChild("uid").equalTo(uid).limitToLast(8).get().then((x) => x.val()).catch(async () => Object.fromEntries(Object.entries(((await db().ref("usdt_withdrawals").get()).val() || {}) as Record<string, any>).filter(([, w]) => String(w.uid) === uid))), db().ref(`withdrawals`).orderByChild("uid").equalTo(uid).limitToLast(8).get().then((x) => x.val()).catch(async () => Object.fromEntries(Object.entries(((await db().ref("withdrawals").get()).val() || {}) as Record<string, any>).filter(([, w]) => String(w.uid) === uid)))]);
  const rows = [
    ...Object.entries((a || {}) as Record<string, any>).map(([id, w]) => ({ k: "u", id, w })),
    ...Object.entries((b || {}) as Record<string, any>).map(([id, w]) => ({ k: "t", id, w })),
  ].sort((x, y) => (y.w.created_at || 0) - (x.w.created_at || 0)).slice(0, 5);
  if (!rows.length) return { text: "⬆ <b>My withdrawals</b>\n\nNo withdrawals yet.", kb: [[openBtn(s, "⬆ Withdraw", "go_withdraw")], back] };
  const kb: Kb = [];
  const lines = ["⬆ <b>My withdrawals</b>", ""];
  for (const { k, id, w } of rows) {
    const amt = k === "u" ? `${w.amount} USDT` : `${tf(Number(w.amount) || 0, s.coins_per_tfuel)} TFUEL`;
    const st = w.status === "paid" ? "✅ Paid" : w.status === "rejected" ? "↩️ Refunded" : w.hold ? "🟡 In review (extra check)" : "🟡 In review";
    lines.push(`• <b>${esc(amt)}</b> · ${esc(w.network_name || w.method || "")}\n   ${st} · ${when(w.created_at || 0)}\n   Requested ▸ ${w.status === "pending" ? "In review ▸ —" : "In review ▸ " + (w.status === "paid" ? "Paid" : "Refunded")}`);
    if (w.status === "paid") kb.push([{ text: `🧾 Receipt · ${amt}`, callback_data: `r:${k}:${id}` }]);
  }
  kb.push([openBtn(s, "📱 Open app", "go_history")], back);
  return { text: lines.join("\n"), kb };
}

// ---------------- support tickets ----------------
export async function supportBotView(uid: string, s: Settings): Promise<View> {
  const list = await myTickets(uid);
  const kb: Kb = list.map((t: any) => [{ text: `${t.status === "closed" ? "⚪" : t.status === "answered" ? "💬" : "🟡"} ${String(t.subject).slice(0, 40)}`, callback_data: `tk:${t.id}` }]);
  kb.push([{ text: "📝 New ticket", callback_data: "tkn" }], [{ text: "❓ Help", callback_data: "h" }], back);
  void s;
  return { text: `🎫 <b>Support</b>\n\n${list.length ? "Your latest tickets (💬 = we replied):" : "You have no tickets yet."}`, kb };
}
export async function ticketBotView(uid: string, s: Settings, id: string): Promise<View> {
  const t = await getTicket(uid, id);
  if (!t) return supportBotView(uid, s);
  const last = t.msgs.slice(-4).map((m) => `${m.f === "admin" ? "🛟 <b>Support</b>" : "🙋 <b>You</b>"}: ${esc(m.t).slice(0, 400)}`);
  const kb: Kb = [];
  if (t.status !== "closed") kb.push([{ text: "✍ Reply", callback_data: `tkr:${id}` }]);
  kb.push([{ text: "⬅ My tickets", callback_data: "sup" }]);
  return { text: `🎫 <b>${esc(t.subject)}</b> · ${esc(t.status)}\n\n${last.join("\n\n")}`, kb };
}

// ---------------- deposit (address + QR) ----------------
export function depositBotView(s: Settings): View {
  const nets = s.deposit_networks || [];
  if (!nets.length) return { text: "⬇ Deposits by crypto aren't available right now.", kb: [[openBtn(s, "📱 Open app", "go_deposit")], back] };
  const kb: Kb = nets.slice(0, 8).map((n) => [{ text: `${n.name} · min ${n.min} USDT`, callback_data: `dp:${n.id}` }]);
  kb.push([openBtn(s, "⬇ Deposit in app", "go_deposit")], back);
  return { text: "⬇ <b>Deposit USDT</b>\n\nPick a network. Send <b>only USDT</b> on the network you choose.", kb };
}
export function depositNetView(s: Settings, id: string): View & { qr?: string } {
  const n = (s.deposit_networks || []).find((x) => x.id === id);
  if (!n) return depositBotView(s);
  const base = appUrl();
  return {
    text: `⬇ <b>Deposit USDT — ${esc(n.name)}</b>\n\nAddress:\n<code>${esc(n.address)}</code>\n\nMinimum: <b>${n.min} USDT</b>${n.note ? `\n${esc(n.note)}` : ""}\n\n⚠ Send only USDT on <b>${esc(n.name)}</b>. Other coins or networks can't be recovered.\n\nTo be credited automatically, start the deposit in the app first (exact amount), then send.`,
    kb: [[openBtn(s, "✅ I'll send from the app", "go_deposit")], [{ text: "⬅ Networks", callback_data: "dep" }]],
    qr: base ? `${base}/api/qr?d=${encodeURIComponent(n.address)}` : undefined,
  };
}

// ---------------- share card ----------------
export async function cardInfo(uid: string, s: Settings, name: string): Promise<{ url: string; caption: string; link: string } | null> {
  const base = appUrl();
  const code = await getRefCode(uid).catch(() => "");
  if (!base || !code || !s.referral_link || !s.referral_enabled) return null;
  const nm = String(name || "").replace(/[<>]/g, "").trim().slice(0, 20) || "a friend";
  const link = `${s.referral_link}?startapp=${code}`;
  return { url: cardUrl(base, code, nm), caption: `${s.invite_msg || "Join me on TFUEL — tap, earn and invite friends!"}\n\n👉 ${link}`, link };
}

// ---------------- admin ----------------
async function pendingOf(path: string, st = "pending"): Promise<[string, any][]> {
  try { return Object.entries(((await db().ref(path).orderByChild("status").equalTo(st).limitToFirst(200).get()).val() || {}) as Record<string, any>); }
  catch { return Object.entries(((await db().ref(path).get()).val() || {}) as Record<string, any>).filter(([, w]) => w.status === st).slice(0, 200); }
}
export async function adminStatsView(s: Settings): Promise<View> {
  const day = dayKey();
  const [dau, nu, total, uw, tw, dep, tk] = await Promise.all([
    db().ref(`stats/dau/${day}`).get(), db().ref(`stats/new_users/${day}`).get(), db().ref("stats/users_total").get(),
    pendingOf("usdt_withdrawals"), pendingOf("withdrawals"), pendingOf("deposits"), pendingOf("tickets", "open"),
  ]);
  const hold = uw.filter(([, w]) => w.hold).length;
  const sum = uw.reduce((a, [, w]) => a + (Number(w.amount) || 0), 0);
  const lines = [
    "🛠 <b>Admin stats</b>", "",
    `Users: <b>${Number(total.val()) || 0}</b> · today new <b>${Number(nu.val()) || 0}</b> · active <b>${Number(dau.val()) || 0}</b>`, "",
    `⬆ Pending USDT withdrawals: <b>${uw.length}</b> (${sum.toFixed(2)} USDT${hold ? `, ${hold} on HOLD` : ""})`,
    `⬆ Pending TFUEL withdrawals: <b>${tw.length}</b>`, `⬇ Pending deposits: <b>${dep.length}</b>`, `🎫 Open tickets: <b>${tk.length}</b>`,
  ];
  return { text: lines.join("\n"), kb: [[{ text: "📋 Pending withdrawals", callback_data: "apl" }, { text: "🔄 Refresh", callback_data: "ast" }], [openBtn(s, "📱 Open app")]] };
}
export async function adminPendingView(s: Settings): Promise<View> {
  const list = (await pendingOf("usdt_withdrawals")).sort(([, a], [, b]) => (a.created_at || 0) - (b.created_at || 0)).slice(0, 5);
  if (!list.length) return { text: "✅ No pending USDT withdrawals.", kb: [[{ text: "⬅ Stats", callback_data: "ast" }]] };
  const kb: Kb = [];
  const lines = ["📋 <b>Pending USDT withdrawals</b> (oldest first)", ""];
  for (const [id, w] of list) {
    const a = String(w.address || "");
    lines.push(`• <b>${w.amount} USDT</b> (send ${w.receive}) · ${esc(w.network_name || "")}\n   ${esc(w.name || "")} (${w.uid}) · ${when(w.created_at || 0)}\n   <code>${esc(a)}</code>${w.hold ? `\n   ⏸ HOLD: ${esc(w.hold)}` : ""}`);
    kb.push(w.hold ? [{ text: `⏸ ${w.amount} USDT — release in admin panel`, callback_data: "apl" }] : [{ text: `✅ Paid ${w.amount}`, callback_data: `ap:${id}` }, { text: `❌ Reject`, callback_data: `ar:${id}` }]);
  }
  kb.push([{ text: "⬅ Stats", callback_data: "ast" }]);
  void s;
  return { text: lines.join("\n\n"), kb };
}
/** two-step: ap/ar show a confirmation, ap2/ar2 do it. "Paid" only marks it — you send the money yourself first. */
export async function adminSettle(uid: string, step: string, id: string, s: Settings): Promise<View> {
  const w = (await db().ref(`usdt_withdrawals/${id}`).get()).val();
  if (!w || w.status !== "pending") return { text: "That withdrawal is no longer pending.", kb: [[{ text: "📋 Pending", callback_data: "apl" }]] };
  const pay = step.startsWith("ap");
  if (step === "ap" || step === "ar") {
    return { text: `${pay ? "✅ Mark as PAID" : "❌ REJECT and refund"}?\n\n${w.amount} USDT · ${esc(w.network_name || "")}\n${esc(w.name || "")} (${w.uid})\n<code>${esc(w.address || "")}</code>\n\n${pay ? "Only press this after you have actually sent the money." : "The user's USDT will be returned."}`, kb: [[{ text: "Yes, confirm", callback_data: `${step}2:${id}` }, { text: "Cancel", callback_data: "apl" }]] };
  }
  try { await settleUsdtWithdrawal(id, pay, pay ? "" : "Rejected by admin (bot)", `bot:${uid}`); }
  catch (e: any) { return { text: `Couldn't do it: ${esc(e?.message || "error")}`, kb: [[{ text: "📋 Pending", callback_data: "apl" }]] }; }
  void s; void fromU;
  return { text: pay ? "✅ Marked as paid. The user was notified." : "↩️ Rejected and refunded. The user was notified.", kb: [[{ text: "📋 Pending", callback_data: "apl" }]] };
}

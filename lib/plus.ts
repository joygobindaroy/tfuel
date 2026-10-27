import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2 } from "./cfg2";
import { sortableId } from "./crypto";
import { dayKey } from "./log";
import { notify } from "./notify";
import { creditCoins } from "./coins";
import { createTicket } from "./tickets";
import { sendAsset, amtStr, Asset } from "./transfer";
import type { Settings } from "./settings";

/* ───────── Scheduled / repeating sends ───────── */
export interface Sched { from: string; from_name: string; to: string; tn: string; tc: string; asset: Asset; amount: number; note: string; next: number; repeat: "" | "weekly" | "monthly"; n: number; fails: number; st: "active" | "done" | "cancelled" | "failed"; at: number }
const nextTime = (t: number, r: string) => { const d = new Date(t); if (r === "weekly") d.setUTCDate(d.getUTCDate() + 7); else d.setUTCMonth(d.getUTCMonth() + 1); return d.getTime(); };

export async function schedCreate(from: { id: string; name: string }, to: { uid: string; name: string; code: string }, asset: Asset, amount: number, note: string, when: number, repeat: string) {
  const c = (await getCfg2()).plus;
  if (!c.sched.enabled) throw new HttpError(403, "feature_off");
  const now = Date.now();
  if (!Number.isFinite(when) || when < now + 5 * 60000 || when > now + 366 * 86400000) throw new HttpError(400, "bad_date");
  const mine = ((await db().ref(`user_sched/${from.id}`).get()).val() || {}) as Record<string, Sched>;
  if (Object.values(mine).filter((x) => x.st === "active").length >= c.sched.max) throw new HttpError(429, "too_many_sched");
  const id = sortableId();
  const rec: Sched = { from: from.id, from_name: from.name, to: to.uid, tn: to.name, tc: to.code, asset, amount, note: note.slice(0, 60), next: when, repeat: repeat === "weekly" || repeat === "monthly" ? repeat : "", n: 0, fails: 0, st: "active", at: now };
  await db().ref().update({ [`user_sched/${from.id}/${id}`]: rec, [`sched_due/${id}`]: { uid: from.id, next: when } });
  return { id, next: when };
}
export async function schedList(uid: string) {
  const m = ((await db().ref(`user_sched/${uid}`).get()).val() || {}) as Record<string, Sched>;
  return Object.entries(m).sort((a, b) => b[1].at - a[1].at).slice(0, 20).map(([id, r]) => ({ id, to: r.tn, code: r.tc, asset: r.asset, amount: r.amount, note: r.note, next: r.next, repeat: r.repeat, n: r.n, st: r.st }));
}
export async function schedCancel(uid: string, id: string) {
  const r = (await db().ref(`user_sched/${uid}/${id}`).get()).val() as Sched | null;
  if (!r) throw new HttpError(404, "not_found");
  await db().ref().update({ [`user_sched/${uid}/${id}/st`]: "cancelled", [`sched_due/${id}`]: null });
}
/** cron: run due scheduled sends (the user agreed with PIN + email code when creating them) */
export async function runScheds(s: Settings): Promise<number> {
  const due = ((await db().ref("sched_due").get()).val() || {}) as Record<string, { uid: string; next: number }>;
  let n = 0;
  for (const [id, d] of Object.entries(due)) {
    if (d.next > Date.now()) continue;
    const ref = db().ref(`user_sched/${d.uid}/${id}`);
    const r = (await ref.get()).val() as Sched | null;
    if (!r || r.st !== "active") { await db().ref(`sched_due/${id}`).remove(); continue; }
    const lock = await db().ref(`sched_due/${id}/lock`).transaction((c: number | null) => (c && Date.now() - c < 600000 ? undefined : Date.now()));
    if (!lock.committed) continue;
    try {
      const out = await sendAsset({ id: r.from, name: r.from_name }, r.to, r.asset, r.amount, s, r.note || "Scheduled");
      n++;
      const nx = r.repeat ? nextTime(r.next, r.repeat) : 0;
      await db().ref().update({ [`user_sched/${d.uid}/${id}/n`]: r.n + 1, [`user_sched/${d.uid}/${id}/fails`]: 0, [`user_sched/${d.uid}/${id}/st`]: nx ? "active" : "done", [`user_sched/${d.uid}/${id}/next`]: nx || r.next, [`sched_due/${id}`]: nx ? { uid: d.uid, next: nx } : null });
      await notify(r.from, `⏰ Scheduled transfer sent: ${amtStr(r.asset, r.amount, s.coins_per_tfuel)} to ${r.tn}.${nx ? ` Next: ${new Date(nx).toISOString().slice(0, 10)}.` : ""}`).catch(() => {});
      void out;
    } catch (e: any) {
      const fails = r.fails + 1;
      const stop = fails >= 2;
      await db().ref().update({ [`user_sched/${d.uid}/${id}/fails`]: fails, [`user_sched/${d.uid}/${id}/st`]: stop ? "failed" : "active", [`sched_due/${id}`]: stop ? null : { uid: d.uid, next: Date.now() + 86400000 } });
      await notify(r.from, `⚠️ Scheduled transfer of ${amtStr(r.asset, r.amount, s.coins_per_tfuel)} to ${r.tn} could not be sent (${String(e?.message || "error").slice(0, 60)}).${stop ? " It was stopped." : " We will try once more tomorrow."}`).catch(() => {});
    }
  }
  return n;
}

/* ───────── Large-send alert (bot message with "It wasn't me") ───────── */
export async function bigSendAlert(fromId: string, toName: string, asset: Asset, amount: number, cpt: number) {
  try {
    const c = (await getCfg2()).plus.alert;
    const lim = asset === "usdt" ? c.usdt * 1e6 : c.tfuel;
    if (!(lim > 0) || amount < lim) return;
    await notify(fromId, `🚨 Large transfer: ${amtStr(asset, amount, cpt)} sent to ${toName}. If this was not you, tap the button now.`, true, [[{ text: "🚫 It wasn't me", callback_data: "nm:send" }]]);
  } catch {}
}

/* ───────── Spend report ───────── */
export async function spendReport(uid: string, offset: number, cpt: number) {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - Math.max(0, Math.min(11, offset)));
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const a = Date.UTC(y, m, 1), b = Date.UTC(y, m + 1, 1);
  const rows = Object.values(((await db().ref(`user_xfers/${uid}`).get()).val() || {}) as Record<string, any>).filter((r: any) => r.at >= a && r.at < b && r.st !== "cancelled");
  const z = () => ({ sent: 0, recv: 0, fee: 0, n: 0 });
  const t = { tfuel: z(), usdt: z() };
  const peers: Record<string, { name: string; v: number }> = {};
  for (const r of rows as any[]) {
    const k = r.a === "usdt" ? t.usdt : t.tfuel;
    k.n++;
    if (r.d === "out") { k.sent += r.amt; k.fee += r.fee || 0; } else k.recv += r.amt;
    const u = r.a === "usdt" ? r.amt / 1e6 * 1000 : r.amt; // rough common unit for ranking
    const p = (peers[r.pc || r.peer] = peers[r.pc || r.peer] || { name: r.peer, v: 0 }); p.v += u;
  }
  const top = Object.values(peers).sort((x, y) => y.v - x.v).slice(0, 3).map((p) => p.name);
  return { month: `${y}-${String(m + 1).padStart(2, "0")}`, tfuel: { sent: t.tfuel.sent / cpt, recv: t.tfuel.recv / cpt, fee: t.tfuel.fee / cpt, n: t.tfuel.n }, usdt: { sent: t.usdt.sent / 1e6, recv: t.usdt.recv / 1e6, fee: t.usdt.fee / 1e6, n: t.usdt.n }, top };
}

/* ───────── Recent people, dispute ───────── */
export async function recentPeople(uid: string) {
  const m = ((await db().ref(`user_xfers/${uid}`).get()).val() || {}) as Record<string, any>;
  const seen = new Set<string>();
  const out: { code: string; name: string }[] = [];
  for (const r of Object.values(m).sort((x: any, y: any) => y.at - x.at) as any[]) {
    if (r.d !== "out" || !r.pc || seen.has(r.pc)) continue;
    seen.add(r.pc); out.push({ code: r.pc, name: r.peer });
    if (out.length >= 6) break;
  }
  return out;
}
export async function disputeTransfer(uid: string, name: string, xid: string, reason: string) {
  const r = (await db().ref(`user_xfers/${uid}/${xid}`).get()).val() as any;
  if (!r) throw new HttpError(404, "not_found");
  if (r.dispute) throw new HttpError(409, "dispute_exists");
  const why = String(reason || "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 300) || "Something is wrong with this transfer";
  const id = await createTicket(uid, name, `Transfer problem · ${String(r.tx || xid).slice(0, 12)}`, `${why}\n\nDirection: ${r.d === "in" ? "received" : "sent"}\nAmount: ${r.a === "usdt" ? r.amt / 1e6 + " USDT" : r.amt + " coins"}\nPerson: ${r.peer} (${r.pc})\nStatus: ${r.st}\nHash: ${r.tx}`, "dispute");
  await db().ref(`user_xfers/${uid}/${xid}/dispute`).set(id);
  return id;
}

/* ───────── Daily numbers for the admin digest ───────── */
export async function xferStat(asset: Asset, amount: number, fee: number) {
  const k = `stats/xfer_day/${dayKey()}`;
  await db().ref().update({ [`${k}/n`]: ServerValue.increment(1), [`${k}/${asset === "usdt" ? "vol_u" : "vol_t"}`]: ServerValue.increment(amount), [`${k}/${asset === "usdt" ? "fee_u" : "fee_t"}`]: ServerValue.increment(fee) }).catch(() => {});
}

/* ───────── VIP free trial ───────── */
export async function vipTrial(uid: string) {
  const c = await getCfg2();
  if (!c.vip.enabled || !(c.plus.trial_days > 0)) throw new HttpError(403, "feature_off");
  const t = await db().ref(`vip/${uid}/trial`).transaction((x: number | null) => (x ? undefined : Date.now()));
  if (!t.committed) throw new HttpError(409, "trial_used");
  const cur = Number((await db().ref(`vip/${uid}/until`).get()).val()) || 0;
  const until = Math.max(Date.now(), cur) + c.plus.trial_days * 86400000;
  await db().ref(`vip/${uid}/until`).set(until);
  await notify(uid, `${c.vip.badge} Your free VIP trial is active for ${c.plus.trial_days} days. Enjoy!`).catch(() => {});
  return { until };
}

/* ───────── Mini-game daily quest + streak ───────── */
export async function questTick(uid: string): Promise<{ done: boolean; streak: number; bonus: number } | null> {
  const c = (await getCfg2()).plus.quest;
  if (!c.enabled) return null;
  const day = dayKey();
  await db().ref(`mini_q/${uid}/${day}`).transaction((x: number | null) => (x || 0) + 1);
  const played = Number((await db().ref(`mini_q/${uid}/${day}`).get()).val()) || 0;
  if (played < c.plays) return { done: false, streak: 0, bonus: 0 };
  const claim = await db().ref(`mini_q_paid/${uid}/${day}`).transaction((x: boolean | null) => (x ? undefined : true));
  if (!claim.committed) return { done: true, streak: 0, bonus: 0 };
  let bonus = 0;
  if (c.bonus > 0) { await creditCoins(uid, c.bonus, "tasks", "game", "Mini-game quest"); bonus += c.bonus; }
  const st = ((await db().ref(`mini_streak/${uid}`).get()).val() || {}) as { day?: string; n?: number };
  const y = dayKey(Date.now() - 86400000);
  const n = st.day === y ? (st.n || 0) + 1 : st.day === day ? st.n || 1 : 1;
  await db().ref(`mini_streak/${uid}`).set({ day, n });
  if (c.streak_bonus > 0 && n > 0 && n % c.streak_days === 0) { await creditCoins(uid, c.streak_bonus, "tasks", "game", `Quest streak ${n} days`); bonus += c.streak_bonus; await notify(uid, `🔥 ${n}-day quest streak! +${c.streak_bonus} coins.`).catch(() => {}); }
  return { done: true, streak: n, bonus };
}
export async function questView(uid: string) {
  const c = (await getCfg2()).plus.quest;
  if (!c.enabled) return null;
  const played = Number((await db().ref(`mini_q/${uid}/${dayKey()}`).get()).val()) || 0;
  const st = ((await db().ref(`mini_streak/${uid}`).get()).val() || {}) as { day?: string; n?: number };
  const alive = st.day === dayKey() || st.day === dayKey(Date.now() - 86400000);
  return { plays: c.plays, played: Math.min(played, c.plays), bonus: c.bonus, streak: alive ? st.n || 0 : 0, streak_days: c.streak_days, streak_bonus: c.streak_bonus };
}

/* ───────── Gentle reminders (cron) ───────── */
export async function runNudges(): Promise<number> {
  const c = await getCfg2();
  if (!c.plus.nudges) return 0;
  const now = Date.now();
  let n = 0;
  try {
    const reqs = ((await db().ref("pay_requests").get()).val() || {}) as Record<string, any>;
    for (const [id, r] of Object.entries(reqs)) {
      if (r.st !== "open" || r.exp < now || now - r.at < 86400000 || r.reminded) continue;
      const claim = await db().ref(`pay_requests/${id}/reminded`).transaction((x: boolean | null) => (x ? undefined : true));
      if (!claim.committed) continue;
      await notify(r.to, `⏰ Your payment request of ${amtStr(r.asset, r.amount, (await import("./settings").then((m) => m.getSettings())).coins_per_tfuel)} is still unpaid. Share the link again from Send → Request.`).catch(() => {});
      n++;
    }
    const links = ((await db().ref("claim_links").get()).val() || {}) as Record<string, any>;
    for (const [id, r] of Object.entries(links)) {
      if (r.st !== "open" || r.exp < now || now - r.at < 86400000 || r.reminded) continue;
      const claim = await db().ref(`claim_links/${id}/reminded`).transaction((x: boolean | null) => (x ? undefined : true));
      if (!claim.committed) continue;
      await notify(r.from, `⏰ Your money link of ${amtStr(r.asset, r.amount, (await import("./settings").then((m) => m.getSettings())).coins_per_tfuel)} has not been opened yet. It returns to you automatically when it expires, or cancel it any time in Send → History.`).catch(() => {});
      n++;
    }
  } catch (e) { console.error("nudges", e); }
  return n;
}
/** cron: on the 1st–3rd of a month send everyone who moved money last month a link to their statement (once) */
export async function sendStatements(): Promise<number> {
  const c = await getCfg2();
  if (!c.plus.nudges) return 0;
  const d = new Date();
  if (d.getUTCDate() > 3) return 0;
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const month = `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, "0")}`;
  const g = await db().ref("stats/stmt_sent").transaction((x: string | null) => (x === month ? undefined : month));
  if (!g.committed) return 0;
  const a = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), 1), b = Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 1);
  const all = ((await db().ref("user_xfers").get()).val() || {}) as Record<string, Record<string, any>>;
  const { stmtUrl } = await import("./receipt");
  let n = 0;
  for (const [uid, rows] of Object.entries(all)) {
    if (!Object.values(rows).some((r: any) => r.at >= a && r.at < b && r.st !== "cancelled")) continue;
    await notify(uid, `📄 Your ${month} transfer statement is ready.`, false, [[{ text: "📄 Open / print statement", url: stmtUrl(uid, month) }]]).catch(() => {});
    n++;
  }
  return n;
}

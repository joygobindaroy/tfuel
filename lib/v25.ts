import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2 } from "./cfg2";
import { activity } from "./wallet";
import { notify } from "./notify";
import { getSettings } from "./settings";
import { dayKey } from "./log";
import { earnUrl } from "./cardsig";
import { cardStyleOf } from "./styles";
import { displayName } from "./transfer";
import { alertTargets } from "./adminalert";
import { tgCall } from "./telegram";

const val = async (p: string) => (await db().ref(p).get()).val();
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);
const base = () => (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const credit = async (uid: string, coins: number, note: string) => {
  await db().ref().update({ [`users/${uid}/balance`]: ServerValue.increment(coins), [`users/${uid}/earn/prize`]: ServerValue.increment(coins) });
  await activity(uid, "prize", { coins, note });
};

/* ── daily combo: daily reward + lucky spin + one mini game, all today ── */
export async function comboView(uid: string) {
  const c = (await getCfg2()).v25.combo;
  if (!c.on) return null;
  const day = dayKey();
  const [d, sp, mini, got] = await Promise.all([val(`daily_day/${day}/${uid}`), val(`users/${uid}/spin`), val(`mini_day/${uid}/${day}`), val(`combo_day/${day}/${uid}`)]);
  const steps = [{ k: "daily", t: "Daily reward", done: d !== null }, { k: "spin", t: "Lucky spin", done: !!sp && sp.day === day && Number(sp.used) > 0 }, { k: "game", t: "A mini game", done: !!mini && Object.keys(mini).length > 0 }];
  return { bonus: c.bonus, steps, ready: steps.every((s) => s.done), claimed: !!got };
}
export async function comboClaim(uid: string) {
  const v = await comboView(uid);
  if (!v) throw new HttpError(403, "feature_off:Daily combo is turned off.");
  if (!v.ready) throw new HttpError(409, "Finish all three first.");
  const r = await db().ref(`combo_day/${dayKey()}/${uid}`).transaction((x: number | null) => (x ? undefined : Date.now()));
  if (!r.committed) throw new HttpError(409, "You already claimed today's combo.");
  if (v.bonus > 0) await credit(uid, v.bonus, "Daily combo");
  return v.bonus;
}

/* ── birthday gift (date can be set once) ── */
export async function bdayGet(uid: string) { return String((await val(`user_prefs/${uid}/bday`)) || ""); }
export async function bdaySet(uid: string, mmdd: any) {
  const v = String(mmdd || "");
  if (!/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)) throw new HttpError(400, "Pick a valid date.");
  const r = await db().ref(`user_prefs/${uid}/bday`).transaction((c: string | null) => (c ? undefined : v));
  if (!r.committed) throw new HttpError(409, "Your birthday is already saved and can't be changed.");
  await db().ref(`bday_users/${v}/${uid}`).set(1);
  return v;
}
export async function runBirthdays(): Promise<number> {
  const c = (await getCfg2()).v25.birthday;
  if (!c.on || c.bonus <= 0) return 0;
  const now = new Date();
  const key = `${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  const ids = Object.keys(((await val(`bday_users/${key}`)) || {}) as object);
  const s = await getSettings();
  let n = 0;
  for (const uid of ids) {
    const r = await db().ref(`bday_paid/${now.getUTCFullYear()}/${uid}`).transaction((x: number | null) => (x ? undefined : Date.now()));
    if (!r.committed || (await val(`users/${uid}/balance`)) === null) continue;
    await credit(uid, c.bonus, "Birthday gift");
    await notify(uid, `🎂 Happy birthday! +${(c.bonus / Math.max(1, s.coins_per_tfuel)).toLocaleString("en-US")} TFUEL was added to your balance.`).catch(() => {});
    n++;
  }
  return n;
}

/* ── tournament history ── */
export async function tourHistory(uid: string) {
  const all = ((await val("tournaments")) || {}) as Record<string, any>;
  const out: any[] = [];
  for (const [id, t] of Object.entries(all)) {
    if (!(await val(`tour_join/${id}/${uid}`))) continue;
    const sc = ((await val(`tour_score/${id}`)) || {}) as Record<string, any>;
    const ranked = Object.entries(sc).sort((a, b) => b[1].score - a[1].score);
    const pos = ranked.findIndex(([u]) => u === uid);
    out.push({ id, title: t.title, game: t.game, end: t.end, paid: !!t.paid, cancelled: !!t.cancelled, played: pos >= 0, rank: pos >= 0 ? pos + 1 : null, players: ranked.length, prize: t.paid && pos >= 0 ? t.prizes?.[pos] || 0 : 0 });
  }
  return out.sort((a, b) => b.end - a.end).slice(0, 30);
}

/* ── invite milestone card ── */
export async function milestone(uid: string) {
  const n = Object.keys(((await val(`referrals/${uid}`)) || {}) as object).length;
  if (n < 1 || !/^https:\/\//.test(base())) return { n, url: "" };
  const name = await displayName(uid).catch(() => "");
  return { n, url: earnUrl(base(), `${n} friend${n > 1 ? "s" : ""}`, "Invite milestone", name, await cardStyleOf(uid), "I invited") };
}

/* ── custom invite link (approved creators) ── */
export const aliasGet = async (uid: string) => String((await val(`user_prefs/${uid}/alias`)) || "");
export async function aliasSet(uid: string, aliasIn: any) {
  if (!(await val(`users/${uid}/creator`))) throw new HttpError(403, "Only approved creators can choose a custom invite link.");
  const a = String(aliasIn || "").toLowerCase();
  if (!/^[a-z0-9]{3,16}$/.test(a)) throw new HttpError(400, "Use 3–16 letters or digits.");
  const old = await aliasGet(uid);
  const r = await db().ref(`ref_alias/${a}`).transaction((c: string | null) => (c && c !== uid ? undefined : uid));
  if (!r.committed) throw new HttpError(409, "That name is taken. Try another.");
  await db().ref().update({ [`user_prefs/${uid}/alias`]: a, ...(old && old !== a ? { [`ref_alias/${old}`]: null } : {}) });
  return a;
}

/* ── daily limit per contact (checked on every send) ── */
export async function limitsList(uid: string) {
  const ct = ((await val(`contacts/${uid}`)) || {}) as Record<string, any>;
  return Object.entries(ct).slice(0, 100).map(([code, c]) => ({ code, label: String(c.label || c.name || code), tfuel: Number(c.lim) || 0, usdt: Number(c.limu) || 0 }));
}
export async function limitSet(uid: string, code: string, tfuel: any, usdt: any) {
  if (!/^[A-Za-z0-9]{10}$/.test(code) || !(await val(`contacts/${uid}/${code}`))) throw new HttpError(404, "Contact not found.");
  const t = Math.max(0, Math.floor(Number(tfuel) || 0)), u = Math.max(0, Math.round((Number(usdt) || 0) * 1e6));
  await db().ref(`contacts/${uid}/${code}`).update({ lim: t || null, limu: u || null });
}
export async function assertContactLimit(from: string, toCode: string, asset: "tfuel" | "usdt", amount: number) {
  const c = (await val(`contacts/${from}/${toCode}`)) as any;
  const lim = c ? (asset === "usdt" ? Number(c.limu) : Number(c.lim)) || 0 : 0;
  if (!lim) return;
  const since = new Date().setUTCHours(0, 0, 0, 0);
  const rows = Object.values(((await val(`user_xfers/${from}`)) || {}) as Record<string, any>);
  const used = rows.filter((r: any) => r.d === "out" && r.pc === toCode && r.a === asset && r.at >= since && r.st !== "cancelled").reduce((a: number, r: any) => a + (Number(r.amt) || 0), 0);
  if (used + amount > lim) throw new HttpError(403, "contact_limit");
}

/* ── monthly cashback on send fees (cron, 1st–3rd) ── */
export async function runCashback(): Promise<number> {
  const c = (await getCfg2()).v25.cashback;
  const d = new Date();
  if (!c.on || c.pct <= 0 || d.getUTCDate() > 3) return 0;
  const p = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  const month = `${p.getUTCFullYear()}-${String(p.getUTCMonth() + 1).padStart(2, "0")}`;
  const g = await db().ref("stats/cashback_sent").transaction((x: string | null) => (x === month ? undefined : month));
  if (!g.committed) return 0;
  const a = Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), 1), b = Date.UTC(p.getUTCFullYear(), p.getUTCMonth() + 1, 1);
  const all = ((await val("user_xfers")) || {}) as Record<string, Record<string, any>>;
  const s = await getSettings();
  let n = 0;
  for (const [uid, rows] of Object.entries(all)) {
    const fee = Object.values(rows).filter((r: any) => r.d === "out" && r.a === "tfuel" && r.at >= a && r.at < b && (r.st === "done" || r.st === "claimed")).reduce((x: number, r: any) => x + (Number(r.fee) || 0), 0);
    const back = Math.floor((fee * c.pct) / 100);
    if (fee < c.min_fee || back < 1 || (await val(`users/${uid}/balance`)) === null) continue;
    await credit(uid, back, `Cashback on ${month} fees`);
    await notify(uid, `💸 Cashback: ${(back / Math.max(1, s.coins_per_tfuel)).toLocaleString("en-US", { maximumFractionDigits: 4 })} TFUEL back on your ${month} transfer fees.`).catch(() => {});
    n++;
  }
  return n;
}

/* ── public numbers page ── */
export async function pubStats() {
  const c = (await getCfg2()).v25;
  if (!c.stats_public) return null;
  const { series } = await import("./insights");
  const s = await series(30);
  const users = Object.keys(((await val("user_index")) || {}) as object).length;
  return { users, active_today: s[s.length - 1]?.active || 0, joined_30d: s.reduce((a, x) => a + x.joined, 0), paid_out_30d_usdt: Math.round(s.reduce((a, x) => a + x.payoutU, 0) * 100) / 100 };
}

/* ── admin: weekly summary (Monday) ── */
export async function runWeeklyAdmin(): Promise<number> {
  const d = new Date();
  if (d.getUTCDay() !== 1) return 0;
  const key = dayKey();
  const g = await db().ref("stats/weekly_admin").transaction((x: string | null) => (x === key ? undefined : key));
  if (!g.committed) return 0;
  const { series } = await import("./insights");
  const s = (await series(7)).slice(-7);
  const sum = (f: (x: any) => number) => s.reduce((a, x) => a + f(x), 0);
  const text = `📊 Last 7 days\nNew users: ${sum((x) => x.joined)}\nBest day (active): ${Math.max(0, ...s.map((x) => x.active))}\nDeposits: ${Math.round(sum((x) => x.depositU) * 100) / 100} USDT\nPayouts: ${Math.round(sum((x) => x.payoutU) * 100) / 100} USDT (${sum((x) => x.withdraws)} requests)`;
  let n = 0;
  for (const chat of alertTargets("").slice(0, 3)) { await tgCall("sendMessage", { chat_id: chat, text }).catch(() => {}); n++; }
  return n;
}

/* ── admin: who did what, money audit, activity heatmap ── */
const MONEY = /adjust|pay|reject|release|refund|withdraw|bulk|grant|credit|deposit|freeze|ban|promo/i;
export async function adminActivity(days: number) {
  const since = Date.now() - Math.max(1, Math.min(90, days)) * 864e5;
  let rows: any[] = [];
  try { rows = Object.values(((await db().ref("admin_logs").orderByKey().limitToLast(3000).get()).val() || {}) as Record<string, any>); } catch { rows = Object.values(((await val("admin_logs")) || {}) as Record<string, any>); }
  rows = rows.filter((r) => r.at >= since);
  const by = new Map<string, Map<string, number>>();
  for (const r of rows) { const m = by.get(String(r.by)) || new Map(); m.set(String(r.action), (m.get(String(r.action)) || 0) + 1); by.set(String(r.by), m); }
  const admins = [...by.entries()].map(([name, m]) => ({ name, total: [...m.values()].reduce((a, b) => a + b, 0), top: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([action, n]) => ({ action, n })) })).sort((a, b) => b.total - a.total);
  const money = rows.filter((r) => MONEY.test(String(r.action))).sort((a, b) => b.at - a.at).slice(0, 80).map((r) => ({ at: r.at, by: r.by, action: r.action, detail: JSON.stringify(r.detail || {}).slice(0, 160) }));
  return { admins, money, total: rows.length };
}
export async function heatmap() {
  const users = ((await val("users")) || {}) as Record<string, any>;
  const since = Date.now() - 7 * 864e5;
  const h = Array(24).fill(0);
  for (const u of Object.values(users)) if (u && u.last_seen >= since) h[new Date(u.last_seen + 6 * 36e5).getUTCHours()]++;
  return { hours: h, tz: "Bangladesh time (UTC+6)", n: h.reduce((a, b) => a + b, 0) };
}

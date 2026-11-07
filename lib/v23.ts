import crypto from "crypto";
import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2, setCfg2 } from "./cfg2";
import { activity } from "./wallet";
import { notify } from "./notify";
import { getSettings } from "./settings";
import { sha256 } from "./crypto";

const val = async (p: string) => (await db().ref(p).get()).val();
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);

/* ── savings goal (a progress marker, the money stays spendable) ── */
export async function goalGet(uid: string): Promise<{ name: string; target: number; vault: number } | null> {
  const g = await val(`user_prefs/${uid}/goal`);
  if (!(g && g.target > 0)) return null;
  const vs = Object.values(((await val(`vaults/${uid}`)) || {}) as Record<string, any>) as any[]; // money locked in the savings vault still counts toward the goal
  return { name: String(g.name || "My goal"), target: Number(g.target), vault: vs.filter((v) => v.st === "locked" && v.asset === "tfuel").reduce((a, v) => a + (v.amt || 0), 0) };
}
export async function goalSet(uid: string, name: any, target: any) {
  const t = Math.floor(Number(target));
  if (!(t >= 1) && Number(target) !== 0) throw new HttpError(400, "Enter a target amount.");
  await db().ref(`user_prefs/${uid}/goal`).set(t >= 1 ? { name: clean(name, 30) || "My goal", target: Math.min(t, 1e12) } : null);
  return goalGet(uid);
}

/* ── bio ── */
export const bioGet = async (uid: string) => String((await val(`user_prefs/${uid}/bio`)) || "");
export async function bioSet(uid: string, text: any) { const b = clean(text, 60); await db().ref(`user_prefs/${uid}/bio`).set(b || null); return b; }

/* ── free lucky draw: 1 ticket for joining + tickets per friend who joined during the round ── */
const windowStart = (end: number, days: number) => end - Math.max(1, days) * 864e5;
async function tickets(uid: string, d: { end: number; every_days: number; per_friend: number }) {
  const kids = Object.values(((await val(`referrals/${uid}`)) || {}) as Record<string, any>);
  const n = kids.filter((k: any) => (k.at || 0) >= windowStart(d.end, d.every_days || 7)).length;
  return 1 + n * d.per_friend;
}
export async function drawView(uid: string) {
  const d = (await getCfg2()).v23.draw;
  if (!d.on || !d.end) return d.winner ? { on: false, winner: d.winner } : null;
  const joined = !!(await val(`draw_entries/${d.end}/${uid}`));
  const n = Object.keys(((await val(`draw_entries/${d.end}`)) || {}) as object).length;
  return { on: true, title: d.title, prize: d.prize, end: d.end, joined, tickets: joined ? await tickets(uid, d) : 0, per_friend: d.per_friend, entrants: n, winner: d.winner };
}
export async function drawJoin(uid: string) {
  const d = (await getCfg2()).v23.draw;
  if (!d.on || !d.end || d.end <= Date.now()) throw new HttpError(409, "There is no open draw right now.");
  await db().ref(`draw_entries/${d.end}/${uid}`).transaction((c: any) => (c ? undefined : Date.now()));
}
/** cron: when the round ends pick one winner (weighted by tickets) and pay; then start the next round if it repeats */
export async function runDraw(): Promise<number> {
  const c = await getCfg2();
  const d = c.v23.draw;
  if (!d.on || !d.end || d.end > Date.now()) return 0;
  const g = await db().ref(`draw_done/${d.end}`).transaction((x: number | null) => (x ? undefined : Date.now()));
  if (!g.committed) return 0;
  const ids = Object.keys(((await val(`draw_entries/${d.end}`)) || {}) as object);
  let winner: { name: string; at: number; prize: number } | null = d.winner;
  if (ids.length) {
    const w = await Promise.all(ids.map(async (id) => ({ id, t: Math.max(1, await tickets(id, d)) })));
    const total = w.reduce((a, x) => a + x.t, 0);
    let r = crypto.randomInt(0, total), pick = w[0].id;
    for (const x of w) { if (r < x.t) { pick = x.id; break; } r -= x.t; }
    const s = await getSettings();
    if ((await val(`users/${pick}/balance`)) !== null) {
      await db().ref().update({ [`users/${pick}/balance`]: ServerValue.increment(d.prize), [`users/${pick}/earn/prize`]: ServerValue.increment(d.prize) });
      await activity(pick, "prize", { coins: d.prize, note: d.title });
      const nm = String((await val(`user_prefs/${pick}/nick`)) || (await val(`users/${pick}/name`)) || "Player").slice(0, 20);
      winner = { name: nm, at: Date.now(), prize: d.prize };
      await notify(pick, `🎉 You won "${d.title}"! +${(d.prize / Math.max(1, s.coins_per_tfuel)).toLocaleString("en-US")} TFUEL was added to your balance.`).catch(() => {});
    }
  }
  await setCfg2("v23", { draw: { ...d, winner, end: d.every_days > 0 ? d.end + d.every_days * 864e5 : 0, on: d.every_days > 0 } });
  return 1;
}

/* ── read-only API key for outside tools ── */
export async function apiKeyNew(): Promise<string> {
  const key = "ext_" + crypto.randomBytes(20).toString("hex");
  await db().ref("secrets/ext_key").set(sha256(key));
  return key;
}
export async function apiKeyOk(key: string): Promise<boolean> {
  if (!/^ext_[0-9a-f]{40}$/.test(key)) return false;
  const h = await val("secrets/ext_key");
  return !!h && crypto.timingSafeEqual(Buffer.from(String(h)), Buffer.from(sha256(key)));
}
export async function extStats() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const users = Object.keys(((await val("user_index")) || {}) as object).length;
  const wd = Object.values(((await val("withdrawals")) || {}) as Record<string, any>).filter((w: any) => w.status === "pending").length;
  const uw = Object.values(((await val("usdt_withdrawals")) || {}) as Record<string, any>).filter((w: any) => w.status === "pending").length;
  return { at: Date.now(), users, new_today: Number(await val(`stats/new_users/${day}`)) || 0, pending_withdrawals: wd, pending_usdt_withdrawals: uw };
}

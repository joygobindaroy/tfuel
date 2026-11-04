import { db } from "./firebase";
import { HttpError } from "./auth";
import { sortableId } from "./crypto";
import { getCfg2 } from "./cfg2";
import { getRefCode, resolveRef } from "./refcode";
import { alertAdmins } from "./adminalert";

const val = async (p: string) => (await db().ref(p).get()).val();
const nameOf = async (uid: string) => String((await val(`user_prefs/${uid}/nick`)) || (await val(`users/${uid}/name`)) || "User").slice(0, 24);
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);

/* ── block list ── */
export async function blockList(uid: string) {
  const m = ((await val(`user_prefs/${uid}/blk`)) || {}) as Record<string, any>;
  return Promise.all(Object.keys(m).slice(0, 100).map(async (id) => ({ code: await getRefCode(id).catch(() => ""), name: await nameOf(id) })));
}
export async function blockSet(uid: string, code: string, on: boolean) {
  if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new HttpError(400, "Enter a valid 10-character ID.");
  const other = await resolveRef(code);
  if (!other) throw new HttpError(404, "We couldn't find that user.");
  if (other === uid) throw new HttpError(400, "You can't block yourself.");
  await db().ref(`user_prefs/${uid}/blk/${other}`).set(on ? Date.now() : null);
}

/* ── note templates ── */
export async function tplGet(uid: string): Promise<string[]> { const v = await val(`user_prefs/${uid}/tpl`); return Array.isArray(v) ? v.map((x) => String(x)).slice(0, 8) : []; }
export async function tplSet(uid: string, list: any): Promise<string[]> {
  const out = (Array.isArray(list) ? list : []).map((x) => clean(x, 40)).filter(Boolean).slice(0, 8);
  await db().ref(`user_prefs/${uid}/tpl`).set(out.length ? out : null);
  return out;
}

/* ── mute switches (promotions, reminders) ── */
export async function muteGet(uid: string) { const m = ((await val(`user_prefs/${uid}/mute`)) || {}) as any; return { promo: !!m.promo, remind: !!m.remind }; }
export async function muteSet(uid: string, p: any) {
  await db().ref(`user_prefs/${uid}/mute`).update({ ...(p?.promo !== undefined ? { promo: p.promo ? true : null } : {}), ...(p?.remind !== undefined ? { remind: p.remind ? true : null } : {}) });
  return muteGet(uid);
}

/* ── feedback ── */
export async function fbSubmit(uid: string, kind: string, stars: number, text: string, ticket?: string) {
  const c = await getCfg2();
  if (!c.v22.feedback) throw new HttpError(403, "feature_off:Feedback is turned off.");
  const k = kind === "support" ? "support" : "app";
  const s = Math.floor(Number(stars));
  if (!(s >= 1 && s <= 5)) throw new HttpError(400, "Pick 1 to 5 stars.");
  const last = Number(await val(`user_prefs/${uid}/fb_${k}`)) || 0;
  if (Date.now() - last < 14 * 864e5) throw new HttpError(429, "Thanks, you already rated recently.");
  await db().ref().update({ [`feedback/${sortableId()}`]: { uid, name: await nameOf(uid), kind: k, stars: s, text: clean(text, 400), ticket: clean(ticket, 40) || null, at: Date.now() }, [`user_prefs/${uid}/fb_${k}`]: Date.now() });
}
export async function fbAsk(uid: string): Promise<boolean> {
  const c = await getCfg2();
  if (!c.v22.feedback) return false;
  const [made, last] = await Promise.all([val(`users/${uid}/created_at`), val(`user_prefs/${uid}/fb_app`)]);
  return !!made && Date.now() - made > 3 * 864e5 && Date.now() - (Number(last) || 0) > 30 * 864e5;
}
export async function fbAdmin() {
  const all = Object.entries(((await val("feedback")) || {}) as Record<string, any>).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at);
  const avg = (k: string) => { const r = all.filter((x) => x.kind === k); return { n: r.length, avg: r.length ? Math.round((r.reduce((a, x) => a + x.stars, 0) / r.length) * 100) / 100 : 0 }; };
  return { app: avg("app"), support: avg("support"), list: all.slice(0, 60) };
}

/* ── polls & surveys ── */
export async function pollsFor(uid: string) {
  const c = await getCfg2();
  const now = Date.now();
  const act = c.v22.polls.filter((p) => p.on && (!p.end || p.end > now));
  return Promise.all(act.map(async (p) => {
    const mine = (await val(`poll_votes/${p.id}/${uid}`)) as number[] | null;
    return { id: p.id, title: p.title, qs: p.qs, mine: Array.isArray(mine) ? mine : null, results: mine ? await pollTally(p.id, p.qs) : null };
  }));
}
export async function pollTally(id: string, qs: { opts: string[] }[]) {
  const votes = Object.values(((await val(`poll_votes/${id}`)) || {}) as Record<string, number[]>);
  return { n: votes.length, qs: qs.map((q, i) => q.opts.map((_, o) => votes.filter((v) => v[i] === o).length)) };
}
export async function pollVote(uid: string, id: string, answers: any) {
  const c = await getCfg2();
  const p = c.v22.polls.find((x) => x.id === id && x.on && (!x.end || x.end > Date.now()));
  if (!p) throw new HttpError(404, "This poll has ended.");
  const a = Array.isArray(answers) ? answers.map((x) => Math.floor(Number(x))) : [];
  if (a.length !== p.qs.length || a.some((x, i) => !(x >= 0 && x < p.qs[i].opts.length))) throw new HttpError(400, "Please answer every question.");
  const r = await db().ref(`poll_votes/${id}/${uid}`).transaction((cur: any) => (cur ? undefined : a));
  if (!r.committed) throw new HttpError(409, "You already voted.");
}

/* ── report a user ── */
export async function reportUser(uid: string, code: string, reason: string) {
  const text = clean(reason, 300);
  if (text.length < 5) throw new HttpError(400, "Tell us briefly what happened.");
  if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new HttpError(400, "Enter a valid 10-character ID.");
  const target = await resolveRef(code);
  if (!target) throw new HttpError(404, "We couldn't find that user.");
  if (target === uid) throw new HttpError(400, "You can't report yourself.");
  const day = Math.floor(Date.now() / 864e5);
  const rec = ((await val(`user_prefs/${uid}/rep`)) || {}) as { d?: number; n?: number };
  const n = rec.d === day ? rec.n || 0 : 0;
  if (n >= 3) throw new HttpError(429, "You can send up to 3 reports a day.");
  await db().ref().update({ [`reports/${sortableId()}`]: { by: uid, byName: await nameOf(uid), target, targetName: await nameOf(target), reason: text, at: Date.now(), status: "open" }, [`user_prefs/${uid}/rep`]: { d: day, n: n + 1 } });
  await alertAdmins("ticket", `New user report: ${await nameOf(target)} (${code}) — ${text.slice(0, 120)}`).catch(() => {});
}
export async function reportsList(status: string) {
  const all = Object.entries(((await val("reports")) || {}) as Record<string, any>).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at);
  const sameTarget = (t: string) => all.filter((r) => r.target === t).length;
  return all.filter((r) => status === "all" || r.status === status).slice(0, 80).map((r) => ({ ...r, count: sameTarget(r.target) }));
}
export async function reportResolve(id: string, status: string, note: string) {
  if (!["open", "done", "dismissed"].includes(status)) throw new HttpError(400, "Bad status");
  if (!(await val(`reports/${id}/at`))) throw new HttpError(404, "Report not found");
  await db().ref(`reports/${id}`).update({ status, note: clean(note, 200) || null, handled_at: Date.now() });
}

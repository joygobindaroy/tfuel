import crypto from "crypto";
import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2 } from "./cfg2";
import { getSettings } from "./settings";
import { getRefCode, resolveRef } from "./refcode";
import { notify } from "./notify";
import { activity } from "./wallet";
import { sha256 } from "./crypto";
import { checkPin } from "./prefs";
import { alertTargets } from "./adminalert";
import { tgCall } from "./telegram";
import { dayKey } from "./log";
import { displayName } from "./transfer";

const val = async (p: string) => (await db().ref(p).get()).val();
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);
const maskN = (n: string) => { const s = clean(n, 20); return s ? s.slice(0, 1) + "***" + (s.length > 4 ? s.slice(-1) : "") : "User"; };
const link = async (param: string) => { const b = (await getSettings()).referral_link; return b ? `${b.replace(/\?.*$/, "")}?startapp=${param}` : ""; };

/* ───────── invoices ───────── */
export async function invCreate(uid: string, title: any, amt: any, asset: any, days: any, dueDays: any = 0) {
  const t = clean(title, 60);
  const a = Math.round(Number(amt) * 1e6) / 1e6;
  if (t.length < 2) throw new HttpError(400, "Write what the payment is for.");
  if (!(a > 0) || a > 1e9) throw new HttpError(400, "Enter an amount.");
  const open = Object.values(((await val(`user_invoices/${uid}`)) || {}) as Record<string, any>).filter((x: any) => x.st === "open").length;
  if (open >= 20) throw new HttpError(429, "You have too many open invoices. Cancel some first.");
  const id = crypto.randomBytes(5).toString("hex").slice(0, 8);
  const now = Date.now();
  const rec = { uid, title: t, amt: a, asset: asset === "usdt" ? "usdt" : "tfuel", st: "open", at: now, exp: now + Math.max(1, Math.min(90, Math.floor(Number(days)) || 14)) * 864e5 } as any;
  const dd = Math.floor(Number(dueDays)) || 0;
  if (dd > 0) rec.due = Math.min(rec.exp, now + Math.min(90, dd) * 864e5);
  await db().ref().update({ [`invoices/${id}`]: rec, [`user_invoices/${uid}/${id}`]: { ...rec } });
  return id;
}
export async function invList(uid: string) {
  const m = ((await val(`user_invoices/${uid}`)) || {}) as Record<string, any>;
  const now = Date.now();
  const rows = await Promise.all(Object.entries(m).map(async ([id, v]) => { const live = (await val(`invoices/${id}`)) || v; return { id, ...live, st: live.st === "open" && live.exp < now ? "expired" : live.st, overdue: live.st === "open" && !!live.due && live.due < now && live.exp >= now, link: await link(`inv_${id}`) }; }));
  return rows.sort((a, b) => b.at - a.at).slice(0, 40);
}
export async function invCancel(uid: string, id: string) {
  const v = await val(`invoices/${id}`);
  if (!v || v.uid !== uid) throw new HttpError(404, "Invoice not found.");
  if (v.st !== "open") throw new HttpError(409, "This invoice is already closed.");
  await db().ref().update({ [`invoices/${id}/st`]: "cancelled", [`user_invoices/${uid}/${id}/st`]: "cancelled" });
}
export async function invPub(id: string) {
  const v = await val(`invoices/${String(id).replace(/[^a-z0-9]/gi, "").slice(0, 10)}`);
  if (!v) throw new HttpError(404, "Invoice not found.");
  if (v.st !== "open" || v.exp < Date.now()) throw new HttpError(409, v.st === "paid" ? "This invoice is already paid." : "This invoice is closed.");
  return { name: await displayName(v.uid), code: await getRefCode(v.uid), title: v.title, amt: v.amt, asset: v.asset, note: `INV-${id}` };
}

/* ───────── donation page ───────── */
export async function tippGet(uid: string) { const t = (await val(`user_prefs/${uid}/tipp`)) || {}; return { on: !!t.on, title: String(t.title || ""), goal: Number(t.goal) || 0 }; }
export async function tippSet(uid: string, b: any) {
  const title = clean(b?.title, 60);
  if (b?.on && title.length < 2) throw new HttpError(400, "Give your page a title.");
  await db().ref(`user_prefs/${uid}/tipp`).set({ on: !!b?.on, title, goal: Math.max(0, Math.min(1e9, Math.floor(Number(b?.goal)) || 0)) });
  return tippGet(uid);
}
export async function tippLink(uid: string) { return link(`tipp_${await getRefCode(uid)}`); }
export async function tippPub(code: string) {
  if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new HttpError(400, "bad_code");
  const uid = await resolveRef(code);
  const t = uid ? await tippGet(uid) : null;
  if (!uid || !t || !t.on) throw new HttpError(404, "This page isn't open.");
  const raised = Number(await val(`tip_tot/${uid}/tfuel`)) || 0;
  let recent: any[] = [];
  try { recent = Object.values(((await db().ref(`tip_log/${uid}`).orderByKey().limitToLast(8).get()).val() || {}) as Record<string, any>); } catch { recent = Object.values(((await val(`tip_log/${uid}`)) || {}) as Record<string, any>).slice(-8); }
  const cpt = (await getSettings()).coins_per_tfuel || 1000;
  return { name: await displayName(uid), code, title: t.title, goal: t.goal, raised: raised / cpt, recent: recent.sort((a, b) => b.at - a.at).map((r) => ({ who: r.who, a: r.a, amt: r.a === "usdt" ? r.amt / 1e6 : r.amt / cpt })), note: "TIP" };
}

/** after each completed transfer: mark an invoice paid, or log a donation */
export async function afterXfer(toUid: string, fromName: string, asset: "tfuel" | "usdt", amount: number, txid: string, note: string) {
  const m = /^INV-([a-z0-9]{8})\b/i.exec(note || "");
  if (m) {
    const id = m[1].toLowerCase();
    const v = await val(`invoices/${id}`);
    const cpt = (await getSettings()).coins_per_tfuel || 1000;
    const need = v ? Math.round(v.amt * (v.asset === "usdt" ? 1e6 : cpt)) : 0;
    if (v && v.uid === toUid && v.st === "open" && v.asset === asset && amount >= need) {
      const r = await db().ref(`invoices/${id}/st`).transaction((s: string | null) => (s === "open" ? "paid" : undefined));
      if (r.committed) {
        await db().ref().update({ [`invoices/${id}/paid`]: { by: maskN(fromName), at: Date.now(), tx: txid }, [`user_invoices/${toUid}/${id}/st`]: "paid" });
        await notify(toUid, `🧾 Invoice "${v.title}" was paid by ${maskN(fromName)}.`).catch(() => {});
      }
    }
    return;
  }
  if (/^TIP\b/i.test(note || "") && (await val(`user_prefs/${toUid}/tipp/on`))) {
    const id = `${Date.now()}_${crypto.randomBytes(2).toString("hex")}`;
    await db().ref().update({ [`tip_log/${toUid}/${id}`]: { who: maskN(fromName), a: asset, amt: amount, at: Date.now() }, ...(asset === "tfuel" ? { [`tip_tot/${toUid}/tfuel`]: ServerValue.increment(amount) } : {}) });
  }
}

/* ───────── lessons ───────── */
export async function learnList(uid: string) {
  const c = (await getCfg2()).v26.lessons;
  const done = ((await val(`lesson_done/${uid}`)) || {}) as Record<string, number>;
  return c.map((l) => ({ id: l.id, title: l.title, body: l.body, reward: l.reward, done: !!done[l.id] }));
}
export async function learnOpen(uid: string, id: string) {
  if (!(await getCfg2()).v26.lessons.some((l) => l.id === id)) throw new HttpError(404, "Lesson not found.");
  await db().ref(`lesson_open/${uid}/${id}`).transaction((c: number | null) => c || Date.now());
}
export async function learnDone(uid: string, id: string) {
  const l = (await getCfg2()).v26.lessons.find((x) => x.id === id);
  if (!l) throw new HttpError(404, "Lesson not found.");
  const opened = Number(await val(`lesson_open/${uid}/${id}`)) || 0;
  if (!opened || Date.now() - opened < Math.min(30000, 4000 + l.body.length * 8)) throw new HttpError(429, "Take a little more time to read it.");
  const r = await db().ref(`lesson_done/${uid}/${id}`).transaction((c: number | null) => (c ? undefined : Date.now()));
  if (!r.committed) throw new HttpError(409, "You already finished this lesson.");
  if (l.reward > 0) {
    await db().ref().update({ [`users/${uid}/balance`]: ServerValue.increment(l.reward), [`users/${uid}/earn/prize`]: ServerValue.increment(l.reward) });
    await activity(uid, "prize", { coins: l.reward, note: `Lesson: ${l.title}` });
  }
  return l.reward;
}

/* ───────── recovery codes ───────── */
export async function recNew(uid: string, pin: unknown) {
  await checkPin(uid, pin);
  const codes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString("hex").toUpperCase());
  await db().ref(`user_prefs/${uid}/rec`).set({ h: codes.map((c) => sha256("rec:" + uid + ":" + c)), at: Date.now() });
  return codes;
}
export async function recLeft(uid: string) { const r = await val(`user_prefs/${uid}/rec/h`); return Array.isArray(r) ? r.length : r ? Object.keys(r).length : 0; }
/** Use one code to switch the withdraw PIN off (money out is blocked for 24 h afterwards) */
export async function recUse(uid: string, code: any) {
  const h = sha256("rec:" + uid + ":" + String(code || "").replace(/[^a-z0-9]/gi, "").toUpperCase());
  let hit = false;
  await db().ref(`user_prefs/${uid}/rec/h`).transaction((cur: any) => {
    const a: string[] = Array.isArray(cur) ? cur : cur ? Object.values(cur) : [];
    hit = a.includes(h);
    return hit ? a.filter((x) => x !== h) : cur ?? null;
  });
  if (!hit) throw new HttpError(403, "That code isn't valid.");
  await db().ref().update({ [`user_prefs/${uid}/pin`]: null, [`user_prefs/${uid}/safe_until`]: Date.now() + 864e5 });
  await notify(uid, "🔐 Your withdraw PIN was switched off with a recovery code. Money out is paused for 24 hours. Set a new PIN in Settings.").catch(() => {});
}

/* ───────── identity check (KYC-lite) ───────── */
export async function assertKyc(uid: string, usd: number) {
  const c = (await getCfg2()).v26.kyc;
  if (!c.on || usd < c.usd) return;
  if ((await val(`user_prefs/${uid}/kyc/st`)) !== "ok") throw new HttpError(403, "kyc_required");
}
export async function kycGet(uid: string) { const k = (await val(`user_prefs/${uid}/kyc`)) || {}; const c = (await getCfg2()).v26.kyc; return { on: c.on, usd: c.usd, st: String(k.st || "none"), note: String(k.anote || "") }; }
export async function kycSubmit(uid: string, linkIn: any, note: any) {
  const l = String(linkIn || "").trim();
  if (!/^https:\/\/[^\s<>"']{8,300}$/.test(l)) throw new HttpError(400, "Paste a secure (https) link to your document.");
  const cur = await val(`user_prefs/${uid}/kyc/st`);
  if (cur === "ok") throw new HttpError(409, "You are already verified.");
  await db().ref(`user_prefs/${uid}/kyc`).set({ st: "pending", link: l, note: clean(note, 200), at: Date.now() });
  await db().ref(`kyc_queue/${uid}`).set(Date.now());
  const { alertAdmins } = await import("./adminalert");
  await alertAdmins("ticket", `New identity check from ${await displayName(uid)}`).catch(() => {});
}
export async function kycQueue() {
  const ids = Object.keys(((await val("kyc_queue")) || {}) as object);
  return Promise.all(ids.slice(0, 50).map(async (uid) => { const k = (await val(`user_prefs/${uid}/kyc`)) || {}; return { uid, name: await displayName(uid).catch(() => uid), link: k.link, note: k.note, at: k.at, st: k.st }; }));
}
export async function kycSet(uid: string, st: string, note: string) {
  if (!["ok", "rejected"].includes(st)) throw new HttpError(400, "Bad status");
  if (!(await val(`kyc_queue/${uid}`))) throw new HttpError(404, "Not in the queue.");
  await db().ref().update({ [`user_prefs/${uid}/kyc/st`]: st, [`user_prefs/${uid}/kyc/anote`]: clean(note, 150) || null, [`kyc_queue/${uid}`]: null });
  await notify(uid, st === "ok" ? "✅ Your identity check was approved." : `❌ Your identity check was not approved.${note ? " " + clean(note, 150) : ""}`).catch(() => {});
}

/* ───────── admin: calendar, ledger, smart alerts ───────── */
export async function calendar() {
  const c = await getCfg2(true);
  const now = Date.now(), end = now + 30 * 864e5;
  const out: { at: number; kind: string; text: string }[] = [];
  const add = (at: number, kind: string, text: string) => { if (at && at >= now - 864e5 && at <= end) out.push({ at, kind, text }); };
  for (const e of c.v20.events) { add(e.start, "Event", `${e.title} starts (×${e.mult})`); add(e.end, "Event", `${e.title} ends`); }
  for (const p of [c.brand.popup, ...c.brand.popups]) if (p.title) { add(p.from, "Pop-up", `"${p.title}" starts`); add(p.to, "Pop-up", `"${p.title}" ends`); }
  if (c.v23.draw.on) add(c.v23.draw.end, "Draw", `${c.v23.draw.title} is drawn`);
  const sched = ((await val("admin_schedule")) || {}) as Record<string, any>;
  for (const s of Object.values(sched)) add(s.at, "Message", String(s.text || s.type || "Scheduled message").slice(0, 60));
  const tours = ((await val("tournaments")) || {}) as Record<string, any>;
  for (const t of Object.values(tours)) if (!t.cancelled) { add(t.start, "Tournament", `${t.title} starts`); add(t.end, "Tournament", `${t.title} ends`); }
  return out.sort((a, b) => a.at - b.at).slice(0, 80);
}
export async function ledger(days: number) {
  const { series } = await import("./insights");
  return (await series(Math.max(1, Math.min(366, days)))).map((x: any) => ({ day: x.day, active: x.active, joined: x.joined, deposit_usdt: x.depositU, payout_usdt: x.payoutU, withdraw_requests: x.withdraws }));
}
export async function runSmartAlerts(): Promise<number> {
  const key = dayKey();
  const g = await db().ref("stats/smart_alert").transaction((x: string | null) => (x === key ? undefined : key));
  if (!g.committed) return 0;
  const { series } = await import("./insights");
  const s = await series(9);
  if (s.length < 5) return 0;
  const y = s[s.length - 2], prev = s.slice(0, -2);
  const avg = (f: (x: any) => number) => prev.reduce((a, x) => a + f(x), 0) / Math.max(1, prev.length);
  const msgs: string[] = [];
  if (y.withdraws >= 5 && y.withdraws >= 2.5 * avg((x) => x.withdraws)) msgs.push(`Withdraw requests jumped: ${y.withdraws} yesterday vs about ${Math.round(avg((x) => x.withdraws))} a day before.`);
  if (avg((x) => x.joined) >= 10 && y.joined < 0.5 * avg((x) => x.joined)) msgs.push(`New users dropped: ${y.joined} yesterday vs about ${Math.round(avg((x) => x.joined))} a day before.`);
  let n = 0;
  for (const m of msgs) for (const chat of alertTargets("").slice(0, 3)) { await tgCall("sendMessage", { chat_id: chat, text: `⚠️ ${m}` }).catch(() => {}); n++; }
  return n;
}

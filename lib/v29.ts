import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2 } from "./cfg2";
import { getSettings } from "./settings";
import { sortableId, sha256 } from "./crypto";
import { dayKey } from "./log";
import { notify } from "./notify";
import { activity } from "./wallet";
import { U } from "./market";
import { maskName } from "./transfer";

const val = async (p: string) => (await db().ref(p).get()).val();
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);

/* ───────── savings vault (no interest, no risk: money is parked until a date you choose) ───────── */
export async function vaultList(uid: string) {
  const c = (await getCfg2()).v29.vault;
  const m = ((await val(`vaults/${uid}`)) || {}) as Record<string, any>;
  const list = Object.entries(m).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.at - a.at).slice(0, 30);
  return { on: c.on, min_days: c.min_days, max_days: c.max_days, min_tfuel: c.min_tfuel, max_open: c.max_open, list };
}
export async function vaultLock(uid: string, b: any) {
  const cfg = await getCfg2(), c = cfg.v29.vault;
  if (!c.on) throw new HttpError(403, "feature_off:Savings vault is off.");
  const s = await getSettings();
  const asset = b?.asset === "usdt" ? "usdt" : "tfuel";
  const days = Math.floor(Number(b?.days));
  if (!(days >= c.min_days && days <= c.max_days)) throw new HttpError(400, `Choose between ${c.min_days} and ${c.max_days} days.`);
  const amt = asset === "usdt" ? Math.round(Number(b?.amount) * U) : Math.round(Number(b?.amount) * s.coins_per_tfuel);
  if (!(amt > 0)) throw new HttpError(400, "Enter an amount.");
  if (asset === "tfuel" && amt < c.min_tfuel * s.coins_per_tfuel) throw new HttpError(400, `Minimum is ${c.min_tfuel} TFUEL.`);
  if (asset === "usdt" && amt < U) throw new HttpError(400, "Minimum is 1 USDT.");
  const open = Object.values(((await val(`vaults/${uid}`)) || {}) as Record<string, any>).filter((v: any) => v.st === "locked");
  if (open.length >= c.max_open) throw new HttpError(429, `You can keep ${c.max_open} locked vaults at a time.`);
  let err = "";
  await db().ref(`users/${uid}`).transaction((cur: any) => {
    err = "";
    if (!cur) { err = "send_no_user"; return cur; }
    const k = asset === "usdt" ? "usdt_u" : "balance";
    if ((cur[k] || 0) < amt) { err = asset === "usdt" ? "insufficient_usdt" : "insufficient"; return cur; }
    cur[k] = (cur[k] || 0) - amt;
    return cur;
  });
  if (err) throw new HttpError(409, err);
  const id = sortableId(), now = Date.now();
  await db().ref().update({ [`vaults/${uid}/${id}`]: { name: clean(b?.name, 30) || "My savings", asset, amt, at: now, unlock_at: now + days * 864e5, st: "locked" }, [`vault_users/${uid}`]: true });
  await activity(uid, "adjust", { ...(asset === "usdt" ? { usdt_u: -amt } : { coins: -amt }), note: `Locked in vault for ${days} days` });
  return vaultList(uid);
}
export async function vaultOpen(uid: string, id: string) {
  const v = (await val(`vaults/${uid}/${id}`)) as any;
  if (!v) throw new HttpError(404, "not_found");
  if (v.unlock_at > Date.now()) throw new HttpError(409, `Locked until ${new Date(v.unlock_at).toISOString().slice(0, 10)}.`);
  const t = await db().ref(`vaults/${uid}/${id}/st`).transaction((cur: string | null) => (cur === "locked" ? "opening" : undefined));
  if (!t.committed) throw new HttpError(409, "This vault is already open.");
  await db().ref().update({ [`users/${uid}/${v.asset === "usdt" ? "usdt_u" : "balance"}`]: ServerValue.increment(v.amt), [`vaults/${uid}/${id}/st`]: "open", [`vaults/${uid}/${id}/opened_at`]: Date.now() });
  await activity(uid, "adjust", { ...(v.asset === "usdt" ? { usdt_u: v.amt } : { coins: v.amt }), note: "Vault opened" });
  return vaultList(uid);
}
export async function runVaults(now = Date.now()) {
  const ids = Object.keys(((await val("vault_users")) || {}) as Record<string, any>).slice(0, 500);
  let n = 0;
  for (const uid of ids) {
    const m = ((await val(`vaults/${uid}`)) || {}) as Record<string, any>;
    let any = false;
    for (const [id, v] of Object.entries(m)) {
      if (v.st === "locked") any = true;
      if (v.st === "locked" && v.unlock_at <= now && !v.nf) {
        await db().ref(`vaults/${uid}/${id}/nf`).set(now);
        await notify(uid, `🔓 Your vault "${v.name}" is ready. Open the app → Settings → Savings vault to take your money back.`).catch(() => {});
        n++;
      }
    }
    if (!any) await db().ref(`vault_users/${uid}`).set(null);
  }
  return n;
}

/* ───────── panic button + emergency contact ───────── */
export async function panicState(uid: string) {
  const f = (await val(`frozen/${uid}`)) as any;
  const e = (await val(`user_prefs/${uid}/emg`)) as any;
  const asked = e ? await val(`emg_req/${e.u}/${uid}`) : null;
  return { frozen: !!f, self: !!f?.self, since: f?.at || 0, emg: e ? { name: e.name, code: e.code, since: e.at, ready: Date.now() - e.at >= 864e5 } : null, asked: !!asked };
}
export async function panicOn(uid: string, name: string) {
  if (!(await getCfg2()).v29.panic) throw new HttpError(403, "feature_off:The panic button is off.");
  if (await val(`frozen/${uid}`)) throw new HttpError(409, "Your account is already frozen.");
  await db().ref(`frozen/${uid}`).set({ reason: "Self-freeze (panic button)", by: "self", self: true, at: Date.now() });
  await notify(uid, "🛑 You froze your account. Money out is stopped. To unfreeze, use a recovery code in Settings, or ask your emergency contact / support.").catch(() => {});
  const e = (await val(`user_prefs/${uid}/emg`)) as any;
  if (e?.u) await notify(e.u, `🛑 ${maskName(name)} froze their account with the panic button. If it was them, they may ask you to confirm the unfreeze.`).catch(() => {});
  return panicState(uid);
}
/** use one recovery code to lift a self-freeze (the code is consumed) */
export async function panicOff(uid: string, code: any) {
  const f = (await val(`frozen/${uid}`)) as any;
  if (!f) throw new HttpError(409, "Your account isn't frozen.");
  if (!f.self) throw new HttpError(403, "This freeze was set by support. Please open a ticket.");
  const h = sha256("rec:" + uid + ":" + String(code || "").replace(/[^a-z0-9]/gi, "").toUpperCase());
  let hit = false;
  await db().ref(`user_prefs/${uid}/rec/h`).transaction((cur: any) => {
    const a: string[] = Array.isArray(cur) ? cur : cur ? Object.values(cur) : [];
    hit = a.includes(h);
    return hit ? a.filter((x) => x !== h) : cur ?? null;
  });
  if (!hit) throw new HttpError(403, "That code isn't valid.");
  await unfreeze(uid);
  return panicState(uid);
}
async function unfreeze(uid: string) {
  await db().ref().update({ [`frozen/${uid}`]: null, [`user_prefs/${uid}/safe_until`]: Date.now() + 864e5 });
  await notify(uid, "✅ Your account is unfrozen. Money out stays paused for 24 hours as a safety step.").catch(() => {});
}
export async function emgSet(uid: string, code: any) {
  const { resolveRef, getRefCode } = await import("./refcode");
  const c = String(code || "").trim();
  const u = await resolveRef(c).catch(() => "");
  if (!u) throw new HttpError(404, "send_no_user");
  if (u === uid) throw new HttpError(400, "Choose another person.");
  const name = (await val(`users/${u}/name`)) || "Friend";
  await db().ref(`user_prefs/${uid}/emg`).set({ u, name: clean(name, 20), code: await getRefCode(u).catch(() => c), at: Date.now() });
  await notify(u, `🛡 ${maskName((await val(`users/${uid}/name`)) || "A friend")} chose you as their emergency contact. You'll only be asked to confirm an unfreeze — you can't move their money.`).catch(() => {});
  return panicState(uid);
}
export async function emgClear(uid: string) { await db().ref(`user_prefs/${uid}/emg`).set(null); return panicState(uid); }
export async function emgAsk(uid: string, name: string) {
  const f = (await val(`frozen/${uid}`)) as any;
  if (!f?.self) throw new HttpError(409, "Only a self-freeze can be confirmed by a contact.");
  const e = (await val(`user_prefs/${uid}/emg`)) as any;
  if (!e?.u) throw new HttpError(400, "Add an emergency contact first.");
  if (Date.now() - e.at < 864e5) throw new HttpError(403, "An emergency contact works 24 hours after you add them.");
  await db().ref(`emg_req/${e.u}/${uid}`).set({ name: clean(name, 20), at: Date.now(), exp: Date.now() + 48 * 3600000 });
  await notify(e.u, `🛡 ${maskName(name)} asks you to confirm they can unfreeze their account. Open the app → Settings → Emergency requests. Only confirm if you spoke to them yourself.`).catch(() => {});
  return panicState(uid);
}
export async function emgPending(contact: string) {
  const m = ((await val(`emg_req/${contact}`)) || {}) as Record<string, any>;
  return Object.entries(m).filter(([, r]) => r.exp > Date.now()).map(([uid, r]) => ({ uid, name: maskName(r.name), at: r.at }));
}
export async function emgApprove(contact: string, owner: string) {
  const r = (await val(`emg_req/${contact}/${owner}`)) as any;
  if (!r || r.exp < Date.now()) throw new HttpError(404, "This request has expired.");
  const e = (await val(`user_prefs/${owner}/emg`)) as any;
  const f = (await val(`frozen/${owner}`)) as any;
  if (!e || e.u !== contact || !f?.self || e.at > r.at - 864e5) throw new HttpError(403, "This request can't be confirmed.");
  await db().ref(`emg_req/${contact}/${owner}`).set(null);
  await unfreeze(owner);
  return true;
}

/* ───────── referral contest ───────── */
const cid = (c: { start: number }) => String(c.start);
export async function contestHit(refId: string, now = Date.now()) {
  const c = (await getCfg2()).v29.contest;
  if (!c.on || !c.start || now < c.start || now > c.end) return;
  await db().ref(`contest_cnt/${cid(c)}/${refId}`).transaction((cur: number | null) => (cur || 0) + 1);
}
export async function contestView(uid: string, now = Date.now()) {
  const cfg = await getCfg2(), c = cfg.v29.contest;
  if (!c.on || !c.start) return null;
  const cnt = ((await val(`contest_cnt/${cid(c)}`)) || {}) as Record<string, number>;
  const ranked = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const board = [];
  for (let i = 0; i < ranked.length; i++) board.push({ rank: i + 1, name: maskName(String((await val(`users/${ranked[i][0]}/name`)) || "User")), n: ranked[i][1], me: ranked[i][0] === uid });
  const all = Object.entries(cnt).sort((a, b) => b[1] - a[1]);
  const idx = all.findIndex(([k]) => k === uid);
  return { title: c.title, start: c.start, end: c.end, prizes: c.prizes, live: now >= c.start && now <= c.end, ended: now > c.end, paid: !!(await val(`contest_paid/${cid(c)}`)), board, me: { n: cnt[uid] || 0, rank: idx >= 0 ? idx + 1 : 0 } };
}
export async function contestPay(who: string, now = Date.now()) {
  const c = (await getCfg2()).v29.contest;
  if (!c.start || now <= c.end) throw new HttpError(409, "The contest hasn't ended yet.");
  let first = false;
  await db().ref(`contest_paid/${cid(c)}`).transaction((cur: any) => { first = !cur; return cur || { at: now, by: who }; });
  if (!first) throw new HttpError(409, "Prizes were already paid.");
  const cpt = (await getSettings()).coins_per_tfuel;
  const cnt = ((await val(`contest_cnt/${cid(c)}`)) || {}) as Record<string, number>;
  const win = Object.entries(cnt).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, c.prizes.length);
  const out = [];
  for (let i = 0; i < win.length; i++) {
    const coins = Math.round(c.prizes[i] * cpt);
    if (coins <= 0) continue;
    await db().ref(`users/${win[i][0]}/balance`).transaction((cur: number | null) => (cur === null ? cur : cur + coins));
    await activity(win[i][0], "referral", { coins, note: `${c.title} prize #${i + 1}` });
    await notify(win[i][0], `🏆 ${c.title}: you finished #${i + 1} with ${win[i][1]} friends and won ${c.prizes[i]} TFUEL!`).catch(() => {});
    out.push({ rank: i + 1, uid: win[i][0], n: win[i][1], tfuel: c.prizes[i] });
  }
  return out;
}

/* ───────── first Exchange order bonus ───────── */
export async function firstOrderBonus(uid: string) {
  const f = (await getCfg2()).v29.first;
  if (!f.on || !(f.tfuel > 0)) return false;
  let first = false;
  await db().ref(`bonus_first/${uid}`).transaction((cur: any) => { first = !cur; return cur || Date.now(); });
  if (!first) return false;
  const coins = Math.round(f.tfuel * (await getSettings()).coins_per_tfuel);
  await db().ref(`users/${uid}/balance`).transaction((cur: number | null) => (cur === null ? cur : cur + coins));
  await activity(uid, "referral", { coins, note: "First exchange bonus" });
  await notify(uid, `🎁 Bonus for your first exchange: ${f.tfuel} TFUEL added.`).catch(() => {});
  return true;
}

/* ───────── win-back ───────── */
export async function runWinback(now = Date.now()) {
  const w = (await getCfg2()).v29.winback;
  if (!w.on) return 0;
  const { audienceIds } = await import("./broadcast");
  const { muteGet } = await import("./v22");
  const cpt = (await getSettings()).coins_per_tfuel;
  const ids = await audienceIds({ kind: "inactive", days: w.days });
  let n = 0;
  for (const uid of ids) {
    if (n >= 150) break;
    const last = Number(await val(`winback/${uid}`)) || 0;
    if (now - last < 60 * 864e5) continue;
    if ((await muteGet(uid)).promo) continue;
    let first = false;
    await db().ref(`winback/${uid}`).transaction((cur: number | null) => { first = !cur || now - cur >= 60 * 864e5; return first ? now : cur; });
    if (!first) continue;
    const coins = Math.round(w.tfuel * cpt);
    if (coins > 0) { await db().ref(`users/${uid}/balance`).transaction((cur: number | null) => (cur === null ? cur : cur + coins)); await activity(uid, "referral", { coins, note: "Welcome back gift" }); }
    await notify(uid, `👋 ${w.text}${coins > 0 ? ` ${w.tfuel} TFUEL were added to your balance.` : ""}`).catch(() => {});
    n++;
  }
  return n;
}

/* ───────── admin team notes ───────── */
export async function notesList() {
  const m = ((await val("team_notes")) || {}) as Record<string, any>;
  return Object.entries(m).map(([id, n]) => ({ id, ...n })).sort((a, b) => (a.done === b.done ? b.at - a.at : a.done ? 1 : -1)).slice(0, 60);
}
export async function noteAdd(who: string, text: string) {
  const t = clean(text, 300);
  if (t.length < 3) throw new HttpError(400, "Write a little more.");
  await db().ref(`team_notes/${sortableId()}`).set({ text: t, by: who, at: Date.now(), done: false });
  return notesList();
}
export async function noteDone(id: string, done: boolean) { if (!(await val(`team_notes/${id}`))) throw new HttpError(404, "not_found"); await db().ref(`team_notes/${id}/done`).set(!!done); return notesList(); }
export async function noteDel(id: string) { await db().ref(`team_notes/${id}`).set(null); return notesList(); }

/* ───────── exchange rate history ───────── */
export async function xRecord() {
  const { xc } = await import("./v27");
  const c = await xc();
  if (!c.on || !(c.rate_buy > 0 || c.rate_sell > 0)) return false;
  await db().ref(`xchg_rates/${dayKey()}`).set({ b: c.rate_buy, s: c.rate_sell });
  return true;
}
export async function xRates(days: number) {
  const m = ((await val("xchg_rates")) || {}) as Record<string, { b: number; s: number }>;
  return Object.entries(m).sort((a, b) => (a[0] < b[0] ? -1 : 1)).slice(-Math.max(2, Math.min(180, days))).map(([day, r]) => ({ day, buy: r.b, sell: r.s }));
}

import { db } from "./firebase";
import { HttpError } from "./auth";
import { sortableId } from "./crypto";
import { getCfg2, AdSlot } from "./cfg2";
import { toU, fromU } from "./market";
import { activity } from "./wallet";
import { notify } from "./notify";
import { alertAdmins } from "./adminalert";
import { startBroadcast } from "./broadcast";
import type { UserRecord } from "./user";

/**
 * Sponsor marketplace: any user can buy a promotion slot with their USDT balance. Nothing goes live until an admin approves it,
 * a rejected / cancelled order is refunded in full, and each order records impressions and clicks.
 */
export type AdStatus = "pending" | "active" | "rejected" | "ended" | "cancelled";
export interface AdOrder {
  id: string; uid: string; name: string; slot: string; kind: string; title: string; text: string; url: string; image: string;
  days: number; price_u: number; status: AdStatus; created: number; start?: number; end?: number; imp: number; clk: number; note?: string;
  goal?: number; reward?: number; task_id?: string; refund_u?: number; sent?: number;
}
const MAX_OPEN_PER_USER = 5;
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function quote(slot: AdSlot, days: number, discounts: { days: number; pct: number }[]) {
  const d = slot.kind === "pinned" ? 1 : days;
  const pct = slot.kind === "pinned" ? 0 : discounts.filter((x) => d >= x.days).reduce((m, x) => Math.max(m, x.pct), 0);
  const gross = slot.price * d;
  return { days: d, pct, price: r2(gross * (1 - pct / 100)), gross: r2(gross) };
}

function checkContent(title: string, text: string, url: string, blocked: string[]) {
  if (title.length < 3) throw new HttpError(400, "ad_title");
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(url) || url.length > 300) throw new HttpError(400, "ad_url");
  const hay = `${title} ${text} ${url}`.toLowerCase();
  if (blocked.some((w) => w && hay.includes(w))) throw new HttpError(400, "ad_blocked");
}

async function openCount(slot: string) {
  const o = ((await db().ref("ad_open").get()).val() || {}) as Record<string, string>;
  return Object.values(o).filter((x) => x === slot).length;
}

async function takeUsdt(uid: string, pu: number) {
  let err = "";
  const r = await db().ref(`users/${uid}`).transaction((cur: UserRecord | null) => {
    err = "";
    if (cur === null) return cur;
    if ((cur.usdt_u || 0) < pu) { err = "insufficient_usdt"; return; }
    cur.usdt_u = (cur.usdt_u || 0) - pu;
    cur.usdt_tot = { ...(cur.usdt_tot || {}), ads: (cur.usdt_tot?.ads || 0) + pu };
    return cur;
  });
  if (err) throw new HttpError(409, err);
  if (!r.committed) throw new HttpError(409, "insufficient_usdt");
}
async function giveUsdt(uid: string, pu: number, note: string) {
  if (pu < 1) return;
  await db().ref(`users/${uid}`).transaction((cur: UserRecord | null) => {
    if (cur === null) return cur;
    cur.usdt_u = (cur.usdt_u || 0) + pu;
    cur.usdt_tot = { ...(cur.usdt_tot || {}), ads: (cur.usdt_tot?.ads || 0) - pu };
    return cur;
  });
  await activity(uid, "adrefund", { usdt_u: pu, note });
}

export async function adsView(uid: string) {
  const cfg = await getCfg2();
  const m = cfg.adsmkt;
  const [mineIdx, u, open] = await Promise.all([db().ref(`ad_user/${uid}`).get(), db().ref(`users/${uid}/usdt_u`).get(), db().ref("ad_open").get()]);
  const ids = Object.keys((mineIdx.val() || {}) as Record<string, any>).slice(-30);
  const mine = (await Promise.all(ids.map(async (id) => (await db().ref(`ad_orders/${id}`).get()).val() as AdOrder | null))).filter(Boolean) as AdOrder[];
  mine.sort((a, b) => b.created - a.created);
  const o = (open.val() || {}) as Record<string, string>;
  return {
    enabled: m.enabled,
    usdt: fromU(Number(u.val()) || 0),
    slots: m.slots.map((s) => ({ ...s, full: Object.values(o).filter((x) => x === s.id).length >= s.max_active, q: quote(s, 1, m.discounts) })),
    discounts: m.discounts, max_days: m.max_days,
    mission: m.mission,
    mine: mine.map((x) => ({ id: x.id, slot: x.slot, kind: x.kind, title: x.title, days: x.days, price: fromU(x.price_u), status: x.status, created: x.created, end: x.end || 0, imp: x.imp || 0, clk: x.clk || 0, note: x.note || "", goal: x.goal || 0, refund: fromU(x.refund_u || 0) })),
  };
}

export async function adsBuy(uid: string, name: string, b: any) {
  const cfg = await getCfg2(true);
  const m = cfg.adsmkt;
  if (!m.enabled) throw new HttpError(403, "feature_off");
  const title = clean(b.title, 40), text = clean(b.text, 120), url = String(b.url || "").trim(), image = /^https:\/\//.test(String(b.image || "")) ? String(b.image).slice(0, 300) : "";
  checkContent(title, text, url, m.blocked);
  const mine = ((await db().ref(`ad_user/${uid}`).get()).val() || {}) as Record<string, string>;
  const open = ((await db().ref("ad_open").get()).val() || {}) as Record<string, string>;
  if (Object.keys(mine).filter((id) => open[id]).length >= MAX_OPEN_PER_USER) throw new HttpError(409, "ad_too_many");
  const id = sortableId();
  let order: AdOrder;
  if (b.mission) {
    if (!m.mission.enabled) throw new HttpError(403, "feature_off");
    const goal = Math.floor(Number(b.goal) || 0);
    if (goal < m.mission.min || goal > m.mission.max) throw new HttpError(400, "ad_goal");
    const days = Math.max(1, Math.min(m.max_days, Math.floor(Number(b.days) || 7)));
    const pu = toU(r2(goal * m.mission.price));
    order = { id, uid, name, slot: "mission", kind: "mission", title, text, url, image: "", days, price_u: pu, status: "pending", created: Date.now(), imp: 0, clk: 0, goal, reward: m.mission.reward };
  } else {
    const slot = m.slots.find((s) => s.id === String(b.slot || ""));
    if (!slot) throw new HttpError(404, "not_found");
    const days = Math.max(1, Math.min(m.max_days, Math.floor(Number(b.days) || 1)));
    const q = quote(slot, days, m.discounts);
    if ((await openCount(slot.id)) >= slot.max_active) throw new HttpError(409, "ad_full");
    order = { id, uid, name, slot: slot.id, kind: slot.kind, title, text, url, image: slot.kind === "home_banner" ? image : "", days: q.days, price_u: toU(q.price), status: "pending", created: Date.now(), imp: 0, clk: 0 };
  }
  await takeUsdt(uid, order.price_u);
  try {
    await db().ref().update({ [`ad_orders/${id}`]: order, [`ad_user/${uid}/${id}`]: 1, [`ad_open/${id}`]: order.slot });
  } catch (e) { await giveUsdt(uid, order.price_u, "Promotion refund"); throw e; }
  await activity(uid, "adbuy", { usdt_u: -order.price_u, note: order.title });
  await db().ref(`stats/ads_day/${new Date().toISOString().slice(0, 10)}`).transaction((c: number | null) => (c || 0) + order.price_u).catch(() => {});
  await alertAdmins("ad", `New promotion to review: "${order.title}" — ${order.kind}, ${order.days}d, ${fromU(order.price_u).toFixed(2)} USDT. Open Admin → Growth & Games → Sponsor marketplace.`);
  return { id, price: fromU(order.price_u) };
}

async function closeOrder(o: AdOrder, status: AdStatus, patch: Partial<AdOrder> = {}) {
  await db().ref().update({ [`ad_orders/${o.id}`]: { ...o, ...patch, status }, [`ad_open/${o.id}`]: null, [`ad_active/${o.id}`]: null });
}
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
async function revenueAdjust(o: AdOrder, refund_u: number) {
  if (refund_u > 0) await db().ref(`stats/ads_day/${dayOf(o.created)}`).transaction((c: number | null) => Math.max(0, (c || 0) - refund_u)).catch(() => {});
}

export async function getOrder(id: string) {
  const o = (await db().ref(`ad_orders/${id}`).get()).val() as AdOrder | null;
  if (!o) throw new HttpError(404, "not_found");
  return o;
}

export async function adsCancel(uid: string, id: string) {
  const o = await getOrder(id);
  if (o.uid !== uid) throw new HttpError(403, "forbidden");
  if (o.status !== "pending") throw new HttpError(409, "ad_not_pending");
  await closeOrder(o, "cancelled", { refund_u: o.price_u });
  await giveUsdt(uid, o.price_u, "Promotion cancelled");
  await revenueAdjust(o, o.price_u);
}

export async function adsReject(id: string, note: string, by: string) {
  const o = await getOrder(id);
  if (o.status !== "pending") throw new HttpError(409, "ad_not_pending");
  await closeOrder(o, "rejected", { refund_u: o.price_u, note: clean(note, 120) || "Not accepted" });
  await giveUsdt(o.uid, o.price_u, "Promotion rejected");
  await revenueAdjust(o, o.price_u);
  await notify(o.uid, `💰 Your promotion "${o.title}" was not accepted${note ? `: ${clean(note, 120)}` : ""}. Your ${fromU(o.price_u).toFixed(2)} USDT was refunded.`);
  void by;
}

export async function adsApprove(id: string, by: string) {
  const cfg = await getCfg2(true);
  const o = await getOrder(id);
  if (o.status !== "pending") throw new HttpError(409, "ad_not_pending");
  const now = Date.now();
  if (o.kind === "pinned") {
    const { total } = await startBroadcast({ text: `📣 ${o.title}\n${o.text}`.trim(), url: o.url, btn: "Open", aud: { kind: "all" }, inbox: true }, `ad:${by}`);
    await closeOrder(o, "ended", { start: now, end: now, sent: total });
    await notify(o.uid, `💰 Your message "${o.title}" is being sent to ${total} users now.`);
    return;
  }
  if (o.kind === "mission") {
    const m = cfg.adsmkt.mission;
    const tid = sortableId();
    await db().ref(`tasks/${tid}`).set({ type: "timer_visit", title: o.title.slice(0, 80), reward: o.reward || m.reward, one_time: true, sponsor: o.name.slice(0, 30) || null, budget: o.goal || null, cpa: null, url: o.url, min_wait_seconds: 15 });
    await db().ref().update({ [`ad_orders/${id}`]: { ...o, status: "active", start: now, end: now + o.days * 86400000, task_id: tid }, [`ad_active/${id}`]: { kind: "mission", end: now + o.days * 86400000 } });
  } else {
    await db().ref().update({ [`ad_orders/${id}`]: { ...o, status: "active", start: now, end: now + o.days * 86400000 }, [`ad_active/${id}`]: { kind: o.kind, end: now + o.days * 86400000 } });
  }
  await notify(o.uid, `💰 Your promotion "${o.title}" is now live for ${o.days} day${o.days === 1 ? "" : "s"}.`);
  cache.clear();
}

/** finish an active order (expiry or admin stop). Mission: unused completions are refunded pro-rata. */
export async function adsFinish(id: string, early: boolean, by = "cron") {
  const o = await getOrder(id);
  if (o.status !== "active") throw new HttpError(409, "ad_not_active");
  let refund = 0;
  if (o.kind === "mission" && o.task_id && o.goal) {
    const done = Number((await db().ref(`task_stats/${o.task_id}/done`).get()).val()) || 0;
    refund = Math.floor((o.price_u * Math.max(0, o.goal - done)) / o.goal);
    await db().ref(`tasks/${o.task_id}`).remove();
  } else if (early && o.end && o.start) {
    const left = Math.max(0, o.end - Date.now());
    refund = Math.floor((o.price_u * left) / (o.end - o.start));
  }
  await closeOrder(o, "ended", { end: Date.now(), refund_u: refund });
  if (refund > 0) { await giveUsdt(o.uid, refund, "Promotion unused time"); await revenueAdjust(o, refund); }
  cache.clear();
  await notify(o.uid, `💰 Your promotion "${o.title}" has ended. Views ${o.imp || 0}, clicks ${o.clk || 0}${refund > 0 ? `. ${fromU(refund).toFixed(2)} USDT for the unused part was refunded.` : "."}`);
  void by;
}

export async function adsExpire(): Promise<number> {
  const act = ((await db().ref("ad_active").get()).val() || {}) as Record<string, { end: number }>;
  let n = 0;
  for (const [id, a] of Object.entries(act)) {
    if (a.end > Date.now()) continue;
    try { await adsFinish(id, false); n++; } catch { await db().ref(`ad_active/${id}`).remove().catch(() => {}); }
  }
  return n;
}

// ---- serving ----
export interface PublicAd { id: string; title: string; text: string; url: string; image: string }
const cache = new Map<string, { at: number; v: PublicAd[] }>();
export async function activeAds(kind: string): Promise<PublicAd[]> {
  const c = cache.get(kind);
  if (c && Date.now() - c.at < 30000) return c.v;
  const act = ((await db().ref("ad_active").get()).val() || {}) as Record<string, { kind: string; end: number }>;
  const ids = Object.entries(act).filter(([, a]) => a.kind === kind && a.end > Date.now()).map(([id]) => id);
  const v = (await Promise.all(ids.map(async (id) => (await db().ref(`ad_orders/${id}`).get()).val() as AdOrder | null))).filter((o): o is AdOrder => !!o && o.status === "active").map((o) => ({ id: o.id, title: o.title, text: o.text, url: o.url, image: o.image }));
  cache.set(kind, { at: Date.now(), v });
  return v;
}
/** one ad of this kind, rotating every minute (and differently per user) */
export async function pickAd(kind: string, uid = ""): Promise<PublicAd | null> {
  const list = await activeAds(kind);
  if (!list.length) return null;
  const seed = Math.floor(Date.now() / 60000) + (Number(uid.slice(-4)) || 0);
  return list[seed % list.length];
}
export async function adImp(id: string) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return;
  await db().ref(`ad_orders/${id}/imp`).transaction((c: number | null) => (c === null ? c : c + 1)).catch(() => {});
}
/** counts the click and returns the destination (only for an active order) */
export async function adClick(id: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(id)) return null;
  const o = (await db().ref(`ad_orders/${id}`).get()).val() as AdOrder | null;
  if (!o || o.status !== "active") return null;
  await db().ref(`ad_orders/${id}/clk`).transaction((c: number | null) => (c || 0) + 1).catch(() => {});
  return o.url;
}

// ---- admin ----
export async function adsAdminList() {
  let all: Record<string, AdOrder> = {};
  try { all = ((await db().ref("ad_orders").orderByChild("created").limitToLast(120).get()).val() || {}) as Record<string, AdOrder>; }
  catch { all = ((await db().ref("ad_orders").get()).val() || {}) as Record<string, AdOrder>; }
  const rows = Object.values(all).sort((a, b) => b.created - a.created);
  const day = (ms: number) => dayOf(ms);
  const revenue: Record<string, number> = {};
  const st = ((await db().ref("stats/ads_day").get()).val() || {}) as Record<string, number>;
  for (const [k, v] of Object.entries(st)) revenue[k] = fromU(v);
  void day;
  return {
    pending: rows.filter((r) => r.status === "pending").map(pub),
    active: rows.filter((r) => r.status === "active").map(pub),
    recent: rows.filter((r) => r.status !== "pending" && r.status !== "active").slice(0, 30).map(pub),
    revenue,
  };
}
const pub = (o: AdOrder) => ({ ...o, price: fromU(o.price_u), refund: fromU(o.refund_u || 0) });

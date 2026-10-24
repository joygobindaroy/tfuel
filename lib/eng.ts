import { db } from "./firebase";
import { HttpError } from "./auth";
import { Settings } from "./settings";
import { getCfg2, Cfg2 } from "./cfg2";
import { chargeCoins, creditCoins } from "./coins";
import { levelInfo } from "./retention";
import { notify } from "./notify";
import { dayKey } from "./log";
import { sendCoins } from "./transfer";
import { clanOf } from "./clan";
import { alertAdmins } from "./adminalert";
import type { UserRecord } from "./user";

/** v19.1 engagement: level-up rewards, rewarded boost + lucky box helpers, friend gift, invite milestones, creator program, season pass, name plate, tips */
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

// ---------------------------------------------------------------- level-up
/** Pays the reward for every new level (once). The first check only records the current level (no retro pay). */
export async function levelCheck(uid: string, u: UserRecord, cfg: Cfg2): Promise<{ from: number; to: number; coins: number } | null> {
  if (!cfg.eng.levelup.enabled) return null;
  const lv = levelInfo(u).level;
  let from = -1;
  await db().ref(`users/${uid}/lvl_paid`).transaction((c: number | null) => { from = c === null ? -1 : c; return c === null || lv > c ? lv : undefined; });
  if (from < 0 || lv <= from) return null;
  let coins = 0;
  for (let l = from + 1; l <= lv; l++) coins += l * cfg.eng.levelup.base;
  if (coins > 0) {
    await creditCoins(uid, coins, "prize", "prize", `Level ${lv} reached`, false);
    await notify(uid, `🎉 Level ${lv}! You earned +${coins.toLocaleString("en-US")} coins.`);
  }
  return { from, to: lv, coins };
}

// ---------------------------------------------------------------- ad helpers
export const rollBox = (cfg: Cfg2) => cfg.eng.luckybox.min + Math.floor(Math.random() * (cfg.eng.luckybox.max - cfg.eng.luckybox.min + 1));
export const adBoostActive = (cur: any, cfg: Cfg2, now: number) => cfg.eng.adboost.enabled && Number(cur?.ab_until) > now;

// ---------------------------------------------------------------- state for /api/me
export async function engState(uid: string, u: UserRecord, s: Settings, cfg: Cfg2) {
  const e = cfg.eng;
  const now = Date.now();
  const day = dayKey(now);
  const a = (u.ads && u.ads.day === day ? u.ads : {}) as any;
  const [plate, cr, claimedMs] = await Promise.all([
    db().ref(`user_prefs/${uid}/plate`).get(),
    e.creator.enabled ? db().ref(`creator/${uid}`).get() : Promise.resolve(null),
    db().ref(`users/${uid}/ms`).get(),
  ]);
  const ms = (claimedMs.val() || {}) as Record<string, number>;
  const ab = Number((u as any).ab_until) || 0;
  const pu = Number((u as any).pass_until) || 0;
  const adsOn = s.ads_enabled;
  return {
    box: { on: e.luckybox.enabled && adsOn, left: Math.max(0, e.luckybox.per_day - (a.box || 0)), min: e.luckybox.min, max: e.luckybox.max },
    boost: { on: e.adboost.enabled && adsOn, left: Math.max(0, e.adboost.per_day - (a.boost || 0)), minutes: e.adboost.minutes, mult: e.adboost.mult, until: ab > now ? ab : 0 },
    pass: { on: e.pass.enabled, price: e.pass.price, days: e.pass.days, daily: e.pass.daily, until: pu > now ? pu : 0, claimed: (u as any).pass_day === day },
    plate: { on: e.plate.enabled, price: e.plate.price, max: e.plate.max, cur: String(plate.val() || "") },
    gift: { on: e.gift.enabled, send: e.gift.send, recv: e.gift.recv },
    tip: { on: e.tip.enabled && s.send_enabled, amounts: e.tip.amounts, fee: e.tip.fee_pct },
    ms: { on: e.invms.enabled, steps: e.invms.steps.map((x) => ({ n: x.n, coins: x.coins, claimed: !!ms[x.n], ready: (u.ref_count || 0) >= x.n && !ms[x.n] })), friends: u.ref_count || 0 },
    creator: { on: e.creator.enabled, bonus: e.creator.bonus_pct, min: e.creator.min_subs, status: (u as any).creator ? "approved" : cr?.val()?.status || "", note: cr?.val()?.note || "" },
  };
}

// ---------------------------------------------------------------- friend gift
async function friendIds(uid: string): Promise<string[]> {
  const refs = Object.keys(((await db().ref(`referrals/${uid}`).get()).val() || {}) as Record<string, any>);
  const by = String((await db().ref(`users/${uid}/referred_by`).get()).val() || "");
  return Array.from(new Set([...(by ? [by] : []), ...refs])).slice(0, 40);
}
export async function giftList(uid: string) {
  const cfg = await getCfg2();
  const day = dayKey();
  const [ids, sent] = await Promise.all([friendIds(uid), db().ref(`gift_day/${day}/${uid}`).get()]);
  const m = (sent.val() || {}) as Record<string, number>;
  const friends = await Promise.all(ids.map(async (id) => ({ id, name: clean((await db().ref(`users/${id}/name`).get()).val() || "Friend", 20), sent: !!m[id] })));
  return { on: cfg.eng.gift.enabled, send: cfg.eng.gift.send, recv: cfg.eng.gift.recv, left: Math.max(0, cfg.eng.gift.per_day - Object.keys(m).length), friends };
}
export async function giftSend(uid: string, name: string, to: string) {
  const cfg = await getCfg2();
  const g = cfg.eng.gift;
  if (!g.enabled) throw new HttpError(403, "feature_off");
  if (!(await friendIds(uid)).includes(to)) throw new HttpError(403, "gift_not_friend");
  const day = dayKey();
  const sender = (await db().ref(`users/${uid}`).get()).val() as UserRecord | null;
  if (!sender || sender.banned || (sender.created_at && Date.now() - sender.created_at < 86400000)) throw new HttpError(403, "gift_too_new");
  const r = await db().ref(`gift_day/${day}/${uid}`).transaction((c: Record<string, number> | null) => {
    const cur = c || {};
    if (cur[to] || Object.keys(cur).length >= g.per_day) return;
    cur[to] = Date.now();
    return cur;
  });
  if (!r.committed) throw new HttpError(409, "gift_limit");
  const ok = await creditCoins(to, g.recv, "prize", "prize", `Gift from ${clean(name, 12) || "a friend"}`, false);
  if (!ok) { await db().ref(`gift_day/${day}/${uid}/${to}`).remove().catch(() => {}); throw new HttpError(404, "send_no_user"); }
  if (g.send > 0) await creditCoins(uid, g.send, "prize", "prize", "Thanks for gifting a friend", false);
  await notify(to, `🎁 ${clean(name, 20) || "A friend"} sent you a gift: +${g.recv} coins!`);
  return { send: g.send, recv: g.recv };
}

// ---------------------------------------------------------------- invite milestones
export async function msClaim(uid: string, n: number) {
  const cfg = await getCfg2();
  if (!cfg.eng.invms.enabled) throw new HttpError(403, "feature_off");
  const step = cfg.eng.invms.steps.find((x) => x.n === n);
  if (!step) throw new HttpError(404, "not_found");
  const u = (await db().ref(`users/${uid}`).get()).val() as UserRecord | null;
  if (!u || (u.ref_count || 0) < n) throw new HttpError(409, "ms_not_ready");
  const r = await db().ref(`users/${uid}/ms/${n}`).transaction((c: number | null) => (c === null ? Date.now() : undefined));
  if (!r.committed) throw new HttpError(409, "already_claimed");
  if (!(await creditCoins(uid, step.coins, "prize", "prize", `Invited ${n} friends`, false))) { await db().ref(`users/${uid}/ms/${n}`).remove(); throw new HttpError(500, "server_error"); }
  return step.coins;
}

// ---------------------------------------------------------------- creator program
export async function creatorApply(uid: string, name: string, link: string, subs: number) {
  const cfg = await getCfg2();
  const c = cfg.eng.creator;
  if (!c.enabled) throw new HttpError(403, "feature_off");
  if (!/^https:\/\/[^\s/]+\.[^\s/]+/i.test(link) || link.length > 200) throw new HttpError(400, "ad_url");
  if (!(subs >= c.min_subs)) throw new HttpError(400, "creator_min");
  const cur = (await db().ref(`creator/${uid}`).get()).val();
  if (cur?.status === "approved" || cur?.status === "pending") throw new HttpError(409, "creator_exists");
  await db().ref(`creator/${uid}`).set({ status: "pending", name: clean(name, 30), link, subs: Math.floor(subs), at: Date.now() });
  await alertAdmins("ad", `Creator application from ${clean(name, 30)} (${uid}): ${Math.floor(subs)} followers, ${link}. Review in Admin → Growth & Games.`);
}
export async function creatorList() {
  const all = ((await db().ref("creator").get()).val() || {}) as Record<string, any>;
  const rows = await Promise.all(Object.entries(all).map(async ([uid, c]) => {
    const u = ((await db().ref(`users/${uid}`).get()).val() || {}) as any;
    return { uid, ...c, friends: u.ref_count || 0, comm: u.ref_earned || 0 };
  }));
  return rows.sort((a, b) => (a.status === "pending" ? -1 : 0) - (b.status === "pending" ? -1 : 0) || b.at - a.at).slice(0, 80);
}
export async function creatorSet(uid: string, status: "approved" | "rejected" | "revoked", note: string) {
  const c = (await db().ref(`creator/${uid}`).get()).val();
  if (!c) throw new HttpError(404, "not_found");
  const st = status === "revoked" ? "rejected" : status;
  await db().ref().update({ [`creator/${uid}/status`]: st, [`creator/${uid}/note`]: clean(note, 100) || null, [`users/${uid}/creator`]: st === "approved" ? true : null });
  await notify(uid, st === "approved" ? "🌟 You're now a TFUEL Creator! Your friends' commission rate is higher." : `🌟 Your creator application was not accepted${note ? `: ${clean(note, 100)}` : ""}.`);
}
export const creatorBonus = (me: any, cfg: Cfg2) => (cfg.eng.creator.enabled && me?.creator ? cfg.eng.creator.bonus_pct : 0);

// ---------------------------------------------------------------- season pass
export async function passBuy(uid: string) {
  const cfg = await getCfg2();
  const p = cfg.eng.pass;
  if (!p.enabled) throw new HttpError(403, "feature_off");
  const now = Date.now();
  let until = 0;
  await chargeCoins(uid, p.price, "boosts", (cur: any) => { until = Math.max(now, Number(cur.pass_until) || 0) + p.days * 86400000; cur.pass_until = until; return null; });
  return until;
}
export async function passClaim(uid: string) {
  const cfg = await getCfg2();
  const p = cfg.eng.pass;
  const day = dayKey();
  const u = (await db().ref(`users/${uid}`).get()).val() as any;
  if (!p.enabled || !u || !(Number(u.pass_until) > Date.now())) throw new HttpError(403, "pass_inactive");
  let first = false;
  await db().ref(`users/${uid}/pass_day`).transaction((c: string | null) => { first = c !== day; return first ? day : undefined; });
  if (!first) throw new HttpError(409, "already_claimed");
  if (p.daily > 0) await creditCoins(uid, p.daily, "prize", "prize", "Season pass daily bonus", false);
  return p.daily;
}

// ---------------------------------------------------------------- name plate
export async function plateBuy(uid: string, text: string) {
  const cfg = await getCfg2();
  const p = cfg.eng.plate;
  if (!p.enabled) throw new HttpError(403, "feature_off");
  const t = clean(text, p.max);
  if (t.length < 3 || !/^[\p{L}\p{N}\p{Extended_Pictographic} _.!-]+$/u.test(t) || /(https?|www\.|t\.me|\.com|\.net|@)/i.test(t)) throw new HttpError(400, "plate_bad");
  const hay = t.toLowerCase();
  if (cfg.adsmkt.blocked.some((w) => w && hay.includes(w))) throw new HttpError(400, "ad_blocked");
  const cur = String((await db().ref(`user_prefs/${uid}/plate`).get()).val() || "");
  if (cur === t) throw new HttpError(409, "plate_same");
  await chargeCoins(uid, p.price, "shop");
  await db().ref(`user_prefs/${uid}/plate`).set(t);
  return t;
}
export async function plateClear(uid: string) { await db().ref(`user_prefs/${uid}/plate`).remove(); }

// ---------------------------------------------------------------- tips (clan mates)
export async function tipSend(uid: string, name: string, to: string, amount: number, s: Settings) {
  const cfg = await getCfg2();
  const t = cfg.eng.tip;
  if (!t.enabled) throw new HttpError(403, "feature_off");
  if (!t.amounts.includes(amount)) throw new HttpError(400, "bad_amount");
  const [mine, theirs] = await Promise.all([clanOf(uid), clanOf(to)]);
  if (!mine || mine !== theirs) throw new HttpError(403, "tip_clan_only");
  return sendCoins({ id: uid, name }, to, amount, { ...s, send_fee_pct: t.fee_pct, send_min: 1 }, "Tip");
}

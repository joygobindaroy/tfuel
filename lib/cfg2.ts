import { db } from "./firebase";

/** v18 admin-configurable options (stored at `cfg2`, separate from `settings`). Each section is sanitised on write. */
export interface Tier { n: number; pct: number }
export interface RigTier { id: string; name: string; emoji: string; price: number; rate: number }
export interface Collectible { id: string; name: string; emoji: string; image: string; price: number; supply: number; pts: number; max: number }
export interface Cosmetic { id: string; name: string; emoji: string; kind: "badge" | "frame"; price: number }
export interface AdSlot { id: string; kind: "bot_button" | "home_banner" | "board_top" | "pinned"; name: string; price: number; max_active: number }
export interface AdsMkt {
  enabled: boolean;
  slots: AdSlot[];
  discounts: { days: number; pct: number }[]; // longer purchase → % off
  max_days: number;
  mission: { enabled: boolean; price: number; reward: number; min: number; max: number }; // price = USDT per completed task
  blocked: string[]; // words / domains that are never accepted
}
export interface Eng {
  levelup: { enabled: boolean; base: number }; // reward = level × base coins
  luckybox: { enabled: boolean; min: number; max: number; per_day: number }; // free box after watching an ad
  adboost: { enabled: boolean; minutes: number; mult: number; per_day: number }; // watch an ad → tap × mult for a while
  gift: { enabled: boolean; send: number; recv: number; per_day: number }; // gift to a friend (coins paid by you, small)
  invms: { enabled: boolean; steps: { n: number; coins: number }[] };
  creator: { enabled: boolean; bonus_pct: number; min_subs: number };
  pass: { enabled: boolean; price: number; days: number; daily: number }; // season pass
  plate: { enabled: boolean; price: number; max: number };
  tip: { enabled: boolean; fee_pct: number; amounts: number[] };
}
export interface Cfg2 {
  ab: { enabled: boolean; name: string; mult_b: number };
  autoban: { enabled: boolean; min_score: number; action: "freeze" | "flag"; max_per_run: number };
  moves: { enabled: boolean; options: number[] };
  eng: Eng;
  adsmkt: AdsMkt;
  cosmetics: { enabled: boolean; items: Cosmetic[] };
  tiers: Tier[];
  contest: { enabled: boolean; name: string; prizes: number[] };
  autoconv: { enabled: boolean; options: number[]; weekly: boolean };
  bot: { enabled: boolean; threshold: number; action: "flag" | "freeze" };
  geo: { hold_countries: string[]; ip_limit: number; ip_action: "flag" | "hold" };
  status: { level: "ok" | "degraded" | "outage"; note: string };
  alerts: { enabled: boolean; pending_hours: number };
  clan: { enabled: boolean; create_cost: number; max_members: number; prizes: number[]; boss: { enabled: boolean; name: string; emoji: string; hp_base: number; hp_per_member: number; reward: number } };
  rigs: { enabled: boolean; cap_hours: number; growth_pct: number; tiers: RigTier[] };
  puzzle: { enabled: boolean; reward: number; tries: number; words: string[] };
  collect: { enabled: boolean; items: Collectible[]; season: { name: string; end: number; pool: number; paid: boolean } };
  faqbot: { enabled: boolean; ai: boolean; model: string; min_score: number };
}

const WORDS = "planet rocket silver golden market wallet crypto token energy mining tapper streak reward coffee garden bridge pocket window yellow orange purple castle forest island desert ocean thunder dragon knight wizard pirate anchor candle mirror ticket jacket button pencil marble camera guitar violin piano tiger rabbit monkey turtle falcon dolphin cherry banana potato tomato lemon butter cheese honey sugar pepper summer winter autumn spring river mountain valley cloud storm breeze shadow flame crystal diamond emerald ruby sapphire".split(" ");

export const CFG2_DEFAULTS: Cfg2 = {
  ab: { enabled: false, name: "Daily reward test", mult_b: 1.2 },
  autoban: { enabled: false, min_score: 5, action: "freeze", max_per_run: 20 },
  moves: { enabled: true, options: [5, 10, 20] },
  eng: {
    levelup: { enabled: true, base: 100 },
    luckybox: { enabled: false, min: 50, max: 500, per_day: 3 },
    adboost: { enabled: false, minutes: 120, mult: 2, per_day: 2 },
    gift: { enabled: true, send: 30, recv: 50, per_day: 5 },
    invms: { enabled: true, steps: [{ n: 10, coins: 3000 }, { n: 50, coins: 20000 }, { n: 100, coins: 50000 }] },
    creator: { enabled: false, bonus_pct: 3, min_subs: 500 },
    pass: { enabled: false, price: 150000, days: 90, daily: 500 },
    plate: { enabled: false, price: 20000, max: 12 },
    tip: { enabled: true, fee_pct: 2, amounts: [100, 500, 1000] },
  },
  adsmkt: {
    enabled: false,
    slots: [
      { id: "bot_btn", kind: "bot_button", name: "Bot menu button", price: 1, max_active: 3 },
      { id: "home", kind: "home_banner", name: "App home banner", price: 2, max_active: 3 },
      { id: "board", kind: "board_top", name: "Top of Leaderboard", price: 1.5, max_active: 1 },
      { id: "pin", kind: "pinned", name: "Message to every user (sent once)", price: 10, max_active: 2 },
    ],
    discounts: [{ days: 7, pct: 10 }, { days: 14, pct: 15 }, { days: 30, pct: 25 }],
    max_days: 30,
    mission: { enabled: false, price: 0.05, reward: 300, min: 50, max: 5000 },
    blocked: ["casino", "betting", "porn", "adult", "airdrop-claim", "wallet-connect", "seed phrase", "private key"],
  },
  cosmetics: { enabled: false, items: [
    { id: "b_fire", name: "Fire", emoji: "🔥", kind: "badge", price: 5000 },
    { id: "b_star", name: "Star", emoji: "⭐", kind: "badge", price: 8000 },
    { id: "b_crown", name: "Crown", emoji: "👑", kind: "badge", price: 25000 },
    { id: "b_diamond", name: "Diamond", emoji: "💎", kind: "badge", price: 50000 },
    { id: "f_spark", name: "Sparkle", emoji: "✨", kind: "frame", price: 10000 },
    { id: "f_leaf", name: "Laurel", emoji: "🌿", kind: "frame", price: 15000 },
  ] },
  tiers: [{ n: 5, pct: 4 }, { n: 20, pct: 5 }, { n: 50, pct: 6 }],
  contest: { enabled: false, name: "Weekly invite contest", prizes: [20000, 10000, 5000] },
  autoconv: { enabled: false, options: [10, 25, 50], weekly: true },
  bot: { enabled: true, threshold: 25, action: "flag" },
  geo: { hold_countries: [], ip_limit: 0, ip_action: "flag" },
  status: { level: "ok", note: "" },
  alerts: { enabled: true, pending_hours: 24 },
  clan: { enabled: false, create_cost: 0, max_members: 30, prizes: [30000, 15000, 7500], boss: { enabled: true, name: "Gold Golem", emoji: "🗿", hp_base: 50000, hp_per_member: 20000, reward: 3000 } },
  rigs: { enabled: false, cap_hours: 12, growth_pct: 15, tiers: [
    { id: "r1", name: "Basic rig", emoji: "🖥", price: 5000, rate: 20 },
    { id: "r2", name: "Pro rig", emoji: "⚙️", price: 25000, rate: 110 },
    { id: "r3", name: "Quantum rig", emoji: "🚀", price: 120000, rate: 560 },
  ] },
  puzzle: { enabled: false, reward: 100, tries: 3, words: WORDS },
  collect: { enabled: false, items: [], season: { name: "Season 1", end: 0, pool: 0, paid: false } },
  faqbot: { enabled: true, ai: false, model: "meta-llama/llama-3.3-70b-instruct:free", min_score: 2 },
};

const num = (v: any, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const int = (v: any, lo: number, hi: number, d: number) => Math.floor(num(v, lo, hi, d));
const str = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);
const arrN = (v: any, max: number, hi = 1e9) => (Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/)).map((x) => Math.floor(Number(x))).filter((x) => Number.isFinite(x) && x > 0 && x <= hi).slice(0, max);
const cc = (v: any) => (Array.isArray(v) ? v : String(v ?? "").split(/[\s,]+/)).map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)).slice(0, 60);
const bool = (v: any) => v === true || v === "true" || v === 1;
const idOk = (v: any, fb: string) => { const s = String(v ?? "").toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 20); return s || fb; };

/** sanitise one section; throws Error(message) on invalid input */
export const SECTIONS: { [K in keyof Cfg2]: (v: any, cur: Cfg2[K]) => Cfg2[K] } = {
  ab: (v) => ({ enabled: bool(v?.enabled), name: str(v?.name, 40) || "Reward test", mult_b: Math.round(num(v?.mult_b, 0.1, 5, 1.2) * 100) / 100 }),
  autoban: (v) => ({ enabled: bool(v?.enabled), min_score: int(v?.min_score, 2, 20, 5), action: v?.action === "flag" ? "flag" : "freeze", max_per_run: int(v?.max_per_run, 1, 200, 20) }),
  moves: (v) => ({ enabled: bool(v?.enabled), options: arrN(v?.options, 5, 90) }),
  eng: (v) => ({
    levelup: { enabled: bool(v?.levelup?.enabled), base: int(v?.levelup?.base, 1, 1e6, 100) },
    luckybox: { enabled: bool(v?.luckybox?.enabled), min: int(v?.luckybox?.min, 1, 1e8, 50), max: Math.max(int(v?.luckybox?.min, 1, 1e8, 50), int(v?.luckybox?.max, 1, 1e8, 500)), per_day: int(v?.luckybox?.per_day, 1, 50, 3) },
    adboost: { enabled: bool(v?.adboost?.enabled), minutes: int(v?.adboost?.minutes, 1, 1440, 120), mult: num(v?.adboost?.mult, 1.1, 10, 2), per_day: int(v?.adboost?.per_day, 1, 50, 2) },
    gift: { enabled: bool(v?.gift?.enabled), send: int(v?.gift?.send, 0, 1e6, 30), recv: int(v?.gift?.recv, 0, 1e6, 50), per_day: int(v?.gift?.per_day, 1, 50, 5) },
    invms: { enabled: bool(v?.invms?.enabled), steps: (Array.isArray(v?.invms?.steps) ? v.invms.steps : []).map((t: any) => ({ n: int(t?.n, 1, 1e6, 0), coins: int(t?.coins, 1, 1e9, 0) })).filter((t: any) => t.n > 0 && t.coins > 0).sort((a: any, b: any) => a.n - b.n).slice(0, 10) },
    creator: { enabled: bool(v?.creator?.enabled), bonus_pct: num(v?.creator?.bonus_pct, 0, 50, 3), min_subs: int(v?.creator?.min_subs, 0, 1e9, 500) },
    pass: { enabled: bool(v?.pass?.enabled), price: int(v?.pass?.price, 1, 1e10, 150000), days: int(v?.pass?.days, 1, 365, 90), daily: int(v?.pass?.daily, 0, 1e7, 500) },
    plate: { enabled: bool(v?.plate?.enabled), price: int(v?.plate?.price, 0, 1e10, 20000), max: int(v?.plate?.max, 3, 20, 12) },
    tip: { enabled: bool(v?.tip?.enabled), fee_pct: num(v?.tip?.fee_pct, 0, 50, 2), amounts: arrN(v?.tip?.amounts, 5) },
  }),
  adsmkt: (v) => ({
    enabled: bool(v?.enabled),
    slots: (Array.isArray(v?.slots) ? v.slots : []).slice(0, 12).map((t: any, i: number) => ({
      id: idOk(t?.id, "s" + (i + 1)), kind: ["bot_button", "home_banner", "board_top", "pinned"].includes(t?.kind) ? t.kind : "home_banner",
      name: str(t?.name, 40) || "Slot", price: Math.round(num(t?.price, 0.01, 100000, 1) * 100) / 100, max_active: int(t?.max_active, 1, 50, 1),
    })),
    discounts: (Array.isArray(v?.discounts) ? v.discounts : []).map((d: any) => ({ days: int(d?.days, 2, 365, 0), pct: num(d?.pct, 1, 90, 0) })).filter((d: any) => d.days > 0 && d.pct > 0).sort((a: any, b: any) => a.days - b.days).slice(0, 6),
    max_days: int(v?.max_days, 1, 365, 30),
    mission: { enabled: bool(v?.mission?.enabled), price: Math.round(num(v?.mission?.price, 0.001, 100, 0.05) * 1000) / 1000, reward: int(v?.mission?.reward, 1, 1e7, 300), min: int(v?.mission?.min, 1, 1e6, 50), max: int(v?.mission?.max, 1, 1e7, 5000) },
    blocked: (Array.isArray(v?.blocked) ? v.blocked : String(v?.blocked ?? "").split(",")).map((x: any) => str(x, 40).toLowerCase()).filter(Boolean).slice(0, 80),
  }),
  cosmetics: (v) => ({
    enabled: bool(v?.enabled),
    items: (Array.isArray(v?.items) ? v.items : []).slice(0, 40).map((t: any, i: number) => ({ id: idOk(t?.id, "c" + (i + 1)), name: str(t?.name, 20) || "Item", emoji: str(t?.emoji, 4) || "✨", kind: t?.kind === "frame" ? "frame" : "badge", price: int(t?.price, 1, 1e10, 5000) })),
  }),
  tiers: (v) => {
    const a = (Array.isArray(v) ? v : []).map((t) => ({ n: int(t?.n, 1, 100000, 0), pct: num(t?.pct, 0, 50, 0) })).filter((t) => t.n > 0 && t.pct > 0).sort((x, y) => x.n - y.n).slice(0, 8);
    return a;
  },
  contest: (v) => ({ enabled: bool(v?.enabled), name: str(v?.name, 40) || "Invite contest", prizes: arrN(v?.prizes, 10) }),
  autoconv: (v) => ({ enabled: bool(v?.enabled), options: arrN(v?.options, 5, 100).filter((x) => x <= 100), weekly: v?.weekly === undefined ? true : bool(v?.weekly) }),
  bot: (v) => ({ enabled: bool(v?.enabled), threshold: int(v?.threshold, 5, 500, 25), action: v?.action === "freeze" ? "freeze" : "flag" }),
  geo: (v) => ({ hold_countries: cc(v?.hold_countries), ip_limit: int(v?.ip_limit, 0, 50, 0), ip_action: v?.ip_action === "hold" ? "hold" : "flag" }),
  status: (v) => ({ level: ["ok", "degraded", "outage"].includes(v?.level) ? v.level : "ok", note: str(v?.note, 200) }),
  alerts: (v) => ({ enabled: bool(v?.enabled), pending_hours: int(v?.pending_hours, 1, 240, 24) }),
  clan: (v) => ({
    enabled: bool(v?.enabled), create_cost: int(v?.create_cost, 0, 1e9, 0), max_members: int(v?.max_members, 2, 200, 30), prizes: arrN(v?.prizes, 5),
    boss: { enabled: bool(v?.boss?.enabled), name: str(v?.boss?.name, 30) || "Boss", emoji: str(v?.boss?.emoji, 4) || "🗿", hp_base: int(v?.boss?.hp_base, 1000, 1e10, 50000), hp_per_member: int(v?.boss?.hp_per_member, 0, 1e9, 20000), reward: int(v?.boss?.reward, 0, 1e9, 3000) },
  }),
  rigs: (v) => ({
    enabled: bool(v?.enabled), cap_hours: int(v?.cap_hours, 1, 72, 12), growth_pct: num(v?.growth_pct, 0, 200, 15),
    tiers: (Array.isArray(v?.tiers) ? v.tiers : []).slice(0, 8).map((t: any, i: number) => ({ id: idOk(t?.id, "r" + (i + 1)), name: str(t?.name, 24) || "Rig", emoji: str(t?.emoji, 4) || "🖥", price: int(t?.price, 1, 1e10, 1000), rate: int(t?.rate, 1, 1e8, 10) })),
  }),
  puzzle: (v) => {
    const words = (Array.isArray(v?.words) ? v.words : String(v?.words ?? "").split(/[\s,]+/)).map((w: any) => String(w).toLowerCase().replace(/[^a-z]/g, "")).filter((w: string) => w.length >= 4 && w.length <= 10);
    return { enabled: bool(v?.enabled), reward: int(v?.reward, 0, 1e9, 100), tries: int(v?.tries, 1, 10, 3), words: Array.from(new Set<string>(words)).slice(0, 1000) };
  },
  collect: (v, cur) => ({
    enabled: bool(v?.enabled),
    items: (Array.isArray(v?.items) ? v.items : []).slice(0, 40).map((t: any, i: number) => ({ id: idOk(t?.id, "c" + (i + 1)), name: str(t?.name, 30) || "Item", emoji: str(t?.emoji, 4) || "🎴", image: /^https:\/\//.test(String(t?.image || "")) ? String(t.image).slice(0, 300) : "", price: int(t?.price, 1, 1e10, 1000), supply: int(t?.supply, 0, 1e9, 0), pts: int(t?.pts, 1, 1e6, 1), max: int(t?.max, 0, 1e6, 0) })),
    season: { name: str(v?.season?.name, 30) || "Season", end: int(v?.season?.end, 0, 4e12, 0), pool: int(v?.season?.pool, 0, 1e12, 0), paid: v?.season?.end === cur.season.end && v?.season?.pool === cur.season.pool ? cur.season.paid : false },
  }),
  faqbot: (v) => ({ enabled: bool(v?.enabled), ai: bool(v?.ai), model: str(v?.model, 80) || "meta-llama/llama-3.3-70b-instruct:free", min_score: int(v?.min_score, 1, 10, 2) }),
};

let cache: { at: number; v: Cfg2 } | null = null;
export const invalidateCfg2 = () => { cache = null; };
export async function getCfg2(fresh = false): Promise<Cfg2> {
  if (!fresh && cache && Date.now() - cache.at < 20000) return cache.v;
  const raw = ((await db().ref("cfg2").get()).val() || {}) as Record<string, any>;
  const out: any = {};
  for (const k of Object.keys(CFG2_DEFAULTS) as (keyof Cfg2)[]) {
    const d: any = CFG2_DEFAULTS[k];
    let v: any = null;
    try { v = typeof raw[k] === "string" ? JSON.parse(raw[k]) : null; } catch {}
    if (v === null || v === undefined) out[k] = d;
    else if (Array.isArray(d)) out[k] = Array.isArray(v) ? v : d;
    else { const o: any = { ...d, ...v }; for (const sk of Object.keys(d)) if (d[sk] && typeof d[sk] === "object" && !Array.isArray(d[sk])) o[sk] = { ...d[sk], ...(v?.[sk] || {}) }; out[k] = o; }
  }
  cache = { at: Date.now(), v: out as Cfg2 };
  return cache.v;
}
export async function setCfg2<K extends keyof Cfg2>(key: K, value: any): Promise<Cfg2[K]> {
  const cur = await getCfg2(true);
  const clean = SECTIONS[key](value, cur[key] as any);
  await db().ref(`cfg2/${key}`).set(JSON.stringify(clean));
  invalidateCfg2();
  return clean as Cfg2[K];
}
export async function markSeasonPaid() { const c = await getCfg2(true); await db().ref("cfg2/collect").set(JSON.stringify({ ...c.collect, season: { ...c.collect.season, paid: true } })); invalidateCfg2(); }

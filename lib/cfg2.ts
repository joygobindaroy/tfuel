import { db } from "./firebase";

/** v18 admin-configurable options (stored at `cfg2`, separate from `settings`). Each section is sanitised on write. */
export interface Tier { n: number; pct: number }
export interface RigTier { id: string; name: string; emoji: string; price: number; rate: number }
export interface Collectible { id: string; name: string; emoji: string; image: string; price: number; supply: number; pts: number; max: number }
export interface Cosmetic { id: string; name: string; emoji: string; kind: "badge" | "frame"; price: number }
export interface Cfg2 {
  cosmetics: { enabled: boolean; items: Cosmetic[] };
  tiers: Tier[];
  contest: { enabled: boolean; name: string; prizes: number[] };
  autoconv: { enabled: boolean; options: number[] };
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
  autoconv: { enabled: false, options: [10, 25, 50] },
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
  cosmetics: (v) => ({
    enabled: bool(v?.enabled),
    items: (Array.isArray(v?.items) ? v.items : []).slice(0, 40).map((t: any, i: number) => ({ id: idOk(t?.id, "c" + (i + 1)), name: str(t?.name, 20) || "Item", emoji: str(t?.emoji, 4) || "✨", kind: t?.kind === "frame" ? "frame" : "badge", price: int(t?.price, 1, 1e10, 5000) })),
  }),
  tiers: (v) => {
    const a = (Array.isArray(v) ? v : []).map((t) => ({ n: int(t?.n, 1, 100000, 0), pct: num(t?.pct, 0, 50, 0) })).filter((t) => t.n > 0 && t.pct > 0).sort((x, y) => x.n - y.n).slice(0, 8);
    return a;
  },
  contest: (v) => ({ enabled: bool(v?.enabled), name: str(v?.name, 40) || "Invite contest", prizes: arrN(v?.prizes, 10) }),
  autoconv: (v) => ({ enabled: bool(v?.enabled), options: arrN(v?.options, 5, 100).filter((x) => x <= 100) }),
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
    else { out[k] = { ...d, ...v }; if (d.boss) out[k].boss = { ...d.boss, ...(v.boss || {}) }; if (d.season) out[k].season = { ...d.season, ...(v.season || {}) }; }
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

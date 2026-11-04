/** A person's own small settings (user_prefs/<uid>/pv). Some are enforced on the server (who may pay / request, name shown), the rest drive the app. */
export interface Pv {
  rx: "all" | "contacts" | "none"; // who may send me money
  rq: "all" | "contacts" | "none"; // whose payment requests I may pay
  sn: "nick" | "name" | "id"; // how I appear to the people I send to
  cf_t: number; cf_u: number; // ask once more for sends of this size (TFUEL / USDT), 0 = off
  ah: number; // auto-hide balance after N seconds idle, 0 = off
  to: number; // lock the app after N minutes idle, 0 = off
  ds: boolean; an: boolean; // data saver, no animations
  fs: "s" | "m" | "l";
  tf: "12" | "24";
  tz: number | null; // minutes from UTC, null = this phone
  da: "" | "tfuel" | "usdt"; // default asset in Send / Withdraw
  qa: string[]; // home quick buttons (max 4)
  wk: boolean; // weekly email summary
  rn: string; // default note for sends
}
export const QA_KEYS = ["send", "deposit", "withdraw", "daily", "spin", "history", "invite", "shops"];
export const PV_DEFAULT: Pv = { rx: "all", rq: "all", sn: "nick", cf_t: 0, cf_u: 0, ah: 0, to: 0, ds: false, an: false, fs: "m", tf: "24", tz: null, da: "", qa: [], wk: false, rn: "" };

const pick = <T extends string>(v: any, ok: readonly T[], d: T): T => (ok.includes(v) ? v : d);
const nn = (v: any, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(0, n)) : 0; };
export function pvClean(v: any, cur: Pv = PV_DEFAULT): Pv {
  const g = <K extends keyof Pv>(k: K) => (v && v[k] !== undefined ? v[k] : cur[k]);
  return {
    rx: pick(g("rx"), ["all", "contacts", "none"] as const, "all"),
    rq: pick(g("rq"), ["all", "contacts", "none"] as const, "all"),
    sn: pick(g("sn"), ["nick", "name", "id"] as const, "nick"),
    cf_t: Math.floor(nn(g("cf_t"), 1e13)), cf_u: Math.round(nn(g("cf_u"), 1e7) * 100) / 100,
    ah: [0, 15, 30, 60, 120].includes(Number(g("ah"))) ? Number(g("ah")) : 0,
    to: [0, 1, 5, 15, 30].includes(Number(g("to"))) ? Number(g("to")) : 0,
    ds: g("ds") === true, an: g("an") === true,
    fs: pick(g("fs"), ["s", "m", "l"] as const, "m"),
    tf: pick(g("tf"), ["12", "24"] as const, "24"),
    tz: g("tz") === null || g("tz") === undefined || g("tz") === "" ? null : Math.min(840, Math.max(-720, Math.round(Number(g("tz")) || 0))),
    da: pick(g("da"), ["", "tfuel", "usdt"] as const, ""),
    qa: (Array.isArray(g("qa")) ? (g("qa") as any[]) : []).filter((k) => QA_KEYS.includes(k)).filter((k, i, a) => a.indexOf(k) === i).slice(0, 4),
    wk: g("wk") === true,
    rn: String(g("rn") ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 60),
  };
}
/** Formats a time in the person's own style (used by receipts and e-mails) */
export function fmtWhen(ms: number, p: Pv): string {
  const off = (p.tz ?? 0) * 60000;
  const d = new Date(ms + off);
  const Y = d.getUTCFullYear(), M = String(d.getUTCMonth() + 1).padStart(2, "0"), D = String(d.getUTCDate()).padStart(2, "0");
  let h = d.getUTCHours(); const m = String(d.getUTCMinutes()).padStart(2, "0");
  let t = `${String(h).padStart(2, "0")}:${m}`;
  if (p.tf === "12") { const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; t = `${h}:${m} ${ap}`; }
  const z = p.tz === null ? "UTC" : `UTC${p.tz >= 0 ? "+" : "-"}${String(Math.floor(Math.abs(p.tz) / 60)).padStart(2, "0")}:${String(Math.abs(p.tz) % 60).padStart(2, "0")}`;
  return `${Y}-${M}-${D} ${t} ${z}`;
}

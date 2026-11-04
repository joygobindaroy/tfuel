import { useEffect, useState } from "react";
import { PV_DEFAULT, pvClean, fmtWhen, type Pv } from "./pvtypes";

/** The person's preferences on this phone (mirrors user_prefs/<uid>/pv; the server copy arrives with /api/me). */
const KEY = "tfuel_pv";
let cur: Pv = PV_DEFAULT;
const subs = new Set<(p: Pv) => void>();

export function readPv(): Pv {
  try { return pvClean(JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { return PV_DEFAULT; }
}
export function applyPv(p: Pv) {
  cur = p;
  try {
    const h = document.documentElement;
    h.classList.toggle("noanim", p.an);
    h.classList.toggle("ds", p.ds);
    h.classList.toggle("fs-s", p.fs === "s");
    h.classList.toggle("fs-l", p.fs === "l");
  } catch {}
  subs.forEach((f) => f(p));
}
export function setPvLocal(p: Pv) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
  applyPv(p);
}
export const getPvNow = () => cur;
export function usePv(): Pv {
  const [p, setP] = useState<Pv>(PV_DEFAULT);
  useEffect(() => { setP(cur === PV_DEFAULT ? readPv() : cur); subs.add(setP); return () => { subs.delete(setP); }; }, []);
  return p;
}
/** a time in the person's own style (12/24 h, own time zone) */
export function fmtDT(ms: number): string {
  const p = cur === PV_DEFAULT ? readPv() : cur;
  if (p.tz !== null) return fmtWhen(ms, p).replace(/ UTC.*$/, "");
  return new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: p.tf === "12" });
}

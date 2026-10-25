export type Theme = "light" | "dark" | "auto";
const KEY = "tfuel_theme";
export function getTheme(): Theme {
  try { const v = localStorage.getItem(KEY); return v === "dark" || v === "auto" ? v : "light"; } catch { return "light"; }
}
export function applyTheme(t: Theme = getTheme()) {
  if (typeof document === "undefined") return;
  let dark = t === "dark";
  if (t === "auto") {
    const tg = (window as any).Telegram?.WebApp?.colorScheme;
    dark = tg ? tg === "dark" : !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  }
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}
export function setTheme(t: Theme) {
  try { localStorage.setItem(KEY, t); } catch {}
  applyTheme(t);
}

/** Accent colour (stored on this device) */
export const ACCENTS: Record<string, { name: string; v: Record<string, string> }> = {
  gold: { name: "Gold", v: {} },
  blue: { name: "Blue", v: { "--gold1": "#6aa8ff", "--gold2": "#2563eb", "--brand": "#2563eb", "--brand-ink": "#0b2a66", "--on-brand": "#ffffff", "--brand-soft": "#e3edff", "--brand-softd": "rgba(59,130,246,.2)", "--brand-txd": "#a9c8ff" } },
  green: { name: "Green", v: { "--gold1": "#5fe08a", "--gold2": "#16a34a", "--brand": "#16a34a", "--brand-ink": "#073d1b", "--on-brand": "#ffffff", "--brand-soft": "#dcf7e5", "--brand-softd": "rgba(34,197,94,.2)", "--brand-txd": "#9be8b6" } },
  purple: { name: "Purple", v: { "--gold1": "#c58bff", "--gold2": "#8b2fe0", "--brand": "#8b2fe0", "--brand-ink": "#3b0a6b", "--on-brand": "#ffffff", "--brand-soft": "#f0e4ff", "--brand-softd": "rgba(168,85,247,.22)", "--brand-txd": "#ddbdff" } },
  rose: { name: "Rose", v: { "--gold1": "#ff8fa3", "--gold2": "#e11d48", "--brand": "#e11d48", "--brand-ink": "#6b0a22", "--on-brand": "#ffffff", "--brand-soft": "#ffe3e9", "--brand-softd": "rgba(244,63,94,.2)", "--brand-txd": "#ffb4c2" } },
  teal: { name: "Teal", v: { "--gold1": "#4fe3d0", "--gold2": "#0d9488", "--brand": "#0d9488", "--brand-ink": "#063d38", "--on-brand": "#ffffff", "--brand-soft": "#d8f6f2", "--brand-softd": "rgba(20,184,166,.2)", "--brand-txd": "#9ceee3" } },
};
const AKEY = "tfuel_accent";
export function getAccent(): string {
  try { const v = localStorage.getItem(AKEY) || "gold"; return ACCENTS[v] ? v : "gold"; } catch { return "gold"; }
}
export function applyAccent(a: string = getAccent()) {
  if (typeof document === "undefined") return;
  const st = document.documentElement.style;
  for (const k of ["--gold1", "--gold2", "--brand", "--brand-ink", "--on-brand", "--brand-soft", "--brand-softd", "--brand-txd"]) st.removeProperty(k);
  for (const [k, v] of Object.entries((ACCENTS[a] || ACCENTS.gold).v)) st.setProperty(k, v);
}
export function setAccent(a: string) {
  try { localStorage.setItem(AKEY, a); } catch {}
  applyAccent(a);
}

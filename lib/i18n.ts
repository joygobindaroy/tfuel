/**
 * Language: English (default) or Bangla. The app text is English in the code; for Bangla a small observer replaces
 * known texts on screen (text nodes and placeholders only, never the page structure). Changing the language reloads the app.
 * Text that is not in the list simply stays in English.
 */
export type Lang = "en" | "bn";
const KEY = "tfuel_lang";
export function getLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "bn" || v === "en") return v;
    const tg = (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code;
    return tg === "bn" ? "bn" : "en";
  } catch { return "en"; }
}
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l); } catch {}
  if (typeof location !== "undefined") location.reload();
}

import { BN } from "./i18n-bn";
const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const MAP: Record<string, string> = Object.fromEntries(Object.entries(BN).map(([k, v]) => [norm(k), v]));
export const tr = (s: string) => MAP[norm(s)] || s;

const orig = new WeakMap<Node, string>();
const SKIP = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "NOSCRIPT"]);
function node(n: Node) {
  if (n.nodeType === 3) {
    const p = n.parentElement;
    if (!p || SKIP.has(p.tagName)) return;
    const v = n.nodeValue || "";
    const t = norm(v);
    if (!t) return;
    const out = MAP[t];
    if (out && v.trim() !== out) { orig.set(n, v); n.nodeValue = v.replace(v.trim(), out); }
    return;
  }
  if (n.nodeType !== 1) return;
  const el = n as HTMLElement;
  if (SKIP.has(el.tagName)) return;
  for (const a of ["placeholder", "aria-label", "title"]) {
    const v = el.getAttribute?.(a);
    if (v && MAP[norm(v)]) el.setAttribute(a, MAP[norm(v)]);
  }
  el.childNodes.forEach(node);
}

let started = false;
/** Call once on the client. Does nothing for English. */
export function startTranslator() {
  if (started || typeof document === "undefined" || getLang() !== "bn") return;
  started = true;
  document.documentElement.lang = "bn";
  let queue = new Set<Node>();
  let raf = 0;
  const flush = () => { raf = 0; const q = queue; queue = new Set(); q.forEach((n) => { if (n.isConnected) node(n); }); };
  const push = (n: Node) => { queue.add(n); if (!raf) raf = requestAnimationFrame(flush); };
  node(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === "characterData") push(m.target);
      else if (m.type === "attributes") push(m.target);
      else m.addedNodes.forEach(push);
    }
  }).observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["placeholder", "aria-label", "title"] });
}

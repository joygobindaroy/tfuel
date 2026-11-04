/** Brand look used by the image routes (edge runtime can't read the database, so it asks /api/brandcfg and caches for a minute). */
export const BR = { label: "TFUEL", accent: "#f5a623", head: "Earn crypto\nevery day", foot: "" };
let at = 0;
export async function loadBr(reqUrl: string) {
  if (Date.now() - at < 60000) return BR;
  try {
    const r = await fetch(new URL("/api/brandcfg", reqUrl).toString(), { signal: AbortSignal.timeout(1500) });
    if (r.ok) { const j = await r.json(); BR.label = j.label || BR.label; BR.accent = j.accent || BR.accent; BR.head = j.head || BR.head; BR.foot = j.foot || ""; }
  } catch {}
  at = Date.now();
  return BR;
}

import type { NextApiRequest, NextApiResponse } from "next";
import { getCfg2 } from "@/lib/cfg2";

/** Public: only the look of cards and receipts (no secrets). */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  try { const b = (await getCfg2()).brand; res.json({ label: b.label, accent: b.accent, head: b.head, foot: b.foot }); }
  catch { res.json({}); }
}

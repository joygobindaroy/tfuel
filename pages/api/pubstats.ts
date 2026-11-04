import type { NextApiRequest, NextApiResponse } from "next";
import { pubStats } from "@/lib/v25";

/** Public numbers (only when the admin turned them on) */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  try { const s = await pubStats(); res.json(s ? { success: true, ...s } : { success: false }); } catch { res.json({ success: false }); }
}

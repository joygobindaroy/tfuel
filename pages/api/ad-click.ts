import type { NextApiRequest, NextApiResponse } from "next";
import { adClick } from "@/lib/ads";

/** Counts a click on a sponsor link and redirects to its (admin-approved) address. Only active orders can be opened. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const url = await adClick(String(req.query.id || "")).catch(() => null);
  if (!url) return void res.status(404).send("This promotion is no longer available.");
  res.setHeader("Cache-Control", "no-store");
  res.redirect(302, url);
}

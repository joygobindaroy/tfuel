import type { NextApiRequest, NextApiResponse } from "next";
import { apiKeyOk, extStats } from "@/lib/v23";
import { rateLimit } from "@/lib/api";

/** Read-only numbers for outside tools. Header: x-api-key (made in Admin → Growth & Games → Extras). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const key = String(req.headers["x-api-key"] || "");
    await rateLimit("ext_" + String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim().slice(0, 40), "ext", 30);
    if (!(await apiKeyOk(key))) return void res.status(401).json({ success: false, error: "bad_key" });
    res.setHeader("Cache-Control", "no-store");
    res.json({ success: true, ...(await extStats()) });
  } catch { res.status(500).json({ success: false }); }
}

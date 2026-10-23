import type { NextApiRequest, NextApiResponse } from "next";
import { getSettings } from "@/lib/settings";
import { healthSnapshot } from "@/lib/healthalerts";

let cache: { at: number; v: any } | null = null;
/** Public, no login: overall level + component states (cached 30 s). No user data. */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!cache || Date.now() - cache.at > 30000) cache = { at: Date.now(), v: await healthSnapshot(await getSettings()) };
    const { level, note, comps, at } = cache.v;
    res.setHeader("Cache-Control", "public, max-age=15");
    res.json({ success: true, level, note, comps, at });
  } catch {
    res.status(200).json({ success: true, level: "outage", note: "", comps: [{ name: "App & database", level: "outage", msg: "Not reachable" }], at: Date.now() });
  }
}

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/firebase";
import { getSettings } from "@/lib/settings";
import { createShopOrder, Shop } from "@/lib/shop";
import { HttpError } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";

/** Public pay button (used by /shop.js). Allowed only from the shop's own website (Origin check). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const origin = String(req.headers.origin || "");
  const pk = String(req.body?.pk || req.query.pk || "");
  const id = /^pk_[\w]{6,40}$/.test(pk) ? (await db().ref(`shop_pk/${pk}`).get()).val() : null;
  const shop = id ? ((await db().ref(`shops/${id}`).get()).val() as Shop | null) : null;
  if (shop && origin === shop.domain) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return void res.status(204).end();
  if (req.method !== "POST") return void res.status(405).json({ success: false, error: "POST only" });
  try {
    if (!shop || !id) throw new HttpError(404, "Unknown shop key");
    if (origin !== shop.domain) throw new HttpError(403, "This key works only on " + shop.domain);
    const s = await getSettings();
    if (!s.shops_enabled || !shop.enabled) throw new HttpError(503, "Shop payments are off");
    const b = req.body || {};
    const ref = String(b.ref || "") || "btn-" + Date.now().toString(36) + randomToken().slice(0, 6);
    const r = await createShopOrder(String(id), shop, s, { ref, usd: Number(b.amount), title: String(b.title || ""), ret: String(b.return_url || ""), sub: Number(b.sub_days) || 0 });
    res.json({ success: true, pay_url: r.pay_url, order_id: r.order_id });
  } catch (e: any) {
    res.status(e instanceof HttpError ? e.status : 500).json({ success: false, error: e instanceof HttpError ? e.message : "Server error" });
  }
}

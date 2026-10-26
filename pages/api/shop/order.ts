import { wrapShop, createShopOrder } from "@/lib/shop";

export const config = { api: { bodyParser: false } };

/** shop সার্ভার: নতুন পেমেন্ট অনুরোধ → user-কে পাঠানোর pay_url (একই ref দিলে একই order ফেরত) */
export default wrapShop(async ({ id, shop, body, s }, res) => {
  const uid = body.user_id === undefined || body.user_id === null ? undefined : String(body.user_id);
  const r = await createShopOrder(id, shop, s, { ref: String(body.ref || ""), usd: Number(body.amount), title: String(body.title || ""), uid, ret: String(body.return_url || ""), sub: Number(body.subscribe_days) || 0 });
  res.json({ success: true, ...r });
});

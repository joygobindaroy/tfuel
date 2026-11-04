import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { merchantGet, merchantSet, merchantPub, merchantLink, merchantSales } from "@/lib/v24";

/** Merchant QR: shop profile, public info for customers, sales list */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "v24", 40);
  await ensureUser(user, { soft: true });
  const a = String(req.body?.action || "");
  const b = req.body || {};
  switch (a) {
    case "me": return void res.json({ success: true, m: await merchantGet(user.id), link: await merchantLink(user.id), sales: await merchantSales(user.id) });
    case "set": { const m = await merchantSet(user.id, b); return void res.json({ success: true, m, link: await merchantLink(user.id), sales: await merchantSales(user.id) }); }
    case "pub": return void res.json({ success: true, ...(await merchantPub(String(b.code || ""))) });
  }
  throw new HttpError(400, "bad_action");
});

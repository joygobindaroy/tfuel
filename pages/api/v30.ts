import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { checkPin } from "@/lib/prefs";
import { pinGate } from "@/lib/v20";
import { getSettings } from "@/lib/settings";
import { packetNew, packetPeek, packetClaim, packetClose, packetList, catalogGet, catalogSet, cpnCheck, xTop, xAlertList, xAlertAdd, xAlertDel } from "@/lib/v30";

/** v30: red packets, shop items & coupons, top traders, rate alerts */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "v30", 40);
  await ensureUser(user, { soft: true });
  const b = req.body || {};
  const name = user.first_name || "User";
  const s = await getSettings();
  switch (String(b.action || "")) {
    case "pkNew": {
      const asset = b.asset === "usdt" ? "usdt" : "tfuel";
      const amt = Math.round(Number(b.amount) * (asset === "usdt" ? 1e6 : s.coins_per_tfuel));
      await pinGate(user.id, asset, amt, s);
      await checkPin(user.id, b.pin);
      return void res.json({ success: true, p: await packetNew({ id: user.id, name }, b, s), list: await packetList(user.id) });
    }
    case "pkList": return void res.json({ success: true, list: await packetList(user.id) });
    case "pkPeek": return void res.json({ success: true, p: await packetPeek(user.id, String(b.tok || "")) });
    case "pkClaim": return void res.json({ success: true, ...(await packetClaim(user.id, name, String(b.tok || ""), s)) });
    case "pkClose": { const back = await packetClose(String(b.tok || ""), user.id); return void res.json({ success: true, back, list: await packetList(user.id) }); }
    case "catGet": return void res.json({ success: true, ...(await catalogGet(user.id)) });
    case "catSet": return void res.json({ success: true, ...(await catalogSet(user.id, b)) });
    case "cpn": return void res.json({ success: true, ...(await cpnCheck(String(b.code || ""), String(b.cpn || ""))) });
    case "top": return void res.json({ success: true, ...(await xTop(user.id)) });
    case "alerts": return void res.json({ success: true, list: await xAlertList(user.id) });
    case "alertAdd": return void res.json({ success: true, list: await xAlertAdd(user.id, b) });
    case "alertDel": return void res.json({ success: true, list: await xAlertDel(user.id, String(b.id || "")) });
  }
  throw new HttpError(400, "bad_action");
});

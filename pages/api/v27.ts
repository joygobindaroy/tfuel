import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { xView, xQuote, xPlace, xProof, xCancel, hub, recentAmts, lowGet, lowSet, xStats } from "@/lib/v27";

/** Exchange (buy / sell USDT with the admin), pending hub, quick amounts, low-balance alert */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "v27", 40);
  await ensureUser(user, { soft: true });
  const a = String(req.body?.action || "");
  const b = req.body || {};
  switch (a) {
    case "view": return void res.json({ success: true, ...(await xView(user.id)) });
    case "quote": return void res.json({ success: true, q: await xQuote(user.id, b) });
    case "place": { const o = await xPlace(user.id, user.first_name || "User", b); return void res.json({ success: true, o, ...(await xView(user.id)) }); }
    case "proof": { const o = await xProof(user.id, String(b.id || ""), b.ref); return void res.json({ success: true, o, ...(await xView(user.id)) }); }
    case "cancel": { await xCancel(user.id, String(b.id || "")); return void res.json({ success: true, ...(await xView(user.id)) }); }
    case "hub": return void res.json({ success: true, ...(await hub(user.id)) });
    case "amts": return void res.json({ success: true, ...(await recentAmts(user.id)) });
    case "low": return void res.json({ success: true, low: await lowGet(user.id) });
    case "lowSet": return void res.json({ success: true, low: await lowSet(user.id, b) });
    case "trust": return void res.json({ success: true, stats: await xStats(user.id) });
  }
  throw new HttpError(400, "bad_action");
});

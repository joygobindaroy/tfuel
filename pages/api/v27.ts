import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { xDispute, merchantRefund, spending } from "@/lib/v28";
import { pinGate } from "@/lib/v20";
import { checkPin } from "@/lib/prefs";
import { getSettings } from "@/lib/settings";
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
    case "dispute": { await xDispute(user.id, user.first_name || "User", String(b.id || ""), b.text); return void res.json({ success: true, ...(await xView(user.id)) }); }
    case "refund": {
      const row = (await (await import("@/lib/firebase")).db().ref(`merchant_sales/${user.id}/${String(b.id || "")}`).get()).val() as any;
      if (!row) throw new HttpError(404, "not_found");
      const s = await getSettings();
      await pinGate(user.id, row.a, row.amt, s);
      await checkPin(user.id, b.pin);
      await merchantRefund(user.id, user.first_name || "Shop", String(b.id || ""));
      return void res.json({ success: true });
    }
    case "spend": { const s = await getSettings(); return void res.json({ success: true, ...(await spending(user.id, Math.min(365, Number(b.days) || 30), s.coins_per_tfuel)) }); }
    case "trust": return void res.json({ success: true, stats: await xStats(user.id) });
  }
  throw new HttpError(400, "bad_action");
});

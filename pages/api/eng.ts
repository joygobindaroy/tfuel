import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { giftList, giftSend, msClaim, creatorApply, passBuy, passClaim, plateBuy, tipSend } from "@/lib/eng";
import { clanAnnounce } from "@/lib/clan";

/** v19.1 user actions */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "eng", 40);
  const { u, settings: s } = await ensureUser(user);
  const b = req.body || {};
  const ok = (o: Record<string, any> = {}) => res.json({ success: true, ...o });
  const name = String(u.name || user.first_name || "Player");
  switch (String(b.action || "")) {
    case "gifts": return ok({ gifts: await giftList(user.id) });
    case "giftSend": { const r = await giftSend(user.id, name, String(b.to || "")); return ok({ ...r, gifts: await giftList(user.id) }); }
    case "msClaim": return ok({ coins: await msClaim(user.id, Math.floor(Number(b.n) || 0)) });
    case "creatorApply": await creatorApply(user.id, name, String(b.link || "").trim(), Math.floor(Number(b.subs) || 0)); return ok();
    case "passBuy": return ok({ until: await passBuy(user.id) });
    case "passClaim": return ok({ coins: await passClaim(user.id) });
    case "plateBuy": return ok({ plate: await plateBuy(user.id, String(b.text || "")) });
    case "tip": { const r = await tipSend(user.id, name, String(b.to || ""), Math.floor(Number(b.amount) || 0), s); return ok({ fee: r.fee }); }
    case "clanAnnounce": await clanAnnounce(user.id, String(b.text || "")); return ok();
    default: throw new HttpError(400, "bad_request");
  }
});

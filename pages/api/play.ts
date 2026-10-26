import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { miniView, memStart, memFlip, triStart, triAnswer, huntPlay, tourJoin, tourBoard } from "@/lib/mini";
import { vipView, vipBuy } from "@/lib/vip";
import { vipTrial } from "@/lib/plus";

/** Free mini games (memory / trivia / treasure hunt), free-entry tournaments and the VIP pass */
export default route(async (req, res) => {
  const a = String(req.body?.action || "view");
  const user = authenticate(req, a === "vipBuy" ? MAX_AUTH_AGE_MONEY : undefined);
  await rateLimit(user.id, "play", 120);
  await ensureUser(user);
  const b = req.body || {};
  switch (a) {
    case "view": return void res.json({ success: true, mini: await miniView(user.id), vip: await vipView(user.id) });
    case "memStart": return void res.json({ success: true, ...(await memStart(user.id)) });
    case "memFlip": return void res.json({ success: true, ...(await memFlip(user.id, String(b.id || ""), Number(b.idx))) });
    case "triStart": return void res.json({ success: true, ...(await triStart(user.id)) });
    case "triAnswer": return void res.json({ success: true, ...(await triAnswer(user.id, String(b.id || ""), Number(b.choice))) });
    case "hunt": return void res.json({ success: true, ...(await huntPlay(user.id, Number(b.tile))) });
    case "tourJoin": await tourJoin(user.id, String(b.id || "")); return void res.json({ success: true });
    case "tourBoard": return void res.json({ success: true, board: (await tourBoard(String(b.id || ""))).map(({ uid, ...r }) => ({ ...r, me: uid === user.id })) });
    case "vipTrial": return void res.json({ success: true, ...(await vipTrial(user.id)), vip: await vipView(user.id) });
    case "vipBuy": return void res.json({ success: true, ...(await vipBuy(user.id)), vip: await vipView(user.id) });
  }
  throw new HttpError(400, "bad_request");
});

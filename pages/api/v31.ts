import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { xChatList, xChatSend, purchaseList, quickList, recapGet, digestGet, digestSet } from "@/lib/v31";

/** v31: order chat, my purchases, quick send, monthly recap, weekly digest switch */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "v31", 40);
  await ensureUser(user, { soft: true });
  const b = req.body || {};
  switch (String(b.action || "")) {
    case "chat": return void res.json({ success: true, msgs: await xChatList(String(b.id || ""), user.id) });
    case "chatSend": return void res.json({ success: true, msgs: await xChatSend(user.id, user.first_name || "User", String(b.id || ""), b.text) });
    case "purchases": return void res.json({ success: true, ...(await purchaseList(user.id)) });
    case "quick": return void res.json({ success: true, list: await quickList(user.id) });
    case "recap": return void res.json({ success: true, r: await recapGet(user.id, b.which === "prev" ? "prev" : "cur") });
    case "digest": return void res.json({ success: true, on: await digestGet(user.id) });
    case "digestSet": return void res.json({ success: true, on: await digestSet(user.id, !!b.on) });
  }
  throw new HttpError(400, "bad_action");
});

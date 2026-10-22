import { authenticate } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { claimJoin } from "@/lib/taskclaim";

/** telegram_join: getChatMember দিয়ে যাচাই, তারপর এককালীন পুরস্কার */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "verify-telegram", 10);
  const r = await claimJoin(user, String(req.body?.taskId || ""));
  res.json({ success: true, reward: r.reward, newBalance: r.newBalance });
});

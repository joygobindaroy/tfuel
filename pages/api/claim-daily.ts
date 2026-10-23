import { authenticate } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { claimDaily } from "@/lib/daily";

/** প্রতিদিন (UTC) একবার; পরপর দিনে streak বাড়ে, একদিন বাদ গেলে ১ থেকে শুরু */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "claim-daily", 10);
  const { settings: s } = await ensureUser(user);
  const out = await claimDaily(user.id, s);
  res.json({ success: true, ...out });
});

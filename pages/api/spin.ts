import { authenticate } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { doSpin } from "@/lib/spin";

/** Lucky Spin: প্রথমে free, তারপর ad দেখে পাওয়া extra spin। পুরস্কার server ঠিক করে (weight অনুযায়ী)। */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "spin", 20);
  const { settings: s } = await ensureUser(user);
  res.json({ success: true, ...(await doSpin(user.id, s)) });
});

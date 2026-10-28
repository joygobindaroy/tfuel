import { authenticate } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { VERSION } from "@/lib/version";
import { vnum } from "@/lib/v20";

/** "What's new" popup was read: remember the version */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "seen", 20);
  await db().ref(`user_prefs/${user.id}/seen_v`).set(vnum(VERSION));
  res.json({ success: true });
});

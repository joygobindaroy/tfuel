import { authenticate } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { getSettings } from "@/lib/settings";
import { reqCtx } from "@/lib/reqctx";
import { secLog } from "@/lib/seclog";

/** Terms & Privacy-তে সম্মতি (বর্তমান version সেভ হয়) */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "terms", 10);
  const s = await getSettings();
  await db().ref(`user_prefs/${user.id}/terms_v`).set(s.terms_version);
  await secLog(user.id, "terms_accepted", reqCtx(req), `v${s.terms_version}`);
  res.json({ success: true });
});

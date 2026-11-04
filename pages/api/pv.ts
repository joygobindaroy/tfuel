import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { pvGet, pvSet } from "@/lib/pv";
import { checkPin } from "@/lib/prefs";
import { db } from "@/lib/firebase";

/** My preferences (get / set) and the app-lock unlock check */
export default route(async (req, res) => {
  const user = authenticate(req);
  const b = req.body || {};
  const act = String(b.action || "get");
  if (act === "get") return void res.json({ success: true, pv: await pvGet(user.id) });
  if (act === "set") {
    await rateLimit(user.id, "pv_set", 30);
    return void res.json({ success: true, pv: await pvSet(user.id, b.pv || {}) });
  }
  if (act === "unlock") {
    await rateLimit(user.id, "pv_unlock", 20);
    const has = (await db().ref(`user_prefs/${user.id}/pin`).get()).exists();
    if (has) await checkPin(user.id, b.pin);
    return void res.json({ success: true, pin: has });
  }
  throw new HttpError(400, "bad_request");
});

import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { retentionState, claimRetention, buyFreeze, recoverStreak } from "@/lib/retention";
import { db } from "@/lib/firebase";
import type { UserRecord } from "@/lib/user";

/** Retention hub: state + claims (achievements, comeback, anniversary, event, weekly) + streak freeze/recovery */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "retention", 40);
  const { settings: s } = await ensureUser(user);
  const b = req.body || {};
  const action = String(b.action || "get");
  let extra: Record<string, any> = {};
  if (action === "claim") extra = await claimRetention(user.id, String(b.kind || ""), String(b.id || ""), s);
  else if (action === "buyFreeze") extra = await buyFreeze(user.id, s);
  else if (action === "recover") extra = await recoverStreak(user.id, s);
  else if (action !== "get") throw new HttpError(400, "bad_request");
  const u = (await db().ref(`users/${user.id}`).get()).val() as UserRecord;
  res.json({ success: true, ...extra, state: await retentionState(user.id, u, s) });
});

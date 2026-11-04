import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { ensureUser } from "@/lib/user";
import { comboView, comboClaim, bdayGet, bdaySet, tourHistory, milestone, aliasGet, aliasSet, limitsList, limitSet } from "@/lib/v25";

/** User tools: daily combo, birthday, game history, milestone card, custom invite link, per-contact limits */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "v25", 40);
  await ensureUser(user, { soft: true });
  const a = String(req.body?.action || "");
  const b = req.body || {};
  switch (a) {
    case "combo": return void res.json({ success: true, combo: await comboView(user.id) });
    case "comboClaim": { const bonus = await comboClaim(user.id); return void res.json({ success: true, bonus, combo: await comboView(user.id) }); }
    case "bday": return void res.json({ success: true, bday: await bdayGet(user.id) });
    case "bdaySet": return void res.json({ success: true, bday: await bdaySet(user.id, b.date) });
    case "tours": return void res.json({ success: true, list: await tourHistory(user.id) });
    case "milestone": return void res.json({ success: true, ...(await milestone(user.id)) });
    case "alias": return void res.json({ success: true, alias: await aliasGet(user.id), creator: !!(await db().ref(`users/${user.id}/creator`).get()).val() });
    case "aliasSet": return void res.json({ success: true, alias: await aliasSet(user.id, b.alias) });
    case "limits": return void res.json({ success: true, list: await limitsList(user.id) });
    case "limitSet": await limitSet(user.id, String(b.code || ""), b.tfuel, b.usdt); return void res.json({ success: true, list: await limitsList(user.id) });
  }
  throw new HttpError(400, "bad_action");
});

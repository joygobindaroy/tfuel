import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { getCfg2 } from "@/lib/cfg2";
import { blockList, blockSet, tplGet, tplSet, muteGet, muteSet, fbSubmit, fbAsk, pollsFor, pollVote, reportUser } from "@/lib/v22";

/** User tools: block list, note templates, mute switches, help center, feedback, polls, report a user */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "v22", 40);
  await ensureUser(user, { soft: true });
  const a = String(req.body?.action || "");
  const b = req.body || {};
  switch (a) {
    case "blocks": return void res.json({ success: true, list: await blockList(user.id) });
    case "block": await blockSet(user.id, String(b.code || ""), b.on !== false); return void res.json({ success: true, list: await blockList(user.id) });
    case "tpl": return void res.json({ success: true, list: await tplGet(user.id) });
    case "tplSet": return void res.json({ success: true, list: await tplSet(user.id, b.list) });
    case "mute": return void res.json({ success: true, ...(await muteGet(user.id)) });
    case "muteSet": return void res.json({ success: true, ...(await muteSet(user.id, b)) });
    case "help": return void res.json({ success: true, list: (await getCfg2()).v22.help });
    case "fbAsk": return void res.json({ success: true, ask: await fbAsk(user.id) });
    case "fb": await fbSubmit(user.id, String(b.kind || "app"), b.stars, String(b.text || ""), String(b.ticket || "")); return void res.json({ success: true });
    case "polls": return void res.json({ success: true, list: await pollsFor(user.id) });
    case "vote": await pollVote(user.id, String(b.id || ""), b.answers); return void res.json({ success: true, list: await pollsFor(user.id) });
    case "report": await rateLimit(user.id, "v22_report", 5); await reportUser(user.id, String(b.code || ""), String(b.reason || "")); return void res.json({ success: true });
  }
  throw new HttpError(400, "bad_action");
});

import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser, MAX_AUTH_AGE_MONEY } from "@/lib/user";
import { getCfg2 } from "@/lib/cfg2";
import { getSettings } from "@/lib/settings";
import { getRefCode } from "@/lib/refcode";
import { exportData, deleteAccount, inviteTree, friendsBoard } from "@/lib/v21";

/** Account tools: data export, delete account, invite tree, friends-only board */
export default route(async (req, res) => {
  const a = String(req.body?.action || "");
  const user = authenticate(req, a === "delete" || a === "export" ? MAX_AUTH_AGE_MONEY : undefined);
  await rateLimit(user.id, "v21", 20);
  await ensureUser(user, { soft: true });
  const c = await getCfg2();
  if (a === "export") { await rateLimit(user.id, "v21_export", 3); return void res.json({ success: true, data: await exportData(user.id) }); }
  if (a === "delete") { await rateLimit(user.id, "v21_del", 3); await deleteAccount(user.id, req.body?.pin, String(req.body?.confirm || ""), !!req.body?.ack); return void res.json({ success: true }); }
  if (a === "tree") { if (!c.v21.tree) throw new HttpError(403, "feature_off:Invite tree is turned off."); return void res.json({ success: true, ...(await inviteTree(user.id)) }); }
  if (a === "board") { if (!c.v21.friends_board) throw new HttpError(403, "feature_off:Friends board is turned off."); const b = String(req.body?.board || "w"); return void res.json({ success: true, list: await friendsBoard(user.id, b === "d" ? "d" : b === "all" ? "all" : "w") }); }
  if (a === "tiplink") { const base = (await getSettings()).referral_link; const code = await getRefCode(user.id); return void res.json({ success: true, link: base ? `${base.replace(/\?.*$/, "")}?startapp=tip_${code}` : "" }); }
  throw new HttpError(400, "bad_action");
});

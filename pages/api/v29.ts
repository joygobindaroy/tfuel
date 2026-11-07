import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { checkPin } from "@/lib/prefs";
import { vaultList, vaultLock, vaultOpen, panicState, panicOn, panicOff, emgSet, emgClear, emgAsk, emgPending, emgApprove, contestView } from "@/lib/v29";

/** v29: savings vault, panic button, emergency contact, referral contest */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "v29", 40);
  await ensureUser(user, { soft: true });
  const b = req.body || {};
  const name = user.first_name || "User";
  switch (String(b.action || "")) {
    case "vault": return void res.json({ success: true, v: await vaultList(user.id) });
    case "vaultLock": { await checkPin(user.id, b.pin); return void res.json({ success: true, v: await vaultLock(user.id, b) }); }
    case "vaultOpen": return void res.json({ success: true, v: await vaultOpen(user.id, String(b.id || "")) });
    case "panic": return void res.json({ success: true, p: await panicState(user.id) });
    case "panicOn": return void res.json({ success: true, p: await panicOn(user.id, name) });
    case "panicOff": return void res.json({ success: true, p: await panicOff(user.id, b.code) });
    case "emgSet": { await checkPin(user.id, b.pin); return void res.json({ success: true, p: await emgSet(user.id, b.code) }); }
    case "emgClear": return void res.json({ success: true, p: await emgClear(user.id) });
    case "emgAsk": return void res.json({ success: true, p: await emgAsk(user.id, name) });
    case "emgPending": return void res.json({ success: true, list: await emgPending(user.id) });
    case "emgApprove": { await emgApprove(user.id, String(b.uid || "")); return void res.json({ success: true, list: await emgPending(user.id) }); }
    case "contest": return void res.json({ success: true, c: await contestView(user.id) });
  }
  throw new HttpError(400, "bad_action");
});

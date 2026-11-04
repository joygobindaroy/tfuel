import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { goalGet, goalSet, bioGet, bioSet, drawView, drawJoin } from "@/lib/v23";

/** User tools: savings goal, short bio, free lucky draw */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "v23", 40);
  await ensureUser(user, { soft: true });
  const a = String(req.body?.action || "");
  const b = req.body || {};
  switch (a) {
    case "goal": return void res.json({ success: true, goal: await goalGet(user.id) });
    case "goalSet": return void res.json({ success: true, goal: await goalSet(user.id, b.name, b.target) });
    case "bio": return void res.json({ success: true, bio: await bioGet(user.id) });
    case "bioSet": return void res.json({ success: true, bio: await bioSet(user.id, b.text) });
    case "draw": return void res.json({ success: true, draw: await drawView(user.id) });
    case "drawJoin": await drawJoin(user.id); return void res.json({ success: true, draw: await drawView(user.id) });
  }
  throw new HttpError(400, "bad_action");
});

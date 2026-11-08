import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { ensureUser } from "@/lib/user";
import { invCreate, invList, invCancel, invPub, tippGet, tippSet, tippLink, tippPub, learnList, learnOpen, learnDone, recNew, recLeft, recUse, kycGet, kycSubmit } from "@/lib/v26";

/** User tools: invoices, donation page, lessons, recovery codes, identity check */
export default route(async (req, res) => {
  const a = String(req.body?.action || "");
  const user = authenticate(req, a === "recNew" || a === "recUse" ? 600 : undefined);
  await rateLimit(user.id, "v26", 40);
  await ensureUser(user, { soft: true });
  const b = req.body || {};
  switch (a) {
    case "invList": return void res.json({ success: true, list: await invList(user.id) });
    case "invNew": { const id = await invCreate(user.id, b.title, b.amt, b.asset, b.days, b.due); return void res.json({ success: true, id, list: await invList(user.id) }); }
    case "invCancel": await invCancel(user.id, String(b.id || "")); return void res.json({ success: true, list: await invList(user.id) });
    case "invPub": return void res.json({ success: true, ...(await invPub(String(b.id || ""))) });
    case "tipp": return void res.json({ success: true, t: await tippGet(user.id), link: await tippLink(user.id) });
    case "tippSet": return void res.json({ success: true, t: await tippSet(user.id, b), link: await tippLink(user.id) });
    case "tippPub": return void res.json({ success: true, ...(await tippPub(String(b.code || ""))) });
    case "learn": return void res.json({ success: true, list: await learnList(user.id) });
    case "learnOpen": await learnOpen(user.id, String(b.id || "")); return void res.json({ success: true });
    case "learnDone": { const reward = await learnDone(user.id, String(b.id || "")); return void res.json({ success: true, reward, list: await learnList(user.id) }); }
    case "recLeft": return void res.json({ success: true, left: await recLeft(user.id) });
    case "recNew": await rateLimit(user.id, "v26_rec", 3); return void res.json({ success: true, codes: await recNew(user.id, b.pin) });
    case "recUse": await rateLimit(user.id, "v26_recuse", 5); await recUse(user.id, b.code); return void res.json({ success: true });
    case "kyc": return void res.json({ success: true, ...(await kycGet(user.id)) });
    case "kycSubmit": await rateLimit(user.id, "v26_kyc", 5); await kycSubmit(user.id, b.link, b.note); return void res.json({ success: true, ...(await kycGet(user.id)) });
  }
  throw new HttpError(400, "bad_action");
});

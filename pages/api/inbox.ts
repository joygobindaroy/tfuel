import { authenticate } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";

const KEEP = 30;

/** অ্যাপের ভেতরের বার্তা (🔔): get = সাম্প্রতিক ৩০টা, read = সব পড়া হয়েছে */
export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "inbox", 30);
  const base = `inbox/${user.id}`;
  const act = String(req.body?.action || "get");
  if (act === "clear") { await db().ref(base).remove(); await db().ref(`inbox_meta/${user.id}/unread`).set(0); return void res.json({ success: true, unread: 0, items: [] }); }
  if (act === "del") { const id = String(req.body?.id || ""); if (/^[-\w]{6,40}$/.test(id)) await db().ref(`${base}/${id}`).remove(); }
  const all = ((await db().ref(base).orderByKey().limitToLast(KEEP + 20).get()).val() || {}) as Record<string, { m: string; at: number }>;
  const keys = Object.keys(all).sort().reverse();
  const old = keys.slice(KEEP);
  if (old.length) await db().ref().update(Object.fromEntries(old.map((k) => [`${base}/${k}`, null]))).catch(() => {});
  const unread = Number((await db().ref(`inbox_meta/${user.id}/unread`).get()).val()) || 0;
  if (String(req.body?.action || "get") === "read") await db().ref(`inbox_meta/${user.id}/unread`).set(0);
  res.json({ success: true, unread: String(req.body?.action) === "read" ? 0 : unread, items: keys.slice(0, KEEP).map((k) => ({ id: k, m: all[k].m, at: all[k].at })) });
});

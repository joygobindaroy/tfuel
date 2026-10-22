import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { earn, activity, lbAdd } from "@/lib/wallet";
import { ensureUser, newUser, UserRecord, MAX_AUTH_AGE_MONEY } from "@/lib/user";

/** Invite milestone: বন্ধুর সংখ্যা lক্ষ্যে পৌঁছালে একবারই bonus */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "claim-milestone", 20);
  const { settings: s } = await ensureUser(user);
  const count = Math.floor(Number(req.body?.count));
  const m = s.milestones.find((x) => x.count === count);
  if (!m) throw new HttpError(404, "not_found");
  let err = "";
  let bonus = 0;
  let balance = 0;
  await db()
    .ref(`users/${user.id}`)
    .transaction((cur: UserRecord | null) => {
      err = "";
      if (cur === null) return newUser();
      if ((cur.ref_count || 0) < m.count) { err = "not_reached"; return; }
      if (cur.ms_claimed?.[String(m.count)]) { err = "already_claimed"; return; }
      cur.ms_claimed = { ...(cur.ms_claimed || {}), [String(m.count)]: Date.now() };
      cur.balance += m.bonus;
      earn(cur, "referral", m.bonus);
      bonus = m.bonus;
      balance = cur.balance;
      return cur;
    });
  if (err) throw new HttpError(409, err);
  await lbAdd(user.id, bonus);
  await activity(user.id, "referral", { coins: bonus, note: `${m.count} friends milestone` });
  res.json({ success: true, bonus, balance });
});

import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { dayKey } from "@/lib/log";
import { earn, activity, lbAdd } from "@/lib/wallet";
import { dailyMult } from "@/lib/retention";
import { ensureUser, newUser, MAX_AUTH_AGE_MONEY, UserRecord } from "@/lib/user";

/** প্রতিদিন (UTC) একবার; পরপর দিনে streak বাড়ে, একদিন বাদ গেলে ১ থেকে শুরু */
export default route(async (req, res) => {
  const user = authenticate(req, MAX_AUTH_AGE_MONEY);
  await rateLimit(user.id, "claim-daily", 10);
  const { settings: s } = await ensureUser(user);
  if (!s.daily_enabled) throw new HttpError(403, "daily_disabled");
  const now = Date.now();
  const today = dayKey(now);
  const yesterday = dayKey(now - 86400000);

  let err = "";
  let saved = 0;
  let out = { reward: 0, streak: 0, balance: 0, saved: 0 };
  await db()
    .ref(`users/${user.id}`)
    .transaction((cur: UserRecord | null) => {
      err = "";
      if (cur === null) return newUser();
      if (cur.daily?.day === today) {
        err = "already_claimed_today";
        return;
      }
      let streak = 1;
      if (cur.daily?.day === yesterday) streak = cur.daily.streak + 1;
      else if (cur.daily?.day) {
        // missed whole days: a streak freeze covers each one
        const missed = Math.max(1, Math.round((Date.parse(today.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")) - Date.parse(cur.daily.day.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"))) / 86400000) - 1);
        const fr = (cur as any).freezes || 0;
        if (s.streak_freeze_enabled && fr >= missed) { (cur as any).freezes = fr - missed; streak = cur.daily.streak + 1; saved = missed; }
        else if (cur.daily.streak >= 3) (cur as any).streak_lost = { streak: cur.daily.streak, at: now };
      }
      const reward = Math.floor((s.daily_rewards[(streak - 1) % s.daily_rewards.length] || 0) * dailyMult(s, now));
      cur.daily = { day: today, streak };
      cur.balance += reward;
      earn(cur, "daily", reward);
      out = { reward, streak, balance: cur.balance, saved: 0 };
      return cur;
    });
  if (err) throw new HttpError(409, err);
  out.saved = saved;
  await lbAdd(user.id, out.reward);
  await activity(user.id, "daily", { coins: out.reward, note: `Day ${out.streak}` });
  res.json({ success: true, ...out });
});

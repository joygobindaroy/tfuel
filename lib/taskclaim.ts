import { HttpError } from "./auth";
import { db } from "./firebase";
import { earn, activity, lbAdd } from "./wallet";
import { ensureUser, qualifyReferral, newUser, UserRecord } from "./user";
import { tgCall } from "./telegram";
import type { TgUser } from "./auth";

const OK_STATUSES = new Set(["member", "administrator", "creator"]);

/** telegram_join: getChatMember দিয়ে যাচাই, তারপর transaction-এ এককালীন পুরস্কার (অ্যাপ ও bot দুই জায়গা থেকেই) */
export async function claimJoin(user: TgUser, taskId: string): Promise<{ reward: number; newBalance: number }> {
  if (!/^[\w-]{1,64}$/.test(taskId)) throw new HttpError(400, "Invalid taskId");
  const task = (await db().ref(`tasks/${taskId}`).get()).val();
  if (!task || task.type !== "telegram_join") throw new HttpError(404, "Task not found");
  await ensureUser(user);
  const already = (await db().ref(`users/${user.id}/completed_tasks/${taskId}/claimed`).get()).val();
  if (already) throw new HttpError(409, "Already claimed");

  const tg = await tgCall("getChatMember", { chat_id: task.channel_id, user_id: user.id });
  if (!tg.ok) {
    await db().ref(`diagnostics/telegram/${taskId}`).set({ at: Date.now(), channel: task.channel_id, title: task.title || "", reason: String(tg.description || "unknown") }).catch(() => {});
    throw new HttpError(502, "verify_unavailable");
  }
  if (!OK_STATUSES.has(tg.result?.status)) throw new HttpError(403, "not_joined");

  let failure = false;
  const result = await db().ref(`users/${user.id}`).transaction((cur: UserRecord | null) => {
    if (cur === null) return newUser();
    failure = false;
    if (cur.completed_tasks?.[taskId]?.claimed) { failure = true; return; }
    cur.completed_tasks = cur.completed_tasks || {};
    cur.completed_tasks[taskId] = { claimed: true, claimed_at: Date.now() };
    cur.balance += Number(task.reward) || 0;
    earn(cur, "tasks", Number(task.reward) || 0);
    return cur;
  });
  if (!result.committed || failure) throw new HttpError(409, "Already claimed");
  await lbAdd(user.id, Number(task.reward) || 0);
  await activity(user.id, "task", { coins: Number(task.reward) || 0, note: String(task.title || "").slice(0, 60) });
  await qualifyReferral(user.id);
  return { reward: Number(task.reward) || 0, newBalance: (result.snapshot.val() as UserRecord).balance };
}

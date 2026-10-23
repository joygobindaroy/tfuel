import { getSettings } from "./settings";
import { startBroadcast } from "./broadcast";

/** New task → users who switched on "New task alerts" (bot Settings or app Settings) get a message with an Open button. Sent in batches by the broadcast pump. */
export async function announceTask(title: string, rewardCoins: number) {
  const s = await getSettings();
  if (!s.notify_enabled) return null;
  const tf = (rewardCoins / Math.max(1, s.coins_per_tfuel)).toLocaleString("en-US", { maximumFractionDigits: 3 });
  return startBroadcast({ text: `📝 New task: ${title} — +${tf} TFUEL`, url: s.referral_link ? `${s.referral_link}?startapp=go_tasks` : undefined, btn: "✅ Open tasks", aud: { kind: "tasks" }, inbox: true }, "system");
}

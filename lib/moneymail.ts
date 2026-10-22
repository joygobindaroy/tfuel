import { db } from "./firebase";
import { getSettings } from "./settings";
import { mailUser } from "./emailcode";
import type { Tone } from "./mailtpl";

export type MoneyKind = "deposit" | "deposit_rejected" | "trade" | "order" | "stake_ready" | "stake_paid" | "shop" | "shop_refund" | "sent" | "received" | "prize";
const META: Record<MoneyKind, { subject: string; title: string; intro: string; tone: Tone }> = {
  deposit: { subject: "[TFUEL] Deposit received", title: "Your deposit was credited", intro: "Funds were added to your TFUEL wallet.", tone: "success" },
  deposit_rejected: { subject: "[TFUEL] Deposit rejected", title: "Your deposit was rejected", intro: "We could not accept this deposit.", tone: "danger" },
  trade: { subject: "[TFUEL] Trade completed", title: "Your trade was completed", intro: "A trade on your wallet was executed.", tone: "info" },
  order: { subject: "[TFUEL] Limit order filled", title: "Your limit order was filled", intro: "A limit order you placed was executed at your price.", tone: "success" },
  stake_ready: { subject: "[TFUEL] Your stake is ready", title: "Your stake has matured", intro: "Open the app to claim your principal and reward.", tone: "success" },
  stake_paid: { subject: "[TFUEL] Stake claimed", title: "Your stake was paid out", intro: "Principal and reward were added to your balance.", tone: "success" },
  shop: { subject: "[TFUEL] Shop payment", title: "You paid a partner shop", intro: "A payment from your wallet was sent to a shop.", tone: "info" },
  shop_refund: { subject: "[TFUEL] Shop refund", title: "A refund was added to your wallet", intro: "A shop order was refunded.", tone: "success" },
  sent: { subject: "[TFUEL] You sent TFUEL", title: "You sent TFUEL", intro: "A transfer left your wallet.", tone: "warn" },
  received: { subject: "[TFUEL] You received TFUEL", title: "You received TFUEL", intro: "A friend sent TFUEL to your wallet.", tone: "success" },
  prize: { subject: "[TFUEL] Prize received", title: "You won a leaderboard prize", intro: "Your prize was added to your balance.", tone: "success" },
};

/** লেনদেনের ইমেইল: admin "email_money" চালু + user বন্ধ না করলে + verified email থাকলে। best-effort */
export async function mailMoney(uid: string, kind: MoneyKind, rows: [string, string][], extra: { intro?: string } = {}) {
  try {
    const s = await getSettings();
    if (!s.email_money) return;
    if ((await db().ref(`user_prefs/${uid}/mail_money`).get()).val() === false) return;
    const m = META[kind];
    await mailUser(uid, m.subject, { title: m.title, intro: extra.intro || m.intro, tone: m.tone, rows: [...rows, ["Time", new Date().toISOString().replace("T", " ").slice(0, 19) + " (UTC)"]], warning: kind === "sent" ? "If you didn't make this transfer, contact support immediately." : undefined });
  } catch (e) {
    console.error("mailMoney", e);
  }
}
export const tfStr = (coins: number, cpt: number) => `${(coins / cpt).toLocaleString("en-US", { maximumFractionDigits: 6 })} TFUEL`;

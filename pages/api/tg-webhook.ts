import type { NextApiRequest, NextApiResponse } from "next";
import { ServerValue } from "firebase-admin/database";
import { db } from "@/lib/firebase";
import { sha256, sortableId } from "@/lib/crypto";
import { tgCall, webhookSecret } from "@/lib/telegram";
import { notify } from "@/lib/notify";
import { activity } from "@/lib/wallet";
import { adminLog } from "@/lib/log";
import { fromU } from "@/lib/market";
import { getSettings } from "@/lib/settings";
import { handleBot } from "@/lib/bot";
import { settleStars } from "@/lib/stars";

/** Telegram → bot webhook: Stars পেমেন্ট (pre_checkout_query + successful_payment) ও /start */

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return void res.status(405).end();
  if (!process.env.BOT_TOKEN || req.headers["x-telegram-bot-api-secret-token"] !== webhookSecret()) return void res.status(401).end();
  const u = req.body || {};
  try {
    if (u.pre_checkout_query) {
      const q = u.pre_checkout_query;
      const o = (await db().ref(`stars_orders/${String(q.invoice_payload || "")}`).get()).val();
      const ok = q.currency === "XTR" && o && o.status === "open" && String(o.uid) === String(q.from?.id) && Number(q.total_amount) === o.stars && (await getSettings()).stars_enabled;
      await tgCall("answerPreCheckoutQuery", ok ? { pre_checkout_query_id: q.id, ok: "true" } : { pre_checkout_query_id: q.id, ok: "false", error_message: "This payment is no longer valid. Please start again." });
    } else if (u.message?.successful_payment) {
      await creditStars(u.message.from?.id, u.message.successful_payment);
    } else {
      await handleBot(u).catch((e) => console.error("bot ui", e)); // বার্তার ভুলে Telegram retry-র দরকার নেই
    }
  } catch (e) {
    console.error("tg-webhook", e);
    return void res.status(500).end(); // Telegram আবার পাঠাবে; credit idempotent
  }
  res.json({ ok: true });
}

/** একই পেমেন্ট দুইবার credit হয় না (order-এর credited তালা) */
export async function creditStars(fromId: any, p: any) {
  if (p.currency !== "XTR") return;
  await settleStars(String(p.invoice_payload || ""), { fromId, total: Number(p.total_amount), charge: String(p.telegram_payment_charge_id || "") });
}

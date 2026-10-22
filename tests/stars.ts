import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
import assert from "node:assert/strict";
let txs: any[] = [];
(globalThis as any).fetch = async (url: string) => {
  const u = new URL(url);
  const m = u.pathname.split("/").pop();
  if (m === "getStarTransactions") return { json: async () => ({ ok: true, result: { transactions: txs } }) };
  return { json: async () => ({ ok: true, result: {} }) };
};
(async () => {
  const { db } = await import("../lib/firebase");
  const { settleStars, healStars } = await import("../lib/stars");
  const { creditStars } = await import("../pages/api/tg-webhook");
  await db().ref("users/5").set({ name: "A", balance: 0, usdt_u: 0 });
  await db().ref("stars_orders/o1").set({ uid: "5", usdt_u: 10000, stars: 1, status: "open", created_at: Date.now() - 120000 });
  // wrong amount / wrong user rejected
  assert.equal(await settleStars("o1", { fromId: "5", total: 2, charge: "c1" }), "invalid");
  assert.equal(await settleStars("o1", { fromId: "6", total: 1, charge: "c1" }), "invalid");
  // webhook path credits once
  await creditStars(5, { currency: "XTR", invoice_payload: "o1", total_amount: 1, telegram_payment_charge_id: "c1" });
  await creditStars(5, { currency: "XTR", invoice_payload: "o1", total_amount: 1, telegram_payment_charge_id: "c1" });
  assert.equal((await db().ref("users/5/usdt_u").get()).val(), 10000);
  // heal path: webhook lost
  await db().ref("stars_orders/o2").set({ uid: "5", usdt_u: 50000, stars: 4, status: "open", created_at: Date.now() - 120000 });
  assert.equal(await healStars("o2"), false);
  txs = [{ id: "tx9", amount: 4, source: { type: "user", user: { id: 5 }, invoice_payload: "o2" } }];
  assert.equal(await healStars("o2"), true);
  assert.equal(await healStars("o2"), true); // already credited, no double
  assert.equal((await db().ref("users/5/usdt_u").get()).val(), 60000);
  // someone else's payload cannot credit
  await db().ref("stars_orders/o3").set({ uid: "5", usdt_u: 90000, stars: 9, status: "open", created_at: Date.now() });
  txs = [{ id: "tx10", amount: 9, source: { type: "user", user: { id: 77 }, invoice_payload: "o3" } }];
  assert.equal(await healStars("o3"), false);
  console.log("stars OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

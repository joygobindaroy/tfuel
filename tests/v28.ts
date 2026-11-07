import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://x.app";
process.env.NEXT_PUBLIC_BOT_LINK = "https://t.me/mybot/app";
process.env.ADMIN_TELEGRAM_IDS = "999";
import assert from "node:assert/strict";
const calls: string[] = [];
(globalThis as any).fetch = async (u: string) => {
  const s = String(u);
  calls.push(decodeURIComponent(s.replace(/\+/g, " ")));
  if (s.includes("open.er-api.com")) return { ok: true, status: 200, json: async () => ({ rates: { BDT: 120 } }) };
  return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) };
};
(async () => {
  const { db } = await import("../lib/firebase");
  const V = await import("../lib/v27");
  const W = await import("../lib/v28");
  const C = await import("../lib/cfg2");
  const M = await import("../lib/v24");
  const { sendCoins } = await import("../lib/transfer");
  const { getSettings, invalidateSettings } = await import("../lib/settings");
  const { pvSet } = await import("../lib/pv");
  const old = Date.now() - 5 * 864e5;
  await db().ref("settings").set({ send_enabled: true, send_fee_pct: 1, send_min: 1000, send_daily_limit: 9e9, send_min_age_hours: 24 });
  invalidateSettings();
  const s = await getSettings(true);
  await db().ref("users/1").set({ name: "Alice", balance: 900000, usdt_u: 500e6, created_at: old });
  await db().ref("users/2").set({ name: "Shopper", balance: 900000, created_at: old });
  // 1. auto rate with margin
  await C.setCfg2("xchg", { on: true, auto: true, fx: 100, margin_buy: 2, margin_sell: 1, cur: "BDT", methods: [{ id: "bk", name: "bKash", details: "01700000000", kind: "both", min: 5, max: 500, fee_pct: 0 }], new_user_hours: 0, daily_max_usdt: 0 });
  let c = await V.xc(); assert.equal(c.rate_buy, 122.4); assert.equal(c.rate_sell, 118.8);
  const q = await V.xQuote("1", { kind: "buy", method: "bk", usdt: 10 }); assert.equal(q.rate, 122.4); assert.equal(q.fiat, 1224);
  // source down → falls back to typed base (cache is fresh, so reset by new module state isn't possible; just check typed fallback path with auto off)
  await C.setCfg2("xchg", { ...(await C.getCfg2(true)).xchg, auto: false, rate_buy: 130, rate_sell: 125 });
  c = await V.xc(); assert.equal(c.rate_buy, 130);
  // 2. dispute → ticket once
  const o = await V.xPlace("1", "Alice", { token: (await V.xQuote("1", { kind: "sell", method: "bk", usdt: 10 })).token, acct: "bKash 01711111111" });
  await W.xDispute("1", "Alice", o.id, "money not received");
  await assert.rejects(W.xDispute("1", "Alice", o.id, "again"), /already reported/);
  const tk = Object.values(((await db().ref("tickets").get()).val() || {}) as any) as any[];
  assert.ok(tk.some((t) => t.subject.includes("Exchange order") && JSON.stringify(t.msgs).includes("money not received")));
  await assert.rejects(W.xDispute("2", "X", o.id, "hack"), /not_found/);
  // 3. report
  await V.xAdminSet(o.id, "done", "", "adm");
  const r = await W.xReport(30); assert.equal(r.orders, 1); assert.equal(r.sell_usdt, 10); assert.equal(r.by_method[0].method, "bKash");
  // 9. todo
  await db().ref("usdt_withdrawals/w1").set({ status: "pending", uid: "1" });
  const t = await W.adminTodo(); assert.equal(t.items.find((x: any) => x.k === "usdt")!.n, 1); assert.ok(t.items.find((x: any) => x.k === "tickets")!.n >= 1);
  // 4. bot texts
  assert.match(await W.rateText(), /Buy 1 USDT/); assert.match(await W.ordersText("1"), /Sell 10 USDT/);
  // 7. merchant refund (sale made with fu)
  await M.merchantSet("1", { name: "Alice shop", amt: 0, asset: "tfuel", on: true });
  await sendCoins({ id: "2", name: "Shopper" }, "1", 20000, s, "");
  await new Promise((r) => setTimeout(r, 150));
  const sales = (await M.merchantSales("1")).list; assert.equal(sales.length, 1); assert.ok(sales[0].refundable);
  const before2 = (await db().ref("users/2/balance").get()).val();
  await W.merchantRefund("1", "Alice", sales[0].id);
  assert.equal((await db().ref("users/2/balance").get()).val(), before2 + 20000);
  await assert.rejects(W.merchantRefund("1", "Alice", sales[0].id), /already refunded/);
  assert.equal((await db().ref("users/2/balance").get()).val(), before2 + 20000);
  await assert.rejects(W.merchantRefund("2", "Shopper", sales[0].id), /not_found/);
  // failed refund releases the marker
  await sendCoins({ id: "2", name: "Shopper" }, "1", 20000, s, ""); await new Promise((r) => setTimeout(r, 150));
  const s2 = (await M.merchantSales("1")).list.find((x: any) => x.refundable)!;
  await db().ref("users/1/balance").set(0);
  await assert.rejects(W.merchantRefund("1", "Alice", s2.id));
  assert.equal((await db().ref(`merchant_sales/1/${s2.id}/rf`).get()).val(), null);
  // 8. spending
  const sp = await W.spending("2", 30, 1000); assert.ok(sp.list.some((x: any) => x.t === "send" && x.tfuel_out > 0));
  // 10. undo window: held, cancellable, then released by cron
  await db().ref("users/1/balance").set(900000);
  await pvSet("2", { uw: 5 });
  const bal2 = (await db().ref("users/2/balance").get()).val(), bal1 = (await db().ref("users/1/balance").get()).val();
  const out = await sendCoins({ id: "2", name: "Shopper" }, "1", 10000, s, "x") as any;
  assert.equal(out.held, true);
  assert.equal((await db().ref("users/1/balance").get()).val(), bal1); // receiver not paid yet
  const T = await import("../lib/transfer");
  await T.cancelHold("2", out.id);
  assert.equal((await db().ref("users/2/balance").get()).val(), bal2); // fully refunded incl. fee
  await pvSet("2", { uw: 0 });
  const out2 = await sendCoins({ id: "2", name: "Shopper" }, "1", 10000, s, "y") as any;
  assert.ok(!out2.held);
  console.log("v28 ok");
})().catch((e) => { console.error(e); process.exit(1); });

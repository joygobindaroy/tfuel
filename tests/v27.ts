import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://x.app";
process.env.NEXT_PUBLIC_BOT_LINK = "https://t.me/mybot/app";
process.env.ADMIN_TELEGRAM_IDS = "999";
import assert from "node:assert/strict";
const calls: string[] = [];
(globalThis as any).fetch = async (u: string) => { calls.push(decodeURIComponent(String(u).replace(/\+/g, " "))); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  const { db } = await import("../lib/firebase");
  const V = await import("../lib/v27");
  const C = await import("../lib/cfg2");
  const { xCalc, xUsdtFor } = await import("../lib/xcalc");
  const { invalidateSettings } = await import("../lib/settings");
  const old = Date.now() - 5 * 864e5;
  await db().ref("settings").set({ send_enabled: true });
  invalidateSettings();
  await db().ref("users/1").set({ name: "Alice", balance: 0, usdt_u: 500e6, created_at: old });
  await db().ref("users/2").set({ name: "Newbie", balance: 0, usdt_u: 10e6, created_at: Date.now() });
  // maths
  assert.deepEqual(xCalc({ kind: "buy", usdt: 100, rate: 120, fee_pct: 1 }), { gross: 12000, fee: 120, fiat: 12120 });
  assert.equal(xCalc({ kind: "sell", usdt: 100, rate: 118, fee_pct: 1 }).fiat, 11682);
  assert.ok(Math.abs(xUsdtFor("buy", 12120, 120, 1) - 100) < 0.02);
  // off by default
  await assert.rejects(V.xQuote("1", { kind: "buy", method: "m1", usdt: 10 }), /turned off/);
  await C.setCfg2("xchg", { on: true, cur: "bdt", rate_buy: 120, rate_sell: 118, lock_min: 15, daily_max_usdt: 300, new_user_hours: 24, trusted_after: 2, methods: [{ id: "bk", name: "bKash", details: "01700000000", kind: "both", min: 5, max: 200, fee_pct: 1 }] });
  assert.equal((await V.xLocal())?.rate, 118);
  // quote rules
  await assert.rejects(V.xQuote("1", { kind: "buy", method: "bk", usdt: 1 }), /Minimum/);
  await assert.rejects(V.xQuote("1", { kind: "buy", method: "nope", usdt: 10 }), /method/);
  const q = await V.xQuote("1", { kind: "buy", method: "bk", usdt: 100 });
  assert.equal(q.fiat, 12120);
  // tampered token
  await assert.rejects(V.xPlace("1", "Alice", { token: q.token.replace(":12120:", ":10:") }), /quote_bad/);
  await assert.rejects(V.xPlace("2", "Newbie", { token: q.token }), /quote_bad/); // another user's token
  // new account wait
  const qn = await V.xQuote("2", { kind: "sell", method: "bk", usdt: 5 });
  await assert.rejects(V.xPlace("2", "Newbie", { token: qn.token, acct: "01711111111" }), /New accounts/);
  // BUY flow
  const o = await V.xPlace("1", "Alice", { token: q.token });
  assert.equal(o.st, "await"); assert.equal(o.pay, "01700000000");
  await assert.rejects(V.xAdminSet(o.id, "done", "", "adm"), /payment reference/); // no proof yet
  await assert.rejects(V.xProof("1", o.id, "ab"), /transaction ID/);
  await V.xProof("1", o.id, "TXN123456");
  await assert.rejects(V.xProof("1", o.id, "TXN999999"), /can't take/);
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 500e6); // nothing credited yet
  await V.xAdminSet(o.id, "done", "ok", "adm");
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 600e6);
  await assert.rejects(V.xAdminSet(o.id, "done", "", "adm"), /already finished/); // no double credit
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 600e6);
  assert.equal((await db().ref("users/1/usdt_tot/bought").get()).val(), 100e6);
  assert.ok(calls.some((c) => c.includes("Exchange complete")));
  // daily cap (300): 100 used, 150 more ok, 100 more not
  const q2 = await V.xQuote("1", { kind: "sell", method: "bk", usdt: 150 });
  const s1 = await V.xPlace("1", "Alice", { token: q2.token, acct: "bKash 01722222222" });
  assert.equal(s1.st, "pending");
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 450e6); // held at once
  const q3 = await V.xQuote("1", { kind: "sell", method: "bk", usdt: 100 });
  await assert.rejects(V.xPlace("1", "Alice", { token: q3.token, acct: "bKash 01722222222" }), /Daily/);
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 450e6);
  // sell: reject refunds exactly once; cancel after reject impossible
  await V.xAdminSet(s1.id, "reject", "wrong account", "adm");
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 600e6);
  await assert.rejects(V.xCancel("1", s1.id), /too late/);
  await assert.rejects(V.xAdminSet(s1.id, "reject", "", "adm"), /already finished/);
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 600e6);
  assert.equal((await db().ref("users/1/usdt_tot/sold").get()).val(), 0);
  // sell paying blocks user cancel, done keeps money gone
  const q4 = await V.xQuote("1", { kind: "sell", method: "bk", usdt: 50 });
  const s2 = await V.xPlace("1", "Alice", { token: q4.token, acct: "bKash 01733333333" });
  await V.xAdminSet(s2.id, "paying", "", "adm");
  await assert.rejects(V.xCancel("1", s2.id), /too late/);
  await V.xAdminSet(s2.id, "done", "", "adm");
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 550e6);
  // sell with too little USDT
  await db().ref("users/1/usdt_u").set(1e6);
  await C.setCfg2("xchg", { ...(await C.getCfg2(true)).xchg, daily_max_usdt: 0 });
  const q5 = await V.xQuote("1", { kind: "sell", method: "bk", usdt: 50 });
  await assert.rejects(V.xPlace("1", "Alice", { token: q5.token, acct: "bKash 01733333333" }), /insufficient/);
  // trusted badge (2 done, 0 rejected? one rejection happened)
  assert.equal((await V.xStats("1")).trusted, false);
  assert.equal((await V.xStats("1")).done, 2);
  // expiry of buy without proof
  await db().ref("users/1/usdt_u").set(500e6);
  const q6 = await V.xQuote("1", { kind: "buy", method: "bk", usdt: 10 });
  const b6 = await V.xPlace("1", "Alice", { token: q6.token });
  assert.equal(await V.xExpire(Date.now() + 3600e3), 1);
  assert.equal((await db().ref(`xorders/${b6.id}/st`).get()).val(), "expired");
  // receipt image url signed
  const v = await V.xView("1"); assert.ok(v.orders.some((x: any) => x.img.includes("/api/xrcpt?d=")));
  // hub + why
  await db().ref("user_prefs/1/safe_until").set(Date.now() + 3600e3);
  await db().ref("users/1/usdt_withdrawals/w1").set({ amount: 5, status: "pending", network_name: "TRC20", created_at: Date.now() });
  const h = await V.hub("1");
  assert.ok(h.blocks.some((b: string) => /Safe mode/.test(b)));
  assert.ok(h.items.some((i: any) => i.k === "wd" && /Waiting/.test(i.why)));
  // recent amounts
  await db().ref("user_xfers/1/a1").set({ d: "out", a: "tfuel", amt: 5000, st: "done", at: 1 });
  await db().ref("user_xfers/1/a2").set({ d: "out", a: "tfuel", amt: 5000, st: "done", at: 2 });
  await db().ref("user_xfers/1/a3").set({ d: "out", a: "tfuel", amt: 7000, st: "done", at: 3 });
  assert.deepEqual((await V.recentAmts("1")).tfuel, [7000, 5000]);
  // low balance: once per day
  await V.lowSet("1", { on: true, t: 0, u: 1000 });
  calls.length = 0;
  assert.equal(await V.runLowBal(), 1);
  assert.equal(await V.runLowBal(), 0);
  assert.ok(calls.some((c) => c.includes("Low balance")));
  await assert.rejects(V.lowSet("1", { on: true }), /amount/);
  // user summary
  const sm = await V.userSummary("1"); assert.equal(sm.name, "Alice"); assert.ok(sm.xorders.length >= 3);
  await assert.rejects(V.userSummary("424242"), /not found/);
  console.log("v27 ok");
})().catch((e) => { console.error(e); process.exit(1); });

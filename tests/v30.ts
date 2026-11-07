import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://x.app";
process.env.NEXT_PUBLIC_BOT_LINK = "https://t.me/mybot/app";
process.env.ADMIN_TELEGRAM_IDS = "999";
import assert from "node:assert/strict";
const calls: string[] = [];
(globalThis as any).fetch = async (u: string, init?: any) => { calls.push(decodeURIComponent(String(u).replace(/\+/g, " "))); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  const { db } = await import("../lib/firebase");
  const V = await import("../lib/v30");
  const X = await import("../lib/v27");
  const C = await import("../lib/cfg2");
  const M = await import("../lib/v24");
  const { getSettings, invalidateSettings } = await import("../lib/settings");
  const { sendCoins } = await import("../lib/transfer");
  const { getRefCode } = await import("../lib/refcode");
  const old = Date.now() - 5 * 864e5;
  await db().ref("settings").set({ send_enabled: true, send_fee_pct: 1, send_min: 1000, send_daily_limit: 9e9, send_min_age_hours: 24 });
  invalidateSettings();
  const s = await getSettings(true);
  for (const [id, n, b] of [["1", "Alice", 900000], ["2", "Bobby", 0], ["3", "Carol", 0], ["4", "Dave", 0], ["5", "Eve", 0]] as const) await db().ref(`users/${id}`).set({ name: n, balance: b, usdt_u: 0, created_at: old });
  // ---- split maths
  for (const mode of [true, false]) for (let i = 0; i < 50; i++) { const a = V.splitAmount(10000, 7, 1000, mode); assert.equal(a.length, 7); assert.equal(a.reduce((x, y) => x + y, 0), 10000); assert.ok(a.every((x) => x >= 1000)); }
  assert.throws(() => V.splitAmount(5000, 7, 1000, true), /send_min/);
  // ---- red packet
  await assert.rejects(V.packetNew({ id: "1", name: "Alice" }, { asset: "tfuel", amount: 10, n: 3 }, s), /off/);
  await C.setCfg2("v30", { packet: { on: true, max_n: 10, max_hours: 48 }, tip: { on: true, max_tfuel: 5, day_max_tfuel: 8 } });
  await assert.rejects(V.packetNew({ id: "1", name: "Alice" }, { asset: "tfuel", amount: 1, n: 3 }, s), /send_min/);
  const before = (await db().ref("users/1/balance").get()).val();
  const pk = await V.packetNew({ id: "1", name: "Alice" }, { asset: "tfuel", amount: 30, n: 3, hours: 24, note: "Eid" }, s);
  const spent = before - (await db().ref("users/1/balance").get()).val();
  assert.ok(spent >= 30000 && spent <= 30400, "total + fee taken: " + spent);
  await assert.rejects(V.packetClaim("1", "Alice", pk.tok, s), /own/);
  const c2 = await V.packetClaim("2", "Bobby", pk.tok, s); assert.ok(c2.amt >= 1000);
  await assert.rejects(V.packetClaim("2", "Bobby", pk.tok, s), /already/);
  assert.equal((await db().ref("users/2/balance").get()).val(), c2.amt);
  const c3 = await V.packetClaim("3", "Carol", pk.tok, s);
  assert.equal((await V.packetPeek("4", pk.tok)).left, 1);
  // close: unopened share returns exactly once
  const b1 = (await db().ref("users/1/balance").get()).val();
  const back = await V.packetClose(pk.tok, "1");
  assert.equal(back, 30000 - c2.amt - c3.amt);
  assert.equal((await db().ref("users/1/balance").get()).val(), b1 + back);
  await assert.rejects(V.packetClose(pk.tok, "1"), /already finished/);
  await assert.rejects(V.packetClaim("4", "Dave", pk.tok, s), /finished/);
  assert.equal((await db().ref("users/1/balance").get()).val(), b1 + back);
  // expiry via cron
  const pk2 = await V.packetNew({ id: "1", name: "Alice" }, { asset: "tfuel", amount: 10, n: 2, mode: "equal" }, s);
  await db().ref(`packets/${pk2.tok}/exp`).set(Date.now() - 1);
  const b2 = (await db().ref("users/1/balance").get()).val();
  assert.equal(await V.runPackets(), 1); assert.equal((await db().ref("users/1/balance").get()).val(), b2 + 10000);
  // concurrency: 2 shares, 4 people at once → exactly 2 succeed
  const pk3 = await V.packetNew({ id: "1", name: "Alice" }, { asset: "tfuel", amount: 10, n: 2 }, s);
  const rs = await Promise.allSettled(["2", "3", "4", "5"].map((u) => V.packetClaim(u, "U" + u, pk3.tok, s)));
  assert.equal(rs.filter((r) => r.status === "fulfilled").length, 2);
  // ---- open hours
  const cfg = (await C.getCfg2(true)).xchg;
  const base = { ...cfg, hours_on: true, hours_from: 10, hours_to: 22, tz_h: 6 } as any;
  const at = (h: number) => Date.UTC(2026, 0, 1, h - 6, 30); // local hour h:30
  assert.equal(V.xOpen(base, at(9)).open, false); assert.equal(V.xOpen(base, at(10)).open, true); assert.equal(V.xOpen(base, at(21)).open, true); assert.equal(V.xOpen(base, at(22)).open, false);
  assert.equal(V.xOpen({ ...base, hours_from: 22, hours_to: 6 }, at(23)).open, true); assert.equal(V.xOpen({ ...base, hours_from: 22, hours_to: 6 }, at(12)).open, false);
  assert.equal(V.xOpen({ ...base, hours_on: false }, at(3)).open, true);
  // ---- exchange: remembered sell account, top traders
  await C.setCfg2("xchg", { on: true, rate_buy: 120, rate_sell: 118, cur: "BDT", new_user_hours: 0, daily_max_usdt: 0, methods: [{ id: "bk", name: "bKash", details: "017", kind: "both", min: 1, max: 500, fee_pct: 0 }] });
  await db().ref("users/2/usdt_u").set(100e6);
  const so = await X.xPlace("2", "Bobby", { token: (await X.xQuote("2", { kind: "sell", method: "bk", usdt: 20 })).token, acct: "bKash 01711111111" });
  assert.equal((await X.xView("2")).accts.bk, "bKash 01711111111");
  assert.ok(calls.some((c) => c.includes("callback_data") && c.includes("xp:")), "admin got buttons");
  await X.xAdminSet(so.id, "done", "", "adm");
  await db().ref("users/3/usdt_u").set(100e6);
  const so3 = await X.xPlace("3", "Carol", { token: (await X.xQuote("3", { kind: "sell", method: "bk", usdt: 50 })).token, acct: "bKash 01722222222" });
  await X.xAdminSet(so3.id, "done", "", "adm");
  const top = await V.xTop("2"); assert.equal(top.top[0].usdt, 50); assert.equal(top.me!.rank, 2);
  // bot buttons: confirm step first, then act
  const so4 = await X.xPlace("2", "Bobby", { token: (await X.xQuote("2", { kind: "sell", method: "bk", usdt: 5 })).token, acct: "bKash 01733333333" });
  assert.match((await V.xoBot("999", "xd", so4.id)).text, /Only confirm/);
  assert.equal((await db().ref(`xorders/${so4.id}/st`).get()).val(), "pending");
  await V.xoBot("999", "xp", so4.id); assert.equal((await db().ref(`xorders/${so4.id}/st`).get()).val(), "paying");
  await V.xoBot("999", "xD", so4.id); assert.equal((await db().ref(`xorders/${so4.id}/st`).get()).val(), "done");
  assert.match((await V.xoBot("999", "xD", so4.id)).text, /Couldn't/);
  // ---- rate alerts
  await V.xAlertAdd("2", { kind: "sell", op: "gte", target: 125 });
  await V.xAlertAdd("2", { kind: "buy", op: "lte", target: 121 });
  calls.length = 0; assert.equal(await V.runXAlerts(), 1); // buy 120 <= 121 fires; sell 118 < 125 waits
  assert.equal((await V.xAlertList("2")).length, 1); assert.equal(await V.runXAlerts(), 0);
  await assert.rejects(V.xAlertAdd("2", { kind: "buy", op: "lte", target: 0 }), /rate/);
  // ---- merchant items + coupons
  await M.merchantSet("1", { name: "Alice shop", amt: 0, asset: "tfuel", on: true });
  await V.catalogSet("1", { items: [{ name: "Tea", price: 20 }, { name: "", price: 5 }], coupons: [{ code: "eid10", pct: 10, uses: 1 }, { code: "x", pct: 5 }] });
  const cat = await V.catalogGet("1"); assert.equal(cat.items.length, 1); assert.equal(cat.coupons.length, 1); assert.equal(cat.coupons[0].code, "EID10");
  const code1 = await getRefCode("1");
  assert.equal((await V.catalogPub(code1)).coupons, true);
  assert.deepEqual(await V.cpnCheck(code1, "eid10"), { code: "EID10", pct: 10 });
  await assert.rejects(V.cpnCheck(code1, "nope"), /valid/);
  await sendCoins({ id: "4", name: "Dave" }, "1", 18000, s, "Tea CPN:EID10").catch(() => {});
  await db().ref("users/4/balance").set(50000);
  await sendCoins({ id: "4", name: "Dave" }, "1", 18000, s, "Tea CPN:EID10");
  await new Promise((r) => setTimeout(r, 150));
  assert.ok((await M.merchantSales("1")).list.some((x: any) => x.cpn === "EID10 -10%"));
  await assert.rejects(V.cpnCheck(code1, "EID10"), /valid/); // single use is used up
  // ---- group tip
  const tg = (id: number, n: string, bot = false) => ({ id, first_name: n, is_bot: bot });
  await db().ref("users/5/balance").set(20000);
  assert.match(await V.groupTip(tg(5, "Eve"), tg(2, "Bobby"), "/tip 3"), /Turn on/);
  await db().ref("user_prefs/5/pv/gt").set(true);
  assert.match(await V.groupTip(tg(5, "Eve"), tg(2, "Bobby"), "/tip"), /Use it like/);
  assert.match(await V.groupTip(tg(5, "Eve"), tg(2, "Bobby"), "/tip 9"), /limited to 5/);
  assert.match(await V.groupTip(tg(5, "Eve"), tg(77, "Ghost"), "/tip 2"), /hasn't joined/);
  assert.equal(await V.groupTip(tg(5, "Eve"), tg(5, "Eve"), "/tip 2"), "");
  const b5 = (await db().ref("users/2/balance").get()).val();
  assert.match(await V.groupTip(tg(5, "Eve"), tg(2, "Bobby"), "/tip 4"), /tipped/);
  assert.equal((await db().ref("users/2/balance").get()).val(), b5 + 4000);
  assert.match(await V.groupTip(tg(5, "Eve"), tg(2, "Bobby"), "/tip 4"), /tipped/);
  assert.match(await V.groupTip(tg(5, "Eve"), tg(2, "Bobby"), "/tip 1"), /Daily tip limit/); // 4+4+1 > 8
  // ---- goal counts vault
  const G = await import("../lib/v23");
  await G.goalSet("1", "Phone", 100000);
  await C.setCfg2("v29", { vault: { on: true, min_days: 1, max_days: 30, min_tfuel: 1, max_open: 3 } });
  await (await import("../lib/v29")).vaultLock("1", { asset: "tfuel", amount: 40, days: 3 });
  assert.equal((await G.goalGet("1"))!.vault, 40000);
  console.log("v30 ok");
})().catch((e) => { console.error(e); process.exit(1); });

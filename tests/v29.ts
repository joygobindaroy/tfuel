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
  const V = await import("../lib/v29");
  const X = await import("../lib/v27");
  const W = await import("../lib/v28");
  const C = await import("../lib/cfg2");
  const { assertCanMoveMoney } = await import("../lib/freeze");
  const { invalidateSettings } = await import("../lib/settings");
  const { sha256 } = await import("../lib/crypto");
  const old = Date.now() - 5 * 864e5;
  await db().ref("settings").set({ send_enabled: true });
  invalidateSettings();
  await db().ref("users/1").set({ name: "Alice", balance: 500000, usdt_u: 50e6, created_at: old, last_seen: old });
  await db().ref("users/2").set({ name: "Bobby", balance: 0, created_at: old, last_seen: Date.now() });
  await db().ref("users/3").set({ name: "Carol", balance: 1000, created_at: old, last_seen: Date.now() - 40 * 864e5 });
  await db().ref("user_index").set({ "1": 1, "2": 1, "3": 1 });
  // ---- vault
  await assert.rejects(V.vaultLock("1", { asset: "tfuel", amount: 100, days: 30 }), /off/);
  await C.setCfg2("v29", { vault: { on: true, min_days: 1, max_days: 90, min_tfuel: 10, max_open: 2 } });
  await assert.rejects(V.vaultLock("1", { asset: "tfuel", amount: 100, days: 200 }), /Choose between/);
  await assert.rejects(V.vaultLock("1", { asset: "tfuel", amount: 1, days: 5 }), /Minimum/);
  await assert.rejects(V.vaultLock("1", { asset: "tfuel", amount: 9999, days: 5 }), /insufficient/);
  const v = await V.vaultLock("1", { name: "Eid", asset: "tfuel", amount: 100, days: 5 });
  assert.equal((await db().ref("users/1/balance").get()).val(), 400000);
  assert.equal(v.list[0].st, "locked");
  await assert.rejects(V.vaultOpen("1", v.list[0].id), /Locked until/);
  await V.vaultLock("1", { asset: "usdt", amount: 5, days: 1 });
  await assert.rejects(V.vaultLock("1", { asset: "tfuel", amount: 50, days: 5 }), /2 locked/);
  // time passes
  const vid = v.list.find((x: any) => x.name === "Eid").id;
  await db().ref(`vaults/1/${vid}/unlock_at`).set(Date.now() - 1000);
  calls.length = 0;
  assert.equal(await V.runVaults(), 1); assert.equal(await V.runVaults(), 0);
  assert.ok(calls.some((c) => c.includes("vault")));
  await V.vaultOpen("1", vid);
  assert.equal((await db().ref("users/1/balance").get()).val(), 500000);
  await assert.rejects(V.vaultOpen("1", vid), /already open/); // no double refund
  assert.equal((await db().ref("users/1/balance").get()).val(), 500000);
  await assert.rejects(V.vaultOpen("2", vid), /not_found/);
  // ---- panic + emergency
  await assert.rejects(V.panicOff("1", "x"), /isn't frozen/);
  await V.panicOn("1", "Alice");
  await assert.rejects(assertCanMoveMoney("1"), /account_frozen/);
  await assert.rejects(V.panicOn("1", "Alice"), /already frozen/);
  await assert.rejects(V.panicOff("1", "WRONGCODE"), /isn't valid/);
  await db().ref("user_prefs/1/rec/h").set([sha256("rec:1:ABCDE12345")]);
  await V.panicOff("1", "abcde-12345");
  await assertCanMoveMoney("1").then(() => assert.fail("safe mode must apply"), (e) => assert.match(e.message, /safe_mode/));
  await db().ref("user_prefs/1/safe_until").set(0);
  await assert.rejects(V.panicOff("1", "ABCDE12345"), /isn't frozen/); // code consumed
  // admin freeze can't be lifted by user
  await db().ref("frozen/1").set({ reason: "x", by: "adm", at: 1 });
  await assert.rejects(V.panicOff("1", "x"), /support/);
  await db().ref("frozen/1").set(null);
  // emergency contact
  const { getRefCode } = await import("../lib/refcode");
  const code2 = await getRefCode("2");
  await assert.rejects(V.emgSet("1", "NOSUCHCODE"), /send_no_user/);
  await V.emgSet("1", code2);
  await V.panicOn("1", "Alice");
  await assert.rejects(V.emgAsk("1", "Alice"), /24 hours/); // too fresh (attacker can't add a friend at hack time)
  await db().ref("user_prefs/1/emg/at").set(Date.now() - 2 * 864e5);
  await V.emgAsk("1", "Alice");
  assert.equal((await V.emgPending("2")).length, 1);
  await assert.rejects(V.emgApprove("3", "1"), /expired|can't/);
  await V.emgApprove("2", "1");
  assert.equal(await db().ref("frozen/1").get().then((s) => s.val()), null);
  assert.equal((await V.emgPending("2")).length, 0);
  await assert.rejects(V.emgApprove("2", "1"), /expired/);
  // ---- contest
  const t0 = Date.now();
  await C.setCfg2("v29", { ...(await C.getCfg2(true)).v29, contest: { on: true, title: "Cup", start: t0 - 1000, end: t0 + 5000, prizes: [100, 50] } });
  await V.contestHit("1"); await V.contestHit("1"); await V.contestHit("2");
  await V.contestHit("3", t0 + 99999); // outside window
  const cv = (await V.contestView("1"))!; assert.equal(cv.me.n, 2); assert.equal(cv.board[0].n, 2); assert.equal(cv.me.rank, 1);
  await assert.rejects(V.contestPay("adm", t0), /hasn't ended/);
  const b1 = (await db().ref("users/1/balance").get()).val();
  const w = await V.contestPay("adm", t0 + 10000); assert.equal(w.length, 2);
  assert.equal((await db().ref("users/1/balance").get()).val(), b1 + 100000);
  await assert.rejects(V.contestPay("adm", t0 + 10000), /already paid/);
  assert.equal((await db().ref("users/1/balance").get()).val(), b1 + 100000);
  // ---- first exchange order bonus (once)
  await C.setCfg2("v29", { ...(await C.getCfg2(true)).v29, first: { on: true, tfuel: 10 } });
  const bb = (await db().ref("users/2/balance").get()).val();
  assert.equal(await V.firstOrderBonus("2"), true); assert.equal(await V.firstOrderBonus("2"), false);
  assert.equal((await db().ref("users/2/balance").get()).val(), bb + 10000);
  // ---- win-back (once per 60 days, skips active)
  await C.setCfg2("v29", { ...(await C.getCfg2(true)).v29, winback: { on: true, days: 14, tfuel: 5, text: "Come back" } });
  calls.length = 0;
  assert.equal(await V.runWinback(), 1); // only user 3 is away 40 days
  assert.equal(await V.runWinback(), 0);
  assert.equal((await db().ref("users/3/balance").get()).val(), 1000 + 5000);
  assert.equal((await db().ref("users/2/balance").get()).val(), bb + 10000); // active user untouched
  // ---- team notes
  await assert.rejects(V.noteAdd("a", "x"), /more/);
  let n = await V.noteAdd("Ann", "Check Bobby's order"); const nid = n[0].id;
  n = await V.noteDone(nid, true); assert.equal(n[0].done, true);
  n = await V.noteDel(nid); assert.equal(n.length, 0);
  // ---- rate history
  await C.setCfg2("xchg", { on: true, rate_buy: 120, rate_sell: 118, cur: "BDT", methods: [] });
  assert.equal(await V.xRecord(), true);
  const rr = await V.xRates(30); assert.equal(rr.at(-1)!.buy, 120);
  // ---- high-balance reminder
  await X.lowSet("3", { on: true, ht: 5 });
  calls.length = 0; assert.equal(await X.runLowBal(), 1); assert.ok(calls.some((c) => c.includes("balance reached")));
  // ---- spending by tag
  await db().ref("user_xfers/3/a1").set({ d: "out", a: "tfuel", amt: 2000, st: "done", at: Date.now(), tag: "Rent" });
  await db().ref("user_xfers/3/a2").set({ d: "out", a: "tfuel", amt: 1000, st: "done", at: Date.now(), tag: "rent" });
  const sp = await W.spending("3", 30, 1000); assert.equal(sp.tags[0].tag, "rent"); assert.equal(sp.tags[0].tfuel, -3);
  console.log("v29 ok");
})().catch((e) => { console.error(e); process.exit(1); });

import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://x.app";
process.env.ADMIN_TELEGRAM_IDS = "999";
import assert from "node:assert/strict";
const calls: string[] = [];
(globalThis as any).fetch = async (u: string) => { calls.push(decodeURIComponent(String(u).replace(/\+/g, " "))); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  const { db } = await import("../lib/firebase");
  const V = await import("../lib/v31");
  const X = await import("../lib/v27");
  const C = await import("../lib/cfg2");
  const I = await import("../lib/v26");
  const M = await import("../lib/v24");
  const { weekIndex } = await import("../lib/wallet");
  const old = Date.now() - 5 * 864e5;
  for (const [id, n] of [["1", "Alice"], ["2", "Bobby"], ["3", "Carol"]] as const) await db().ref(`users/${id}`).set({ name: n, balance: 500000, usdt_u: 0, created_at: old });

  // ---- 1. tiers
  assert.equal((await V.tierFor("2")).on, false);
  await C.setCfg2("v31", { tiers: { on: true, list: [{ vol: 500, off: 10 }, { vol: 100, off: 5 }, { vol: 50, off: 0 }] } });
  assert.deepEqual((await C.getCfg2(true)).v31.tiers.list, [{ vol: 100, off: 5 }, { vol: 500, off: 10 }]);
  assert.deepEqual(await V.tierFor("2"), { on: true, vol: 0, off: 0, next: { vol: 100, off: 5 } });
  await db().ref(`xchg_week/${weekIndex()}/2`).set(120e6);
  let t = await V.tierFor("2"); assert.equal(t.off, 5); assert.deepEqual(t.next, { vol: 500, off: 10 });
  await db().ref(`xchg_week/${weekIndex()}/2`).set(0); await db().ref(`xchg_week/${weekIndex() - 1}/2`).set(600e6);
  assert.equal((await V.tierFor("2")).off, 10); assert.equal((await V.tierFor("2")).next, null);
  assert.equal(V.feeAfter(2, 10), 1.8); assert.equal(V.feeAfter(2, 0), 2); assert.equal(V.feeAfter(2, 150), 0);

  // ---- exchange with discount, trusted limit, method hours
  await C.setCfg2("xchg", { on: true, rate_buy: 100, rate_sell: 100, cur: "BDT", new_user_hours: 0, daily_max_usdt: 100, trusted_x: 3, trusted_after: 1, methods: [{ id: "bk", name: "bKash", details: "017", kind: "both", min: 1, max: 1000, fee_pct: 2 }, { id: "ng", name: "Nagad", details: "018", kind: "both", min: 1, max: 1000, fee_pct: 0, h_on: true, h_from: 0, h_to: 1 }] });
  const q = await X.xQuote("2", { kind: "buy", method: "bk", usdt: 10 });
  assert.equal(q.off, 10); assert.equal(q.fee_fiat, 18); assert.equal(q.fiat, 1018);
  const q1 = await X.xQuote("1", { kind: "buy", method: "bk", usdt: 10 }); assert.equal(q1.fee_fiat, 20); assert.equal(q1.off, 0);
  const cfg = (await C.getCfg2(true)).xchg;
  assert.equal(V.dailyLimit(cfg, false), 100); assert.equal(V.dailyLimit(cfg, true), 300); assert.equal(V.dailyLimit({ ...cfg, daily_max_usdt: 0 }, true), 0);
  const ng = cfg.methods[1];
  assert.equal(V.methodOpen(cfg, ng, Date.UTC(2026, 0, 1, 18, 30)).open, true); // 00:30 at UTC+6
  const cl = V.methodOpen(cfg, ng, Date.UTC(2026, 0, 1, 8, 0)); assert.equal(cl.open, false); assert.match(cl.text, /Nagad/);
  assert.equal(V.methodOpen(cfg, cfg.methods[0]).open, true);
  const view = await X.xView("2"); assert.equal(view.daily_max, 100); assert.equal(view.tier.off, 10);
  assert.ok(view.cfg.methods.find((m: any) => m.id === "bk")?.open === true);
  // user 1 becomes trusted -> limit 300
  await db().ref("xchg_stats/1").set({ done: 1, rej: 0 });
  assert.equal((await X.xView("1")).daily_max, 300);
  await db().ref("users/1/usdt_u").set(500e6);
  const big = await X.xQuote("1", { kind: "sell", method: "bk", usdt: 250 });
  await X.xPlace("1", "Alice", { token: big.token, acct: "bKash 01700000000" }); // allowed only because trusted
  await assert.rejects(X.xPlace("2", "Bobby", { token: (await X.xQuote("2", { kind: "buy", method: "bk", usdt: 150 })).token }), /Daily/);

  // ---- 3. order chat
  const o = await X.xPlace("2", "Bobby", { token: q.token });
  await assert.rejects(V.xChatSend("3", "Carol", o.id, "hi"), /not_found/);
  await assert.rejects(V.xChatSend("2", "Bobby", o.id, "   "), /Write/);
  let m = await V.xChatSend("2", "Bobby", o.id, "Paid <b>from</b> 01711");
  assert.equal(m.length, 1); assert.equal(m[0].f, "u"); assert.ok(!m[0].t.includes("<"));
  assert.deepEqual(await V.xChatWaiting(), [o.id]);
  assert.ok(calls.some((c) => c.includes("sendMessage") && c.includes("Exchange order #")));
  m = await V.xChatAdmin("adm", o.id, "Got it, checking");
  assert.equal(m.length, 2); assert.equal(m[1].f, "a"); assert.deepEqual(await V.xChatWaiting(), []);
  assert.ok(calls.some((c) => c.includes("Got it, checking")));
  for (let i = 0; i < 29; i++) await V.xChatSend("2", "Bobby", o.id, "m" + i);
  await assert.rejects(V.xChatSend("2", "Bobby", o.id, "one more"), /limit/);

  // ---- 5/7. invoice due + reminders
  await C.setCfg2("v31", { tiers: { on: false, list: [] } });
  const id0 = await I.invCreate("1", "Logo work", 5, "tfuel", 10);
  assert.equal(((await db().ref(`invoices/${id0}`).get()).val() as any).due, undefined);
  const id1 = await I.invCreate("1", "Site work", 5, "tfuel", 10, 3);
  const inv1 = (await db().ref(`invoices/${id1}`).get()).val() as any;
  assert.ok(inv1.due > Date.now() + 2.9 * 864e5 && inv1.due <= inv1.exp);
  assert.equal((await I.invList("1")).find((x: any) => x.id === id1).overdue, false);
  assert.equal(await V.runInvReminders(), 0); // due in 3 days: nothing yet
  await db().ref(`invoices/${id1}/due`).set(Date.now() + 3600e3); // due within 24 h
  calls.length = 0;
  assert.equal(await V.runInvReminders(), 1); assert.equal(await V.runInvReminders(), 0);
  assert.ok(calls.some((c) => c.includes("due within 24 hours")));
  await db().ref(`invoices/${id1}/due`).set(Date.now() - 1000);
  assert.equal((await I.invList("1")).find((x: any) => x.id === id1).overdue, true);
  assert.equal(await V.runInvReminders(), 1); assert.equal(await V.runInvReminders(), 0);
  await db().ref(`invoices/${id1}/due`).set(Date.now() - 4 * 864e5);
  assert.equal(await V.runInvReminders(), 1);
  await db().ref(`invoices/${id1}/st`).set("paid");
  assert.equal(await V.runInvReminders(), 0);
  await C.setCfg2("v31", { inv_remind: false });
  await db().ref(`invoices/${id1}/st`).set("open"); await db().ref(`invoices/${id1}/rem`).remove();
  assert.equal(await V.runInvReminders(), 0);

  // ---- 6. purchases
  await db().ref("merchants/3").set({ name: "Carol Shop", on: true, amt: 0, asset: "tfuel" });
  await M.merchantSale("3", "Alice", "tfuel", 12000, "TXH1", "Tea", "1");
  await M.merchantSale("3", "Anon", "tfuel", 5000, "TXH2", "No id", "");
  const p = await V.purchaseList("1");
  assert.equal(p.list.length, 1); assert.equal(p.list[0].shop, "Carol Shop"); assert.equal(p.list[0].amt, 12000);
  assert.match(p.list[0].url, /\/receipt\?t=TXH1&u=1&s=/); assert.equal(p.total.tfuel, 12);
  assert.equal((await V.purchaseList("2")).list.length, 0);

  // shop name is the payment name for a merchant
  const T = await import("../lib/transfer");
  assert.equal(await T.payName("3"), "Carol Shop"); assert.equal(await T.payName("1"), "Alice");
  await db().ref("merchants/3/on").set(false); assert.equal(await T.payName("3"), "Carol"); await db().ref("merchants/3/on").set(true);
  const pu = M.merchantPosterUrl("Carol Shop", "https://t.me/b/app?startapp=mer_X");
  assert.match(pu, /^\/api\/shopqr\?n=Carol%20Shop&d=.+&s=[0-9a-f]{20}$/); assert.equal(M.merchantPosterUrl("", "x"), "");
  // ---- 9. quick send
  const now = Date.now();
  const row = (pc: string, peer: string, d: string, st = "done", at = now) => ({ d, a: "tfuel", amt: 1000, fee: 0, peer, pc, tx: "t", at, n: "", st });
  await db().ref("user_xfers/1").set({ a1: row("CAROL00001", "Carol", "out"), a2: row("CAROL00001", "Carol", "out"), a3: row("BOBBY00002", "Bobby", "out"), a4: row("DAVE000003", "Dave", "in"), a5: row("DAVE000003", "Dave", "in"), a6: row("EVE0000004", "Eve", "out", "cancelled"), a7: row("EVE0000004", "Eve", "out", "cancelled") });
  const ql = await V.quickList("1"); assert.deepEqual(ql.map((x) => x.code), ["CAROL00001"]);
  await db().ref("user_xfers/1/a8").set(row("BOBBY00002", "Bobby", "out"));
  assert.deepEqual((await V.quickList("1")).map((x) => x.code).sort(), ["BOBBY00002", "CAROL00001"]);

  // ---- 8. recap
  const r = await V.recapGet("1", "cur");
  assert.equal(r.out.n, 4); assert.equal(r.out.tfuel, 4); assert.equal(r.in.n, 2); assert.equal(r.top!.n >= 2, true);
  assert.match(r.img, /\/api\/recap\?d=.+&s=[0-9a-f]{20}$/);
  const prev = await V.recapGet("1", "prev"); assert.equal(prev.out.n, 0);

  // ---- 10. digest
  assert.equal(await V.digestGet("1"), false);
  assert.equal(await V.digestSet("1", true), true); assert.equal(await V.digestGet("1"), true);
  const d = new Date();
  const monday = d.getUTCDay() === 1 && d.getUTCHours() >= 3;
  calls.length = 0;
  const sent = await V.runDigests();
  if (monday) { assert.equal(sent, 1); assert.equal(await V.runDigests(), 0); assert.ok(calls.some((c) => c.includes("Your week"))); } else assert.equal(sent, 0);
  await V.digestSet("1", false); assert.equal(await V.digestGet("1"), false);

  // ---- 11. admin brief
  assert.equal(await V.runAdminBrief(), 0); // off by default
  await C.setCfg2("v31", { adm_daily: true });
  const txt = await V.adminBriefText(); assert.match(txt, /Morning brief/); assert.match(txt, /Exchange waiting now: \d+/);
  if (new Date().getUTCHours() >= 2) { assert.equal(await V.runAdminBrief(), 1); assert.equal(await V.runAdminBrief(), 0); }

  // ---- 12. CSV
  await db().ref(`xorders/${o.id}/name`).set("=HYPERLINK(1)");
  const csv = await V.xCsv(30);
  const lines = csv.split("\n"); assert.match(lines[0], /^order,date_utc,user_id,name,kind/);
  assert.ok(lines.length >= 3); assert.ok(csv.includes("'=HYPERLINK(1)")); assert.ok(!csv.includes(",=HYPERLINK"));
  console.log("v31 OK");
})().catch((e) => { console.error(e); process.exit(1); });

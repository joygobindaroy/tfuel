import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://x.app";
import assert from "node:assert/strict";
const calls: any[] = [];
(globalThis as any).fetch = async (u: string) => { calls.push(decodeURIComponent(String(u).replace(/\+/g, " "))); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  const { db } = await import("../lib/firebase");
  const { setCfg2, getCfg2 } = await import("../lib/cfg2");
  const { eventMult } = await import("../lib/events");
  const V = await import("../lib/v20");
  const { creditCoins } = await import("../lib/coins");
  const { dayKey } = await import("../lib/log");
  await db().ref("settings").set({ autopost_enabled: true, autopost_channel: "@c", referral_link: "https://t.me/b/app" });
  // events
  const now = Date.now();
  await setCfg2("v20", { events: [{ id: "e1", title: "x2", mult: 2, start: now - 1000, end: now + 3600000, on: true }], gq: { enabled: true, title: "Goal", target: 2, bonus: 50 } });
  assert.equal(await eventMult(), 2);
  await db().ref("users/1").set({ balance: 0 });
  await creditCoins("1", 100, "tasks", "task", "t");
  assert.equal((await db().ref("users/1/balance").get()).val(), 200, "tasks doubled");
  await creditCoins("1", 100, "spin", "spin", "t");
  assert.equal((await db().ref("users/1/balance").get()).val(), 300, "spin not doubled");
  assert.equal(await V.runEvents(), 1);
  assert.equal(await V.runEvents(), 0, "announced once");
  // group quest
  await db().ref("users/2").set({ balance: 0 });
  await V.gqTick("1");
  assert.equal(await V.runGroupQuest(), 0);
  await V.gqTick("2");
  assert.equal(await V.runGroupQuest(), 2);
  assert.equal(await V.runGroupQuest(), 0, "paid once");
  assert.equal((await db().ref("users/2/balance").get()).val(), 50);
  assert.equal((await V.gqView())!.done, true);
  // integrity
  await db().ref("users/3").set({ balance: -5 });
  assert.ok((await V.integrityScan()).issues.some((i) => i.uid === "3"));
  // csv
  const c = await V.exportCsv("users");
  assert.ok(c.csv.includes("balance_coins"));
  await assert.rejects(V.exportCsv("nope"));
  // errors
  await V.logErr("t", new Error("boom"));
  assert.equal((await V.errList())[0].msg, "boom");
  // tickets
  await db().ref("tickets/t1").set({ uid: "1", subject: "Hi there", status: "answered", updated_at: now - 9 * 86400000 });
  assert.equal(await V.runTicketClose(), 1);
  // invoice sig
  assert.notEqual(V.invoiceSig("a", "1"), V.invoiceSig("a", "2"));
  // pin gate
  await setCfg2("v20", { ...(await getCfg2(true)).v20, pin_over_usd: 10 });
  const { getSettings } = await import("../lib/settings");
  const s = await getSettings(true);
  await assert.rejects(V.pinGate("1", "usdt", 20e6, s), /pin_needed_set/);
  await V.pinGate("1", "usdt", 5e6, s);
  console.log("v20 OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

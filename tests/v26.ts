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
  const V = await import("../lib/v26");
  const C = await import("../lib/cfg2");
  const { sendCoins } = await import("../lib/transfer");
  const { getSettings, invalidateSettings } = await import("../lib/settings");
  const { pinHash } = await import("../lib/prefs");
  const old = Date.now() - 5 * 864e5;
  await db().ref("users/1").set({ name: "Alice", balance: 500000, created_at: old });
  await db().ref("users/2").set({ name: "Bobby", balance: 0, created_at: old });
  await db().ref("settings").set({ send_enabled: true, send_fee_pct: 1, send_min: 1000, send_daily_limit: 9e9, send_min_age_hours: 24 });
  invalidateSettings();
  const s = await getSettings(true);
  // invoice
  await assert.rejects(V.invCreate("2", "x", 5, "tfuel", 7));
  const id = await V.invCreate("2", "Logo design", 10, "tfuel", 7);
  const pub = await V.invPub(id); assert.equal(pub.note, `INV-${id}`); assert.equal(pub.amt, 10);
  await sendCoins({ id: "1", name: "Alice" }, "2", 5000, s, `INV-${id}`); // too little
  await new Promise((r) => setTimeout(r, 120));
  assert.equal((await V.invList("2"))[0].st, "open");
  await sendCoins({ id: "1", name: "Alice" }, "2", 10000, s, `INV-${id}`);
  await new Promise((r) => setTimeout(r, 120));
  const L = await V.invList("2"); assert.equal(L[0].st, "paid"); assert.ok(L[0].paid.by.startsWith("A"));
  await assert.rejects(V.invPub(id), /already paid/);
  const id2 = await V.invCreate("2", "Other", 1, "usdt", 7); await V.invCancel("2", id2);
  await assert.rejects(V.invCancel("1", id2));
  // donation page
  await assert.rejects(V.tippPub("ABCDEFGHJK"));
  await V.tippSet("2", { on: true, title: "Support me", goal: 100 });
  const { getRefCode } = await import("../lib/refcode");
  const code2 = await getRefCode("2");
  await sendCoins({ id: "1", name: "Alice" }, "2", 20000, s, "TIP");
  await new Promise((r) => setTimeout(r, 120));
  const tp = await V.tippPub(code2); assert.equal(tp.raised, 20); assert.equal(tp.recent.length, 1); assert.ok(!JSON.stringify(tp).includes("Alice"));
  assert.match(await V.tippLink("2"), /startapp=tipp_/);
  // lessons
  await C.setCfg2("v26", { lessons: [{ id: "a", title: "Stay safe", body: "x".repeat(40), reward: 50 }, { title: "", body: "no" }], kyc: { on: true, usd: 100 } });
  assert.equal((await V.learnList("1")).length, 1);
  await assert.rejects(V.learnDone("1", "a"), /little more time/);
  await V.learnOpen("1", "a");
  await db().ref("lesson_open/1/a").set(Date.now() - 20000);
  assert.equal(await V.learnDone("1", "a"), 50);
  await assert.rejects(V.learnDone("1", "a"), /already/);
  // recovery codes
  await db().ref("user_prefs/1/pin").set({ h: pinHash("1", "1234") });
  await assert.rejects(V.recNew("1", "0000"));
  const codes = await V.recNew("1", "1234"); assert.equal(codes.length, 8); assert.equal(await V.recLeft("1"), 8);
  await assert.rejects(V.recUse("1", "AAAAAAAAAA"), /isn't valid/);
  await V.recUse("1", codes[0].toLowerCase());
  assert.equal(await db().ref("user_prefs/1/pin").get().then((x) => x.val()), null);
  assert.ok(((await db().ref("user_prefs/1/safe_until").get()).val() || 0) > Date.now());
  assert.equal(await V.recLeft("1"), 7);
  await assert.rejects(V.recUse("1", codes[0]), /isn't valid/);
  // kyc
  await V.assertKyc("2", 50);
  await assert.rejects(V.assertKyc("2", 150), /kyc_required/);
  await assert.rejects(V.kycSubmit("2", "http://x", ""));
  await V.kycSubmit("2", "https://drive.example.com/file/abc123", "passport");
  assert.equal((await V.kycQueue())[0].uid, "2");
  await assert.rejects(V.assertKyc("2", 150));
  await V.kycSet("2", "ok", "");
  await V.assertKyc("2", 150);
  assert.equal((await V.kycQueue()).length, 0);
  // calendar & ledger & smart alerts
  await C.setCfg2("v20", { events: [{ id: "e1", title: "Double", mult: 2, start: Date.now() + 864e5, end: Date.now() + 3 * 864e5, on: true }] });
  const cal = await V.calendar(); assert.ok(cal.some((c) => c.kind === "Event"));
  assert.ok(Array.isArray(await V.ledger(5)));
  await V.runSmartAlerts();
  console.log("v26 OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
import assert from "node:assert/strict";
const sent: any[] = [];
(globalThis as any).fetch = async (_u: string, o: any) => { sent.push(o?.body); return { json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  const { db } = await import("../lib/firebase");
  const { notify, catOf, inQuiet } = await import("../lib/notify");
  const { names } = await import("../lib/leaderboard");
  const { checkAddress } = await import("../lib/addrcheck");
  const { getSettings, invalidateSettings } = await import("../lib/settings");
  assert.equal(catOf("🔐 PIN reset"), "security");
  assert.equal(catOf("💸 You received"), "money");
  assert.equal(catOf("⚡ full"), "rewards");
  assert.equal(catOf("hello"), "news");
  // quiet hours wrap past midnight (tz +360 = Dhaka): 23:00-08:00
  const t = Date.UTC(2026, 0, 1, 18, 0); // 00:00 Dhaka
  assert.ok(inQuiet({ on: true, from: 23, to: 8, tz: 360 }, t));
  assert.ok(!inQuiet({ on: true, from: 23, to: 8, tz: 360 }, Date.UTC(2026, 0, 1, 6, 0))); // 12:00 Dhaka
  assert.ok(!inQuiet(null, t));
  // notif groups: send count with telegram enabled
  await db().ref("settings").set({ notify_enabled: true });
  invalidateSettings();
  await db().ref("user_prefs/1").set({ notif: { rewards: false } });
  const before = sent.length;
  await notify("1", "⚡ energy");
  assert.equal(sent.length, before, "rewards group off → no Telegram");
  await notify("1", "💸 money");
  assert.equal(sent.length, before + 1);
  await notify("1", "🔐 security");
  assert.equal(sent.length, before + 2, "security always");
  await db().ref("user_prefs/1/quiet").set({ on: true, from: 0, to: 23, tz: 0 });
  await notify("1", "💸 money2");
  const inQ = new Date().getUTCHours() < 23;
  assert.equal(sent.length, before + (inQ ? 2 : 3));
  assert.ok(Object.keys((await db().ref("inbox/1").get()).val()).length >= 4, "inbox always stored");
  // leaderboard names
  await db().ref("users/1/name").set("Alice");
  await db().ref("users/2/name").set("Bob");
  await db().ref("user_prefs/2").set({ nick: "Zed" });
  await db().ref("users/3/name").set("Cy");
  await db().ref("user_prefs/3").set({ lb_hide: true });
  const n = await names(["1", "2", "3"]);
  assert.deepEqual(n, { "1": "Alice", "2": "Zed", "3": "Anonymous" });
  // own trusted mode
  const s = await getSettings(true);
  await db().ref("user_prefs/4/wl_only").set(true);
  await assert.rejects(checkAddress("4", "TXabc123456789", s), /addr_not_saved/);
  await checkAddress("5", "TXabc123456789", s); // user without mode: fine
  console.log("v17.1 OK");
})().catch((e) => { console.error(e); process.exit(1); });

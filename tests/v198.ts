import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://x.app";
import assert from "node:assert/strict";
const calls: any[] = [];
(globalThis as any).fetch = async (u: string, init: any) => { calls.push({ u, body: decodeURIComponent(u.replace(/\+/g, " ")) }); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  const { db } = await import("../lib/firebase");
  const { setCfg2, getCfg2 } = await import("../lib/cfg2");
  const { getSettings, invalidateSettings } = await import("../lib/settings");
  const A = await import("../lib/autopost");
  const R = await import("../lib/receipt");
  const S = await import("../lib/shop");
  await db().ref("settings").set({ autopost_enabled: true, autopost_channel: "@mychan", referral_link: "https://t.me/b/app" });
  invalidateSettings();
  // welcome
  await setCfg2("posts", { rules: [], welcome: { enabled: true, text: "Hi {name}!" } });
  assert.equal((await getCfg2(true)).posts.winpost, true, "winpost default on");
  const n0 = calls.length;
  assert.equal(await A.welcomeMembers({ chat: { id: -100, username: "mychan" }, new_chat_members: [{ id: 1, first_name: "Ria" }, { id: 2, is_bot: true, first_name: "Bot" }] }), 1);
  assert.ok(calls.slice(n0).some((c) => c.body.includes("Hi Ria!")));
  assert.equal(await A.welcomeMembers({ chat: { id: -5, username: "other" }, new_chat_members: [{ id: 1, first_name: "X" }] }), 0, "other chats ignored");
  // withdrawal receipt
  await db().ref("usdt_withdrawals/abc123xyz").set({ uid: "7", amount: 5, receive: 4.8, status: "paid", network_name: "BEP20", address: "0x1234567890abcdef1234", created_at: Date.now(), handled_at: Date.now() });
  const r = await R.loadReceipt("WDU-abc123xyz", "7");
  assert.equal(r.dir, "wd"); assert.equal(r.amtText, "5 USDT"); assert.equal(r.st, "paid");
  await assert.rejects(R.loadReceipt("WDU-abc123xyz", "8"), "other users cannot read it");
  const l = R.receiptLinks(r, "7", 1000, "https://x.app");
  assert.ok(l.page.includes("/receipt?t=WDU-abc123xyz") && l.img.includes("receipt-img"));
  assert.equal(await R.botReceipt("7", r, 1000, true), true);
  // buy link
  const u = S.buyUrl("https://x.app", "shop1", 5, "Pro plan");
  const q = new URL(u).searchParams;
  assert.equal(S.buySig("shop1", 5, "Pro plan"), q.get("s"));
  assert.notEqual(S.buySig("shop1", 6, "Pro plan"), q.get("s"));
  await assert.rejects(S.buyOrder("shop1", 6, "Pro plan", q.get("s")!), "tampered amount refused");
  console.log("v19.8 OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

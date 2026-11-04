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
  const PV = await import("../lib/pv");
  const V = await import("../lib/v21");
  const C = await import("../lib/cfg2");
  const { pinHash } = await import("../lib/prefs");
  // pv clean
  const p = PV.pvClean({ rx: "bad", fs: "l", qa: ["send", "x", "send", "daily", "spin", "history", "invite"], ah: 5, cf_t: -3 });
  assert.equal(p.rx, "all"); assert.equal(p.fs, "l"); assert.deepEqual(p.qa, ["send", "daily", "spin", "history"]); assert.equal(p.cf_t, 0);
  // receiver rules
  await PV.pvSet("2", { rx: "none" });
  await assert.rejects(PV.assertReceiverOk("1", "2"));
  await PV.pvSet("2", { rx: "all", rq: "none" });
  await PV.assertReceiverOk("1", "2");
  await assert.rejects(PV.assertRequestOk("2", "1"));
  assert.equal((await db().ref("weekly_users/2").get()).val(), null);
  await PV.pvSet("2", { wk: true }); assert.equal((await db().ref("weekly_users/2").get()).val(), true);
  // brand sanitiser
  const b = C.SECTIONS.brand({ name: "<b>X</b>", logo: "http://bad", accent: "red", label: "abcdefghijklmnop", def_card: "9", nav: [{ id: "boost", name: "Win", hide: true }, { id: "tap", name: "Tap", hide: true }], pages: [{ title: "About", body: "hi<script>" }], popup: { on: true, title: "Hey", link: "javascript:alert(1)" } } as any, C.CFG2_DEFAULTS.brand);
  assert.equal(b.logo, ""); assert.equal(b.accent, "#f5a623"); assert.equal(b.label.length, 12); assert.equal(b.def_card, "1");
  assert.equal(b.nav.find((n) => n.id === "tap")!.hide, false); assert.equal(b.nav.find((n) => n.id === "boost")!.hide, true);
  assert.ok(!b.pages[0].body.includes("<")); assert.equal(b.popup.link, ""); assert.ok(!b.name.includes("<"));
  // invite tree
  await db().ref("referrals/10").set({ a: { name: "A", at: 1, bonus: 100, comm: 50 }, b: { name: "B", at: 2, bonus: 10, comm: 0 } });
  await db().ref("referrals/a").set({ c: { name: "C", at: 3, bonus: 0 } });
  const t = await V.inviteTree("10");
  assert.equal(t.n1, 2); assert.equal(t.n2, 1); assert.equal(t.earned, 160); assert.equal(t.level1[0].name, "A"); assert.equal(t.level1[0].sub[0].name, "C");
  // export hides secrets
  await db().ref("users/10").set({ name: "N", balance: 5 });
  await db().ref("user_prefs/10/pin").set({ h: "secret" });
  await db().ref("user_prefs/10/refcode").set("ABCDEFGHJK");
  const ex: any = await V.exportData("10");
  assert.ok(!JSON.stringify(ex).includes("secret")); assert.equal(ex.account.balance, 5);
  // delete
  await assert.rejects(V.deleteAccount("10", "1111", "nope", true));
  await db().ref("user_prefs/10/pin").set({ h: pinHash("10", "1234") });
  await assert.rejects(V.deleteAccount("10", "0000", "DELETE", true));
  await db().ref("users/10/withdrawals/w1").set({ status: "pending" });
  await assert.rejects(V.deleteAccount("10", "1234", "DELETE", true));
  await db().ref("users/10/withdrawals/w1").set({ status: "paid" });
  await V.deleteAccount("10", "1234", "DELETE", true);
  assert.equal((await db().ref("users/10/banned").get()).val(), true);
  assert.equal((await db().ref("users/10/name").get()).val(), "Deleted user");
  assert.equal((await db().ref("user_prefs/10/pin").get()).val(), null);
  // digest
  await db().ref("admin_logs/a1").set({ at: Date.now(), by: "root", action: "cfg2_save", detail: {} });
  await db().ref("admin_logs/a2").set({ at: Date.now(), by: "root", action: "cfg2_save", detail: {} });
  assert.equal(await V.runAdminDigest(), 1);
  assert.ok(calls.some((c) => c.includes("Admin activity") && c.includes("cfg2_save ×2")));
  assert.equal(await V.runAdminDigest(), 0);
  console.log("v21 OK");
})().catch((e) => { console.error(e); process.exit(1); });

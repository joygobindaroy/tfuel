import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://x.app";
import assert from "node:assert/strict";
const calls: string[] = [];
(globalThis as any).fetch = async (u: string) => { calls.push(decodeURIComponent(String(u).replace(/\+/g, " "))); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  process.env.ADMIN_TELEGRAM_IDS = "999";
  const { db } = await import("../lib/firebase");
  const R = await import("../lib/receipt");
  const { cardStyleOk } = await import("../lib/cardkit");
  const { rcptStyleOk } = await import("../lib/rcptkit");
  const { checkPin, pinHash } = await import("../lib/prefs");
  const { qualifyReferral } = await import("../lib/user");
  // styles
  assert.equal(cardStyleOk("9"), "1"); assert.equal(cardStyleOk("7"), "7");
  assert.equal(rcptStyleOk("x"), "b"); assert.equal(rcptStyleOk("g"), "g");
  // deposit receipt
  await db().ref("deposits/dep123456").set({ uid: "5", amount: 50, credited: 49.5, status: "approved", network_name: "TRC20", txid: "abcdef0123456789", created_at: Date.now(), handled_at: Date.now() });
  const d = await R.loadReceipt("DEP-dep123456", "5");
  assert.equal(d.dir, "dep");
  await assert.rejects(R.loadReceipt("DEP-dep123456", "6"));
  const l = R.receiptLinks(d, "5", 1000, "https://x.app", "f");
  assert.ok(l.img.includes("y=f") && l.page.includes("&y=f"));
  // PIN lock alert
  await db().ref("user_prefs/7/pin").set({ h: pinHash("7", "1234") });
  for (let i = 0; i < 5; i++) await checkPin("7", "0000").catch(() => {});
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(calls.some((c) => c.includes("Withdraw PIN locked") && c.includes("user 7")), "admin alerted");
  // referral guard: same device → held
  await db().ref("settings").set({ referral_enabled: true, referrer_bonus: 100, invitee_bonus: 50, referral_max: 100, coins_per_tfuel: 1000 });
  const { invalidateSettings } = await import("../lib/settings"); invalidateSettings();
  await db().ref("users/10").set({ balance: 0, ref_count: 0 });
  await db().ref("users/11").set({ balance: 0, referred_by: "10", completed_tasks: { a: 1 } });
  await db().ref("user_prefs/10/devices/dev1").set({ last: 1 });
  await db().ref("user_prefs/11/devices/dev1").set({ last: 1 });
  await qualifyReferral("11");
  assert.equal((await db().ref("users/10/balance").get()).val(), 0, "inviter not paid");
  assert.equal((await db().ref("users/11/ref_hold").get()).val(), true);
  // different devices → paid
  await db().ref("users/12").set({ balance: 0, referred_by: "10", completed_tasks: { a: 1 } });
  await db().ref("user_prefs/12/devices/dev2").set({ last: 1 });
  await qualifyReferral("12");
  assert.equal((await db().ref("users/10/balance").get()).val(), 100);
  console.log("v20.2 OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

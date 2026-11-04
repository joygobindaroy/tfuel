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
  const V = await import("../lib/v25");
  const C = await import("../lib/cfg2");
  const B = await import("../lib/broadcast");
  const { sendCoins } = await import("../lib/transfer");
  const { getSettings, invalidateSettings } = await import("../lib/settings");
  const { getRefCode, resolveRef } = await import("../lib/refcode");
  const { faqReply } = await import("../lib/faqbot");
  const old = Date.now() - 5 * 864e5;
  await db().ref("users/1").set({ name: "Alice", balance: 500000, created_at: old, last_seen: Date.now() });
  await db().ref("users/2").set({ name: "Bob", balance: 0, created_at: old, last_seen: Date.now() });
  await db().ref("user_index").set({ 1: { created_at: 1 }, 2: { created_at: 1 } });
  await db().ref("settings").set({ send_enabled: true, send_fee_pct: 1, send_min: 1000, send_daily_limit: 9e9, send_min_age_hours: 24 });
  invalidateSettings();
  const s = await getSettings(true);
  const c2 = await getRefCode("2");
  // combo
  await assert.equal(await V.comboView("1"), null);
  await C.setCfg2("v25", { combo: { on: true, bonus: 200 }, birthday: { on: true, bonus: 500 }, cashback: { on: true, pct: 50, min_fee: 10 }, kw: [{ words: "pin, password", reply: "Use Settings → Withdraw PIN." }], stats_public: true });
  let v: any = await V.comboView("1"); assert.equal(v.ready, false);
  await assert.rejects(V.comboClaim("1"), /Finish all/);
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  await db().ref(`daily_day/${day}/1`).set(3);
  await db().ref("users/1/spin").set({ day, used: 1 });
  await db().ref(`mini_day/1/${day}/memory`).set(1);
  v = await V.comboView("1"); assert.equal(v.ready, true);
  assert.equal(await V.comboClaim("1"), 200);
  await assert.rejects(V.comboClaim("1"), /already/);
  assert.equal((await db().ref("users/1/balance").get()).val(), 500200);
  // birthday
  await assert.rejects(V.bdaySet("1", "13-40"));
  const now = new Date(); const mmdd = `${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  await V.bdaySet("2", mmdd);
  await assert.rejects(V.bdaySet("2", "01-01"), /can't be changed/);
  assert.equal(await V.runBirthdays(), 1); assert.equal(await V.runBirthdays(), 0);
  assert.equal((await db().ref("users/2/balance").get()).val(), 500);
  // alias
  await assert.rejects(V.aliasSet("1", "sam2026"), /creators/);
  await db().ref("users/1/creator").set(true);
  assert.equal(await V.aliasSet("1", "Sam2026"), "sam2026");
  await assert.rejects(V.aliasSet("2", "sam2026"));
  assert.equal(await resolveRef("c_sam2026"), "1"); assert.equal(await resolveRef("c_nope"), null);
  assert.equal(await V.aliasSet("1", "samx"), "samx"); assert.equal(await resolveRef("c_sam2026"), null);
  // contact limit
  await db().ref(`contacts/1/${c2}`).set({ label: "Bob" });
  await V.limitSet("1", c2, 15000, 0);
  await sendCoins({ id: "1", name: "Alice" }, "2", 10000, s, "a");
  await assert.rejects(sendCoins({ id: "1", name: "Alice" }, "2", 6000, s), /contact_limit/);
  await sendCoins({ id: "1", name: "Alice" }, "2", 5000, s, "b");
  await V.limitSet("1", c2, 0, 0);
  await sendCoins({ id: "1", name: "Alice" }, "2", 6000, s, "c");
  // cashback (fees of this month are not last month's → 0, then plant last month rows)
  const d = new Date(); d.setUTCDate(2);
  const last = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 10);
  await db().ref("user_xfers/2").set({ x1: { d: "out", a: "tfuel", amt: 1000, fee: 100, at: last, st: "done" } });
  const realNow = Date.now; (Date as any).now = () => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 2);
  const RealDate = Date; 
  (Date as any).now = realNow;
  // run for current day only when it is 1st–3rd; otherwise verify guard
  const n = await V.runCashback();
  if (new Date().getUTCDate() <= 3) assert.equal(n, 1); else assert.equal(n, 0);
  // keyword reply
  const r = await faqReply("I forgot my PIN", s); assert.equal(r?.text, "Use Settings → Withdraw PIN.");
  // audiences
  await db().ref("users/1/withdrawals/w").set({ created_at: Date.now(), status: "pending" });
  assert.deepEqual(await B.audienceIds({ kind: "wd_no_dep", days: 7 }), ["1"]);
  await db().ref("users/2/deposits/d").set({ status: "approved" });
  assert.deepEqual(await B.audienceIds({ kind: "dep_no_wd" }), ["2"]);
  // admin activity / heatmap
  await db().ref("admin_logs/a1").set({ at: Date.now(), by: "root", action: "payWithdrawal", detail: { id: 1 } });
  await db().ref("admin_logs/a2").set({ at: Date.now(), by: "sara", action: "ticketReply", detail: {} });
  const act = await V.adminActivity(30); assert.equal(act.admins.length, 2); assert.equal(act.money.length, 1);
  const h = await V.heatmap(); assert.equal(h.n, 2);
  // public stats
  const ps: any = await V.pubStats(); assert.equal(ps.users, 2);
  await C.setCfg2("v25", { stats_public: false }); assert.equal(await V.pubStats(), null);
  // milestone
  await db().ref("referrals/1").set({ a: { name: "A", at: 1 } });
  const m = await V.milestone("1"); assert.equal(m.n, 1); assert.ok(m.url.includes("&h=I%20invited"));
  console.log("v25 OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

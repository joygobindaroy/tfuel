import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
import assert from "node:assert/strict";
(globalThis as any).__fakeMail = async () => {};
(globalThis as any).fetch = async () => ({ status: 200, json: async () => ({ ok: true, result: {} }) });
(async () => {
  const { db } = await import("../lib/firebase");
  const T = await import("../lib/transfer");
  const X = await import("../lib/xlink");
  const { setCfg2 } = await import("../lib/cfg2");
  const { getSettings, invalidateSettings } = await import("../lib/settings");
  const old = Date.now() - 3 * 86400000;
  await db().ref("users/1").set({ name: "Alice", balance: 1000000, usdt_u: 50e6, created_at: old });
  await db().ref("users/2").set({ name: "Bob", balance: 0, usdt_u: 0, created_at: old });
  const { getRefCode } = await import("../lib/refcode");
  const bobCode = await getRefCode("2"); const aliceCode = await getRefCode("1");
  await db().ref("settings").set({ send_enabled: true, send_fee_pct: 1, send_min: 1000, send_daily_limit: 900000, send_min_age_hours: 24, referral_link: "https://t.me/b/app" });
  invalidateSettings();
  const s = await getSettings(true);
  const A = { id: "1", name: "Alice" };
  const bal = async (u: string, k = "balance") => Number((await db().ref(`users/${u}/${k}`).get()).val());

  // USDT internal send
  const r1 = await T.sendAsset(A, "2", "usdt", 10e6, s, "lunch");
  assert.equal(r1.fee, 50000, "0.5% fee");
  assert.equal(await bal("1", "usdt_u"), 50e6 - 10e6 - 50000);
  assert.equal(await bal("2", "usdt_u"), 10e6);
  assert.equal(r1.asset, "usdt");
  await assert.rejects(T.sendAsset(A, "2", "usdt", 100000, s), /send_min/);
  await assert.rejects(T.sendAsset(A, "2", "usdt", 600e6, s), /insufficient_usdt|send_limit/);
  assert.equal((await X.listXfers("2")).length, 1, "history for receiver");
  assert.equal((await X.listXfers("1"))[0].a, "usdt");

  // VIP fee discount
  await setCfg2("vip", { enabled: true, price: 3, days: 30, daily_pct: 25, fee_off_pct: 50, badge: "💎" });
  await db().ref("vip/1/until").set(Date.now() + 86400000);
  const r2 = await T.sendAsset(A, "2", "tfuel", 10000, s);
  assert.equal(r2.fee, 50, "VIP halves 1% fee");

  // hold + cancel + release
  await setCfg2("xfer", { usdt: { enabled: true, fee_pct: 0.5, min: 1, daily: 500 }, hold: { tfuel: 20000, usdt: 0, minutes: 10 }, links: { request: true, claim: true, days: 7 } });
  const b0 = await bal("1"), c0 = await bal("2");
  const h = await T.sendAsset(A, "2", "tfuel", 30000, s);
  assert.ok(h.held && h.release_at);
  assert.equal(await bal("2"), c0, "receiver not yet credited");
  assert.equal(await bal("1"), b0 - 30000 - 150);
  await T.cancelHold("1", h.id);
  assert.equal(await bal("1"), b0, "refund after cancel");
  await assert.rejects(T.cancelHold("1", h.id), /xfer_not_cancellable/);
  const h2 = await T.sendAsset(A, "2", "tfuel", 30000, s);
  await db().ref(`xfer_hold/${h2.id}/rel`).set(Date.now() - 1);
  assert.equal(await T.releaseDueHolds(s), 1);
  assert.equal(await bal("2"), c0 + 30000);
  assert.equal((await db().ref(`user_xfers/1/${h2.id}/st`).get()).val(), "done");
  assert.equal(await T.releaseDueHolds(s), 0, "no double release");

  // payment request
  const rq = await X.createRequest("2", "tfuel", 5000, "pizza", s);
  assert.ok(rq.url.includes("startapp=req_"));
  const info = await X.getRequest(rq.id);
  assert.equal(info.code, bobCode);
  await assert.rejects(X.reqHold(rq.id, "2"), /send_self/);
  await X.reqHold(rq.id, "1");
  await assert.rejects(X.reqHold(rq.id, "1"), /request_closed/);
  await X.reqDone(rq.id, false);
  await X.reqHold(rq.id, "1");
  await X.reqDone(rq.id, true, "TFX");
  assert.equal((await X.getRequest(rq.id)).st, "paid");

  // claim link
  const before = await bal("1");
  const L = await X.createLink(A, "tfuel", 10000, "gift", s);
  assert.equal(await bal("1"), before - 10000 - L.fee);
  assert.ok(L.url.includes("startapp=claim_"));
  const pk = await X.peekLink(L.token);
  assert.equal(pk.amount, 10000);
  await assert.rejects(X.claimLink("1", L.token, s), /claim_own/);
  const c1 = await bal("2");
  const got = await X.claimLink("2", L.token, s);
  assert.equal(await bal("2"), c1 + 10000);
  assert.ok(/^TF/.test(got.txid));
  await assert.rejects(X.claimLink("2", L.token, s), /claim_closed/);
  // cancel returns everything
  const b2 = await bal("1");
  const L2 = await X.createLink(A, "usdt", 2e6, "", s);
  const u2 = await bal("1", "usdt_u");
  const lst = await X.listLinks("1", s);
  assert.ok(lst.find((x) => x.id === L2.id)?.url.includes(L2.token), "owner can re-copy link");
  await X.cancelLink("1", L2.id);
  assert.equal(await bal("1", "usdt_u"), u2 + 2e6 + L2.fee);
  assert.equal(await bal("1"), b2);
  // expiry
  const L3 = await X.createLink(A, "tfuel", 5000, "", s);
  await db().ref(`claim_links/${L3.id}/exp`).set(Date.now() - 1);
  assert.equal(await X.expireLinks(), 1);
  assert.equal(await bal("1"), b2);

  // contacts
  await X.saveContact("1", bobCode, "Bob work");
  assert.equal((await X.listContacts("1"))[0].label, "Bob work");
  await assert.rejects(X.saveContact("1", aliceCode, ""), /send_no_user/);
  await X.deleteContact("1", bobCode);
  assert.equal((await X.listContacts("1")).length, 0);
  console.log("v19.4 transfers OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

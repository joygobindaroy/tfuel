import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
import assert from "node:assert/strict";
(globalThis as any).fetch = async () => ({ json: async () => ({ ok: true, result: {} }) });
(async () => {
  const { db } = await import("../lib/firebase");
  const { setCfg2 } = await import("../lib/cfg2");
  const ads = await import("../lib/ads");
  const U = 1e6;
  await db().ref("users/1").set({ name: "Adv", balance: 0, usdt_u: 50 * U, created_at: 1 });
  await db().ref("user_index/1").set(true);
  await db().ref("user_index/2").set(true);
  await setCfg2("adsmkt" as any, { enabled: true, slots: [{ id: "home", kind: "home_banner", name: "Home", price: 2, max_active: 1 }, { id: "pin", kind: "pinned", name: "Pin", price: 10, max_active: 2 }], discounts: [{ days: 7, pct: 10 }], max_days: 30, mission: { enabled: true, price: 0.1, reward: 300, min: 10, max: 1000 }, blocked: ["casino"] });
  const usdt = async () => ((await db().ref("users/1/usdt_u").get()).val() || 0) / U;

  // validation
  await assert.rejects(ads.adsBuy("1", "Adv", { slot: "home", days: 1, title: "Best casino", url: "https://x.example.com" }), /ad_blocked/);
  await assert.rejects(ads.adsBuy("1", "Adv", { slot: "home", days: 1, title: "Hello", url: "http://x.example.com" }), /ad_url/);
  // 7 days → 10% off: 2*7*0.9 = 12.6
  const r = await ads.adsBuy("1", "Adv", { slot: "home", days: 7, title: "My channel", text: "join", url: "https://t.me/mychan" });
  assert.equal(r.price, 12.6);
  assert.equal(await usdt(), 50 - 12.6);
  // slot full (pending counts)
  await assert.rejects(ads.adsBuy("1", "Adv", { slot: "home", days: 1, title: "Another", url: "https://y.example.com" }), /ad_full/);
  // not served until approved
  assert.equal(await ads.pickAd("home_banner", "1"), null);
  await ads.adsApprove(r.id, "admin");
  const ad = await ads.pickAd("home_banner", "1");
  assert.equal(ad?.title, "My channel");
  await ads.adImp(r.id);
  assert.equal(await ads.adClick(r.id), "https://t.me/mychan");
  const o = await ads.getOrder(r.id);
  assert.equal(o.imp, 1); assert.equal(o.clk, 1);
  // stop early refunds the unused part (almost all)
  await ads.adsFinish(r.id, true, "admin");
  assert.ok((await usdt()) > 50 - 0.1);
  assert.equal(await ads.adClick(r.id), null);

  // reject → full refund
  const b0 = await usdt();
  const r2 = await ads.adsBuy("1", "Adv", { slot: "home", days: 1, title: "Second", url: "https://z.example.com" });
  assert.equal(await usdt(), b0 - 2);
  await ads.adsReject(r2.id, "not allowed", "admin");
  assert.equal(await usdt(), b0);
  // cancel by owner
  const r3 = await ads.adsBuy("1", "Adv", { slot: "home", days: 1, title: "Third", url: "https://z.example.com" });
  await assert.rejects(ads.adsCancel("2", r3.id), /forbidden/);
  await ads.adsCancel("1", r3.id);
  assert.equal(await usdt(), b0);

  // pinned message goes out as a broadcast
  const r4 = await ads.adsBuy("1", "Adv", { slot: "pin", title: "Big news", text: "hello all", url: "https://news.example.com" });
  assert.equal(r4.price, 10);
  await ads.adsApprove(r4.id, "admin");
  assert.equal((await ads.getOrder(r4.id)).status, "ended");
  const bc = ((await db().ref("broadcasts").get()).val() || {}) as Record<string, any>;
  assert.equal(Object.keys(bc).length, 1);

  // mission pack: 100 completions * 0.1 = 10 USDT, approved → task; 40 done, finish → refund 6
  const b1 = await usdt();
  const m = await ads.adsBuy("1", "Adv", { mission: true, goal: 100, days: 5, title: "Visit us", url: "https://m.example.com" });
  assert.equal(m.price, 10);
  await ads.adsApprove(m.id, "admin");
  const mo = await ads.getOrder(m.id);
  const task = (await db().ref(`tasks/${mo.task_id}`).get()).val();
  assert.equal(task.budget, 100); assert.equal(task.reward, 300); assert.equal(task.sponsor, "Adv");
  await db().ref(`task_stats/${mo.task_id}/done`).set(40);
  await ads.adsFinish(m.id, false);
  assert.equal(await usdt(), b1 - 10 + 6);
  assert.equal((await db().ref(`tasks/${mo.task_id}`).get()).val(), null);

  // expiry job
  const r5 = await ads.adsBuy("1", "Adv", { slot: "home", days: 1, title: "Short", url: "https://s.example.com" });
  await ads.adsApprove(r5.id, "admin");
  await db().ref(`ad_active/${r5.id}/end`).set(Date.now() - 1000);
  assert.equal(await ads.adsExpire(), 1);
  assert.equal((await ads.getOrder(r5.id)).status, "ended");

  const list = await ads.adsAdminList();
  assert.ok(list.recent.length >= 4);
  const view = await ads.adsView("1");
  assert.ok(view.mine.length >= 5);
  console.log("v19.0 OK");
})().catch((e) => { console.error(e); process.exit(1); });

import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
import assert from "node:assert/strict";
(globalThis as any).__fakeMail = async () => {};
(globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: {} }) });
(async () => {
  const { db } = await import("../lib/firebase");
  const { setCfg2 } = await import("../lib/cfg2");
  const { getSettings, invalidateSettings } = await import("../lib/settings");
  const { seal } = await import("../lib/secretbox");
  const S = await import("../lib/shop");
  await db().ref("settings").set({ shops_enabled: true, referral_link: "https://t.me/b/app" });
  invalidateSettings();
  const s = await getSettings(true);
  await setCfg2("plus", { sched: { enabled: true, max: 3 }, alert: { tfuel: 0, usdt: 0 }, quest: { enabled: false, plays: 2, bonus: 50, streak_days: 7, streak_bonus: 500 }, trial_days: 0, tour_remind: true, subs: true, nudges: true });
  await db().ref("users/1").set({ name: "A", balance: 0, usdt_u: 50e6, created_at: 1 });
  const shop: any = { name: "Shop", domain: "https://shop.example.com", login_url: "https://shop.example.com/a", secret: seal("tfs_x"), enabled: true, fee_pct: 10, allow_tfuel: true, allow_usdt: true, max_usd: 100, created_at: 1 };
  await db().ref("shops/sh").set(shop);
  await db().ref("shop_coupons/sh/SAVE20").set({ pct: 20, max: 1, used: 0, exp: 0, active: true, created: 1 });

  // coupon: user pays 20% less, shop fee/owed still on the full amount, single use
  const o1: any = await S.createShopOrder("sh", shop, s, { ref: "a1", usd: 10, title: "X" });
  const r = await S.couponApply("1", o1.order_id, "save20");
  assert.equal(r.pay, 8);
  await S.payOrder("1", "A", o1.order_id, "usdt");
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 42e6, "paid 8 USDT, not 10");
  const paid: any = (await db().ref(`shop_orders/${o1.order_id}`).get()).val();
  assert.equal(paid.fee_u, 1e6, "fee stays 10% of the full $10");
  const o2: any = await S.createShopOrder("sh", shop, s, { ref: "a2", usd: 10, title: "Y" });
  await assert.rejects(S.couponApply("1", o2.order_id, "SAVE20"), /coupon_used_up|coupon_already_used/);
  await assert.rejects(S.couponApply("1", o2.order_id, "NOPE12"), /coupon_invalid/);

  // pause / resume subscription
  const o3: any = await S.createShopOrder("sh", shop, s, { ref: "sub1", usd: 5, title: "Pro", sub: 7 });
  await S.payOrder("1", "A", o3.order_id, "usdt");
  const id = (await S.subList("1"))[0].id;
  await S.subPause("1", id, true);
  assert.equal((await db().ref(`shop_subs/${id}/st`).get()).val(), "paused");
  await db().ref(`shop_subs/${id}/next`).set(Date.now() - 1000);
  assert.equal(await S.runSubs(), 0, "paused subs are not charged");
  await S.subPause("1", id, false);
  assert.equal((await db().ref(`shop_subs/${id}/st`).get()).val(), "active");
  console.log("v19.6 OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

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
  const P = await import("../lib/plus");
  await db().ref("settings").set({ shops_enabled: true, referral_link: "https://t.me/b/app", send_enabled: true, send_min: 1000, send_fee_pct: 1, send_daily_limit: 0, send_min_age_hours: 0 });
  invalidateSettings();
  const s = await getSettings(true);
  await setCfg2("plus", { sched: { enabled: true, max: 3 }, alert: { tfuel: 0, usdt: 0 }, quest: { enabled: true, plays: 2, bonus: 50, streak_days: 2, streak_bonus: 500 }, trial_days: 3, tour_remind: true, subs: true });
  await setCfg2("vip", { enabled: true, price: 3, days: 30, daily_pct: 25, fee_off_pct: 50, badge: "💎" });
  await db().ref("users/1").set({ name: "A", balance: 100000, usdt_u: 20e6, created_at: 1 });
  await db().ref("users/2").set({ name: "B", balance: 0, usdt_u: 0, created_at: 1 });
  const shop: any = { name: "Shop", domain: "https://shop.example.com", login_url: "https://shop.example.com/a", secret: seal("tfs_x"), enabled: true, fee_pct: 0, allow_tfuel: true, allow_usdt: true, max_usd: 100, created_at: 1 };
  await db().ref("shops/sh").set(shop);

  // subscription: first payment creates it, cron renews, failures cancel
  const o: any = await S.createShopOrder("sh", shop, s, { ref: "plan", usd: 5, title: "Pro", sub: 7 });
  await S.payOrder("1", "A", o.order_id, "usdt");
  let subs = await S.subList("1");
  assert.equal(subs.length, 1);
  assert.equal(subs[0].every, 7);
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 15e6);
  const sid = subs[0].id;
  assert.equal(await S.runSubs(), 0, "not due yet");
  await db().ref(`shop_subs/${sid}/next`).set(Date.now() - 1000);
  assert.equal(await S.runSubs(), 1, "renewed");
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), 10e6);
  assert.equal((await db().ref(`shop_subs/${sid}/n`).get()).val(), 2);
  await db().ref("users/1/usdt_u").set(0);
  for (let i = 0; i < 3; i++) { await db().ref(`shop_subs/${sid}/next`).set(Date.now() - 1000); await S.runSubs(); }
  assert.equal((await S.subList("1")).length, 0, "cancelled after 3 failed charges");
  // user cancel
  const o2: any = await S.createShopOrder("sh", shop, s, { ref: "plan2", usd: 1, title: "Mini", sub: 30 });
  await db().ref("users/1/usdt_u").set(5e6);
  await S.payOrder("1", "A", o2.order_id, "usdt");
  const id2 = (await S.subList("1"))[0].id;
  await S.subCancel("1", id2);
  assert.equal((await S.subList("1")).length, 0);

  // VIP trial: once
  const t: any = await P.vipTrial("2");
  assert.ok(t.until > Date.now());
  await assert.rejects(P.vipTrial("2"), /trial_used/);

  // quest: 2 plays pays once
  assert.deepEqual(await P.questTick("2").then((r) => r && r.done), false);
  const q: any = await P.questTick("2");
  assert.ok(q.done && q.bonus >= 50);
  const q2: any = await P.questTick("2");
  assert.equal(q2.bonus, 0, "paid once per day");

  // scheduled send
  const sc = await P.schedCreate({ id: "1", name: "A" }, { uid: "2", name: "B", code: "ABCDEFGHIJ" }, "tfuel", 5000, "rent", Date.now() + 10 * 60000, "weekly");
  assert.equal((await P.schedList("1")).length, 1);
  await db().ref(`user_sched/1/${sc.id}/next`).set(Date.now() - 1000);
  await db().ref(`sched_due/${sc.id}/next`).set(Date.now() - 1000);
  const ran = await P.runScheds(s);
  assert.equal(ran, 1);
  assert.equal((await db().ref("users/2/balance").get()).val() >= 5000, true);
  const rep: any = await P.spendReport("1", 0, 1000);
  assert.ok(rep.tfuel.n >= 1);
  console.log("v19.5 OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

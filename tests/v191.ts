import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
import assert from "node:assert/strict";
(globalThis as any).fetch = async () => ({ json: async () => ({ ok: true, result: {} }) });
(async () => {
  const { db } = await import("../lib/firebase");
  const { setCfg2, getCfg2 } = await import("../lib/cfg2");
  const eng = await import("../lib/eng");
  const { getSettings } = await import("../lib/settings");
  const s = await getSettings(true);
  const day = new Date().toISOString().slice(0, 10);
  const old = Date.now() - 3 * 86400000;
  await db().ref("users/1").set({ name: "Alice", balance: 1e6, created_at: old, earn: { tap: 0 }, ref_count: 12 });
  await db().ref("users/2").set({ name: "Bob", balance: 1000, created_at: old, referred_by: "1" });
  await db().ref("users/3").set({ name: "Cy", balance: 1000, created_at: old });
  await db().ref("referrals/1/2").set({ at: 1 });
  await setCfg2("eng" as any, { levelup: { enabled: true, base: 100 }, luckybox: { enabled: true, min: 10, max: 20, per_day: 2 }, adboost: { enabled: true, minutes: 60, mult: 2, per_day: 2 }, gift: { enabled: true, send: 5, recv: 7, per_day: 2 }, invms: { enabled: true, steps: [{ n: 10, coins: 500 }, { n: 50, coins: 9000 }] }, creator: { enabled: true, bonus_pct: 3, min_subs: 100 }, pass: { enabled: true, price: 1000, days: 30, daily: 40 }, plate: { enabled: true, price: 500, max: 12 }, tip: { enabled: true, fee_pct: 2, amounts: [100, 500] } });
  const cfg = await getCfg2(true);
  const bal = async (id: string) => (await db().ref(`users/${id}/balance`).get()).val();

  // level-up: first check records, a later level pays
  let u: any = (await db().ref("users/1").get()).val();
  assert.equal(await eng.levelCheck("1", u, cfg), null);
  await db().ref("users/1/earn").set({ tap: 5000 }); // level jumps
  u = (await db().ref("users/1").get()).val();
  const lv = await eng.levelCheck("1", u, cfg);
  assert.ok(lv && lv.coins > 0 && lv.to > lv.from);
  assert.equal(await eng.levelCheck("1", u, cfg), null, "paid once");

  // gifts
  const g = await eng.giftList("1");
  assert.equal(g.friends.length, 1);
  const b2 = await bal("2"), b1 = await bal("1");
  await eng.giftSend("1", "Alice", "2");
  assert.equal(await bal("2"), b2 + 7); assert.equal(await bal("1"), b1 + 5);
  await assert.rejects(eng.giftSend("1", "Alice", "2"), /gift_limit/);
  await assert.rejects(eng.giftSend("1", "Alice", "3"), /gift_not_friend/);

  // milestones
  const before = await bal("1");
  assert.equal(await eng.msClaim("1", 10), 500);
  assert.equal(await bal("1"), before + 500);
  await assert.rejects(eng.msClaim("1", 10), /already_claimed/);
  await assert.rejects(eng.msClaim("1", 50), /ms_not_ready/);

  // creator
  await assert.rejects(eng.creatorApply("3", "Cy", "https://t.me/cy", 10), /creator_min/);
  await eng.creatorApply("3", "Cy", "https://t.me/cy", 500);
  await assert.rejects(eng.creatorApply("3", "Cy", "https://t.me/cy", 500), /creator_exists/);
  assert.equal((await eng.creatorList())[0].status, "pending");
  assert.equal(eng.creatorBonus({ creator: true }, cfg), 3);
  await eng.creatorSet("3", "approved", "");
  assert.equal(((await db().ref("users/3/creator").get()).val()), true);
  await eng.creatorSet("3", "revoked", "");
  assert.equal(((await db().ref("users/3/creator").get()).val()), null);

  // pass
  await assert.rejects(eng.passClaim("1"), /pass_inactive/);
  const until = await eng.passBuy("1");
  assert.ok(until > Date.now());
  const p0 = await bal("1");
  assert.equal(await eng.passClaim("1"), 40);
  assert.equal(await bal("1"), p0 + 40);
  await assert.rejects(eng.passClaim("1"), /already_claimed/);

  // plate
  await assert.rejects(eng.plateBuy("1", "ab"), /plate_bad/);
  await assert.rejects(eng.plateBuy("1", "visit t.me/x"), /plate_bad/);
  assert.equal(await eng.plateBuy("1", "King Tap"), "King Tap");
  assert.equal((await db().ref("user_prefs/1/plate").get()).val(), "King Tap");
  await eng.plateClear("1");
  assert.equal((await db().ref("user_prefs/1/plate").get()).val(), null);

  // tips: clan mates only
  await assert.rejects(eng.tipSend("3", "Cy", "2", 100, { ...s, send_enabled: true }), /tip_clan_only/);
  await db().ref().update({ "users/1/clan": "c1", "users/4/clan": "c1", "clan_members/c1/1": 1, "clan_members/c1/4": 1, "clans/c1": { name: "X", tag: "X", owner: "1", members: 2 } });
  await db().ref("users/4").set({ name: "Di", balance: 1000, created_at: old, clan: "c1" });
  const t0 = await bal("4");
  await eng.tipSend("1", "Alice", "4", 100, { ...s, send_enabled: true, send_min_age_hours: 0, send_daily_limit: 0 });
  assert.equal(await bal("4"), t0 + 100);
  await assert.rejects(eng.tipSend("1", "Alice", "4", 123, { ...s, send_enabled: true }), /bad_amount/);

  // clan announcement
  const { clanAnnounce } = await import("../lib/clan");
  await clanAnnounce("1", "Raid tonight at 8!");
  assert.equal((await db().ref("clans/c1/ann").get()).val(), "Raid tonight at 8!");
  await assert.rejects(clanAnnounce("1", "again"), /clan_ann_wait/);
  await assert.rejects(clanAnnounce("4", "hello there"), /clan_owner_only/);

  // state + box/boost helpers
  const st = await eng.engState("1", (await db().ref("users/1").get()).val(), { ...s, ads_enabled: true }, cfg);
  assert.equal(st.box.on, true); assert.equal(st.pass.claimed, true); assert.equal(st.ms.steps[0].claimed, true);
  const box = eng.rollBox(cfg); assert.ok(box >= 10 && box <= 20);
  assert.equal(eng.adBoostActive({ ab_until: Date.now() + 1000 }, cfg, Date.now()), true);
  void day;
  console.log("v19.1 OK");
})().catch((e) => { console.error(e); process.exit(1); });

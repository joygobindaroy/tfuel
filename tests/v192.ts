import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
import assert from "node:assert/strict";
const sent: string[] = [];
(globalThis as any).fetch = async (u: string, o?: any) => { sent.push(String(o?.body || u)); return { json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  const { db } = await import("../lib/firebase");
  const cfgMod: any = await import("../lib/cfg2");
  const set = async (k: string, v: any) => { await cfgMod.setCfg2(k, v); cfgMod.invalidateCfg2?.(); };
  const now = Date.now();

  // ---- A/B test: stable 50/50 split, B gets the multiplier only while on
  const ab = await import("../lib/abtest");
  const groups = Array.from({ length: 200 }, (_, i) => ab.abGroup(String(1000 + i)));
  const nb = groups.filter((g) => g === "B").length;
  assert.ok(nb > 60 && nb < 140, "roughly half");
  assert.equal(ab.abGroup("1234"), ab.abGroup("1234"));
  const idA = Array.from({ length: 50 }, (_, i) => String(2000 + i)).find((i) => ab.abGroup(i) === "A")!;
  const idB = Array.from({ length: 50 }, (_, i) => String(2000 + i)).find((i) => ab.abGroup(i) === "B")!;
  assert.equal(await ab.abMult(idB), 1);
  await set("ab", { enabled: true, name: "t", mult_b: 1.5 });
  assert.equal(await ab.abMult(idB), 1.5);
  assert.equal(await ab.abMult(idA), 1);
  await db().ref(`users/${idA}`).set({ name: "A", balance: 0, created_at: now - 9e8, last_seen: now });
  await db().ref(`users/${idB}`).set({ name: "B", balance: 0, created_at: now - 9e8, last_seen: now });
  const st = await ab.abStats();
  assert.equal(st.a.users + st.b.users, 2);

  // ---- risk + auto-ban
  const risk = await import("../lib/risk");
  await db().ref("users/10").set({ name: "Bot", balance: 5, created_at: now - 3600000 * 10, bot_flagged: now, earn: { tap: 9e9 } });
  await db().ref("user_prefs/10").set({ ip_shared: 4 });
  await db().ref("users/11").set({ name: "Ok", balance: 5, created_at: now - 9e8 });
  const sc = await risk.scanRisk();
  assert.ok(sc.rows.some((r) => r.id === "10") && !sc.rows.some((r) => r.id === "11"));
  assert.equal(await risk.runAutoBan(), 0, "off by default");
  await set("autoban", { enabled: true, min_score: 4, action: "freeze", max_per_run: 5 });
  assert.equal(await risk.runAutoBan(), 1);
  assert.equal((await db().ref("frozen/10").get()).val().by, "auto-risk");
  assert.equal(await risk.runAutoBan(), 0, "not twice");
  await risk.riskClear("10");
  assert.equal((await db().ref("frozen/10").get()).val(), null);
  assert.equal(await risk.runAutoBan(), 0, "cleared accounts are left alone");

  // ---- snapshots
  const sn = await import("../lib/snapshot");
  await db().ref("users/20").set({ name: "S", balance: 1000, usdt_u: 5_000_000, created_at: now });
  const s1 = await sn.snapCreate("admin");
  await db().ref("users/20").update({ balance: 7, usdt_u: 0 });
  const lk = await sn.snapLook(s1.id, "20");
  assert.equal(lk.snap.coins, 1000); assert.equal(lk.now.coins, 7);
  await sn.snapRestoreUser(s1.id, "20", "admin", "test");
  assert.equal((await db().ref("users/20/balance").get()).val(), 1000);
  assert.equal((await db().ref("users/20/usdt_u").get()).val(), 5_000_000);
  await assert.rejects(sn.snapLook(s1.id, "999"), /not in that snapshot/);
  assert.equal(await sn.snapDaily(), true);
  assert.equal(await sn.snapDaily(), false);

  // ---- price-move alerts
  const mv = await import("../lib/moves");
  const { parseSettings } = await import("../lib/settings") as any;
  const s: any = { price_override: 1.0 };
  await db().ref("user_prefs/30").set({ mv: 5 }); await db().ref("mv_users/30").set(5);
  await db().ref("users/30").set({ name: "M", balance: 1, created_at: now });
  assert.equal(await mv.sendMoveAlerts(s), 0, "first run only sets the reference");
  s.price_override = 1.02;
  assert.equal(await mv.sendMoveAlerts(s), 0, "2% < 5%");
  s.price_override = 1.07;
  assert.equal(await mv.sendMoveAlerts(s), 1);
  assert.equal(await mv.sendMoveAlerts(s), 0, "once per period");

  // ---- weekly auto-convert
  const ac = await import("../lib/autoconv");
  const wk = (await import("../lib/wallet")).weekIndex();
  await set("autoconv", { enabled: true, options: [10, 25], weekly: true });
  const ss: any = { price_override: 0.5, trade_enabled: true, sell_enabled: true, coins_per_tfuel: 1000, trade_fee_pct: 1, min_trade_usdt: 0.1 };
  await db().ref("users/40").set({ name: "W", balance: 10_000_000, created_at: now, acw_pct: 25, acw_last: wk - 1 });
  let u40 = (await db().ref("users/40").get()).val();
  const sold = await ac.settleWeekly("40", u40, ss, now);
  assert.equal(sold, 2_500_000);
  u40 = (await db().ref("users/40").get()).val();
  assert.equal(u40.balance, 7_500_000);
  assert.ok(u40.usdt_u > 0 && u40.acw_last === wk);
  assert.equal(await ac.settleWeekly("40", u40, ss, now), 0, "once per week");

  // ---- i18n
  const { tr } = await import("../lib/i18n");
  assert.equal(tr("Settings"), "সেটিংস");
  assert.equal(tr("  Withdraw  "), "উত্তোলন");
  assert.equal(tr("Some unknown text"), "Some unknown text");
  assert.equal(tr("I’ve sent it"), "আমি পাঠিয়েছি");
  void parseSettings;
  console.log("v19.2 OK");
})().catch((e) => { console.error(e); process.exit(1); });

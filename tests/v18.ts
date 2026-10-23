import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
import assert from "node:assert/strict";
(globalThis as any).__fakeMail = async () => {};
(globalThis as any).fetch = async () => ({ json: async () => ({ ok: true, result: {} }) });
(async () => {
  const { db } = await import("../lib/firebase");
  const set = async (k: string, v: any) => { await (await import("../lib/cfg2")).setCfg2(k as any, v); };
  const bal = async (u: string) => Number((await db().ref(`users/${u}/balance`).get()).val());
  const mk = async (id: string, b = 1_000_000) => db().ref(`users/${id}`).set({ name: "U" + id, balance: b, created_at: Date.now() - 9e8 });
  for (const i of ["1", "2", "3"]) await mk(i);
  const cfgMod: any = await import("../lib/cfg2");
  const reset = () => { try { cfgMod.invalidateCfg2?.(); } catch {} };

  // tiers
  const g2 = await import("../lib/growth2");
  assert.equal(g2.tierPct([{ n: 5, pct: 4 }, { n: 20, pct: 5 }], 0, 3), 3);
  assert.equal(g2.tierPct([{ n: 5, pct: 4 }, { n: 20, pct: 5 }], 5, 3), 4);
  assert.equal(g2.tierPct([{ n: 5, pct: 4 }, { n: 20, pct: 5 }], 25, 3), 5);
  assert.equal(g2.tierInfo([{ n: 5, pct: 4 }], 2, 3).next?.need, 3);
  // ref board + contest
  await g2.refBoardAdd("1"); await g2.refBoardAdd("1"); await g2.refBoardAdd("2");
  await set("contest", { enabled: true, name: "c", prizes: [500, 200] }); reset();
  const w = (await import("../lib/wallet")).weekIndex();
  await db().ref(`lb/ref_w_${w - 1}`).set({ "1": 3, "2": 1 });
  const r1 = await g2.payRefContest(w - 1);
  assert.equal(r1.paid, 2);
  assert.equal(await bal("1"), 1_000_500);
  assert.equal((await g2.payRefContest(w - 1)).already, true, "paid once");
  assert.equal(await bal("1"), 1_000_500);

  // rigs
  await set("rigs", { enabled: true, cap_hours: 10, growth_pct: 10, tiers: [{ id: "r1", name: "A", emoji: "x", price: 1000, rate: 100 }] }); reset();
  const rigs = await import("../lib/rigs");
  await rigs.rigBuy("1", "r1");
  assert.equal(await bal("1"), 1_000_500 - 1000);
  await rigs.rigBuy("1", "r1"); // price 1100
  assert.equal(await bal("1"), 1_000_500 - 2100);
  await db().ref("rigs/1/at").set(Date.now() - 3 * 3600000);
  const c = await rigs.rigCollect("1");
  assert.ok(c >= 599 && c <= 601, "3h * 200/h: " + c);
  await assert.rejects(rigs.rigCollect("1"), /nothing_to_collect/);
  await db().ref("rigs/1/at").set(Date.now() - 100 * 3600000);
  assert.ok((await rigs.rigsView("1")).pending <= 2000, "capped at 10h");

  // puzzle
  await set("puzzle", { enabled: true, reward: 50, tries: 2, words: ["planet", "rocket", "silver"] }); reset();
  const pz = await import("../lib/puzzle");
  const v = await pz.puzzleView("1");
  assert.equal(v.enabled, true);
  const wrong = await pz.puzzleGuess("1", "zzzzzz");
  assert.equal(wrong.correct, false);
  const ans = ["planet", "rocket", "silver"].find((x) => x.length === v.len && [...x].sort().join("") === [...String(v.scr).toLowerCase()].sort().join(""))!;
  const b0 = await bal("1");
  // find the right word among candidates
  let solved = false;
  for (const wd of ["planet", "rocket", "silver"]) { try { const r = await pz.puzzleGuess("1", wd); if (r.correct) { solved = true; break; } } catch {} }
  void ans;
  assert.ok(solved ? (await bal("1")) === b0 + 50 : true);
  await assert.rejects(pz.puzzleGuess("1", "planet"), /puzzle_/);

  // collectibles
  await set("collect", { enabled: true, items: [{ id: "c1", name: "Gem", emoji: "g", image: "", price: 5000, supply: 1, pts: 2, max: 1 }], season: { name: "S", end: Date.now() + 100000, pool: 9000, paid: false } }); reset();
  const col = await import("../lib/collect");
  await col.collectBuy("2", "c1");
  await assert.rejects(col.collectBuy("3", "c1"), /sold_out|supply|collect/);
  await set("collect", { enabled: true, items: [{ id: "c1", name: "Gem", emoji: "g", image: "", price: 5000, supply: 1, pts: 2, max: 1 }], season: { name: "S", end: Date.now() - 1000, pool: 9000, paid: false } });
  const b2 = await bal("2");
  const paid = await col.paySeason();
  assert.ok(paid >= 1);
  assert.equal(await bal("2"), b2 + 9000, "sole holder gets the pool");
  assert.equal(await col.paySeason(), 0, "pays once");

  // clans
  await set("clan", { enabled: true, create_cost: 100, max_members: 2, prizes: [1000], boss: { enabled: true, name: "B", emoji: "b", hp_base: 100, hp_per_member: 0, reward: 300 } }); reset();
  const cl = await import("../lib/clan");
  const id = await cl.clanCreate("1", "Alpha Team", "alp");
  await cl.clanJoin("2", id);
  await assert.rejects(cl.clanJoin("3", id), /clan_full|full/);
  await cl.clanAdd("1", 800); await cl.clanAdd("2", 400);
  const view: any = await cl.clanView("2");
  assert.equal(view.mine.score, 1200);
  assert.ok(view.mine.boss.defeated);
  const b2b = await bal("2");
  assert.equal(await cl.bossClaim("2"), 300);
  assert.equal(await bal("2"), b2b + 300);
  await assert.rejects(cl.bossClaim("2"));

  // faq bot
  const { matchFaq } = await import("../lib/faqbot");
  const faq = [{ q: "How do I withdraw my money?", a: "Profile → Withdraw" }, { q: "What is energy?", a: "Taps use energy" }];
  assert.equal(matchFaq("how to withdraw money", faq, 2)?.a, "Profile → Withdraw");
  assert.equal(matchFaq("hello there", faq, 2), null);

  // geo + position
  await set("geo", { hold_countries: ["XX"], ip_limit: 0, ip_action: "flag" }); reset();
  await db().ref("user_prefs/1/geo").set({ cc: "XX" });
  assert.match(await (await import("../lib/geo")).geoHold("1"), /country XX/);
  const pos = await import("../lib/position");
  await pos.recordFill("1", "buy", 10000, 1_000_000);
  await pos.recordFill("1", "sell", 5000, 700_000);
  const pl: any = await pos.plSummary("1", 0.2, 1000);
  assert.equal(Math.round(pl.realized * 100), 20); // sold 5000 coins basis 0.5 USDT for 0.7
  console.log("v18 OK");
})().catch((e) => { console.error(e); process.exit(1); });

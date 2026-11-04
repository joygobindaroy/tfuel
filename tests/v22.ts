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
  const V = await import("../lib/v22");
  const PV = await import("../lib/pv");
  const C = await import("../lib/cfg2");
  const { getRefCode } = await import("../lib/refcode");
  const B = await import("../lib/broadcast");
  await db().ref("users/1").set({ name: "A", balance: 5000, created_at: Date.now() - 9 * 864e5, last_seen: Date.now() });
  await db().ref("users/2").set({ name: "B", balance: 10, created_at: Date.now() - 100 * 864e5, last_seen: Date.now() - 40 * 864e5 });
  await db().ref("user_index").set({ 1: { created_at: 1 }, 2: { created_at: 1 } });
  const c1 = await getRefCode("1"), c2 = await getRefCode("2");
  // block
  await V.blockSet("2", c1, true);
  await assert.rejects(PV.assertReceiverOk("1", "2"), /recipient_blocks/);
  await assert.rejects(PV.assertRequestOk("2", "1"), /requests_off/);
  await PV.assertReceiverOk("2", "1");
  assert.equal((await V.blockList("2"))[0].code, c1);
  await V.blockSet("2", c1, false);
  await PV.assertReceiverOk("1", "2");
  await assert.rejects(V.blockSet("2", c2, true));
  // templates
  assert.deepEqual(await V.tplSet("1", ["Rent", "", "Lunch<b>"]), ["Rent", "Lunch b"]);
  // mute
  await V.muteSet("1", { promo: true });
  assert.equal((await V.muteGet("1")).promo, true);
  // feedback
  await V.fbSubmit("1", "app", 5, "great");
  await assert.rejects(V.fbSubmit("1", "app", 4, ""), /already/);
  await assert.rejects(V.fbSubmit("2", "app", 9, ""));
  const fa = await V.fbAdmin(); assert.equal(fa.app.avg, 5); assert.equal(fa.list[0].text, "great");
  assert.equal(await V.fbAsk("1"), false); assert.equal(await V.fbAsk("2"), true);
  // polls
  await db().ref("cfg2/v22").set(JSON.stringify(C.SECTIONS.v22({ polls: [{ id: "p1", title: "T", on: true, qs: [{ q: "Q?", opts: ["a", "b", ""] }, { q: "bad", opts: ["x"] }] }], help: [{ q: "How?", a: "Like this" }, { q: "", a: "x" }] } as any, C.CFG2_DEFAULTS.v22)));
  C.invalidateCfg2();
  const pl = await V.pollsFor("1"); assert.equal(pl.length, 1); assert.equal(pl[0].qs.length, 1); assert.equal(pl[0].qs[0].opts.length, 2);
  await assert.rejects(V.pollVote("1", "p1", [5]));
  await V.pollVote("1", "p1", [1]);
  await assert.rejects(V.pollVote("1", "p1", [0]), /already/);
  const pl2 = await V.pollsFor("1"); assert.deepEqual(pl2[0].results!.qs[0], [0, 1]);
  assert.equal((await C.getCfg2()).v22.help.length, 1);
  // reports
  await assert.rejects(V.reportUser("1", c2, "x"));
  await V.reportUser("1", c2, "asked me for my PIN");
  await V.reportUser("1", c2, "again scam message");
  const rl = await V.reportsList("open"); assert.equal(rl.length, 2); assert.equal(rl[0].count, 2);
  await V.reportResolve(rl[0].id, "done", "ok");
  assert.equal((await V.reportsList("open")).length, 1);
  // audiences
  assert.deepEqual(await B.audienceIds({ kind: "inactive", days: 30 }), ["2"]);
  assert.deepEqual(await B.audienceIds({ kind: "new", days: 30 }), ["1"]);
  assert.deepEqual(await B.audienceIds({ kind: "rich", min: 1000 }), ["1"]);
  console.log("v22 OK");
})().catch((e) => { console.error(e); process.exit(1); });

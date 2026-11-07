import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://x.app";
import assert from "node:assert/strict";
(globalThis as any).fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, result: {} }) });
(async () => {
  const { db } = await import("../lib/firebase");
  const V = await import("../lib/v23");
  const C = await import("../lib/cfg2");
  await db().ref("users/1").set({ name: "A", balance: 0 });
  await db().ref("users/2").set({ name: "B", balance: 0 });
  // goal & bio
  assert.deepEqual(await V.goalSet("1", "<b>Phone", 5000), { name: "b Phone", target: 5000, vault: 0 });
  assert.equal(await V.goalSet("1", "x", 0), null);
  await assert.rejects(V.goalSet("1", "x", "abc"));
  assert.equal(await V.bioSet("1", "  hi<script>  "), "hi script");
  // draw
  await C.setCfg2("v23", { draw: { on: true, title: "T", prize: 100, end: Date.now() + 5000, every_days: 7, per_friend: 2 } });
  await V.drawJoin("1"); await V.drawJoin("1"); await V.drawJoin("2");
  let v: any = await V.drawView("1"); assert.equal(v.entrants, 2); assert.equal(v.tickets, 1);
  await db().ref("referrals/1/k").set({ name: "K", at: Date.now(), bonus: 0 });
  v = await V.drawView("1"); assert.equal(v.tickets, 3);
  assert.equal(await V.runDraw(), 0); // not ended yet
  const d0 = (await C.getCfg2(true)).v23.draw;
  const ne = Date.now() - 1000; await db().ref(`draw_entries/${ne}`).set((await db().ref(`draw_entries/${d0.end}`).get()).val());
  await C.setCfg2("v23", { draw: { ...d0, end: ne } });
  assert.equal(await V.runDraw(), 1);
  const after = (await C.getCfg2(true)).v23.draw;
  assert.ok(after.winner && after.winner.prize === 100); assert.ok(after.end > Date.now());
  const total = ((await db().ref("users/1/balance").get()).val() || 0) + ((await db().ref("users/2/balance").get()).val() || 0);
  assert.equal(total, 100);
  await assert.rejects(V.drawJoin("3").then(async () => { await C.setCfg2("v23", { draw: { ...after, on: false } }); await V.drawJoin("4"); }));
  // api key
  const k = await V.apiKeyNew();
  assert.equal(await V.apiKeyOk(k), true); assert.equal(await V.apiKeyOk("ext_" + "0".repeat(40)), false); assert.equal(await V.apiKeyOk("bad"), false);
  const k2 = await V.apiKeyNew(); assert.equal(await V.apiKeyOk(k), false); assert.equal(await V.apiKeyOk(k2), true);
  const st = await V.extStats(); assert.ok(st.users >= 0 && typeof st.new_today === "number");
  console.log("v23 OK");
})().catch((e) => { console.error(e); process.exit(1); });

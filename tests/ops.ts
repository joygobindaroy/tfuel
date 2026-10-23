import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
import assert from "node:assert/strict";
(globalThis as any).__fakeMail = async () => {};
(globalThis as any).fetch = async () => ({ json: async () => ({ ok: true, result: {} }) });
(async () => {
  const { db } = await import("../lib/firebase");
  const { bulkSettle } = await import("../lib/admin/ops");
  const mod = (await import("../lib/admin/ops")).default;
  const ctx = { who: "adm", role: "finance" as const };
  const now = Date.now();
  await db().ref("users/1").set({ name: "A", balance: 5000, usdt_u: 10_000_000, spent: { withdrawn: 20000 }, usdt_tot: { withdrawn: 30_000_000 } });
  await db().ref("settings").set({ price_override: 0.1, coins_per_tfuel: 1000 });
  await db().ref("usdt_withdrawals/u1").set({ uid: "1", name: "A", amount: 10, fee: 1, receive: 9, network_name: "TRC20", address: "T1", status: "pending", created_at: now });
  await db().ref("usdt_withdrawals/u2").set({ uid: "1", amount: 5, status: "pending", hold: "first withdrawal", created_at: now });
  await db().ref("usdt_withdrawals/u3").set({ uid: "1", amount: 20, status: "pending", created_at: now });
  await db().ref("withdrawals/t1").set({ uid: "1", amount: 20000, method: "Theta", account: "0xabc", status: "pending", created_at: now });
  await db().ref("users/1/usdt_withdrawals/u1").set({ status: "pending" });

  const items = [{ kind: "usdt", id: "u1" }, { kind: "usdt", id: "u1" }, { kind: "usdt", id: "u2" }, { kind: "tf", id: "t1" }, { kind: "usdt", id: "nope" }];
  const r1 = await bulkSettle(items, true, "ok", "adm");
  assert.deepEqual(r1.map((x) => x.ok), [true, false, false, true, false]);
  assert.match(r1[2].error!, /HOLD/);
  assert.equal((await db().ref("usdt_withdrawals/u1/status").get()).val(), "paid");
  assert.equal((await db().ref("withdrawals/t1/status").get()).val(), "paid");
  assert.equal((await db().ref("usdt_withdrawals/u2/status").get()).val(), "pending", "held stays pending");

  // second run must not touch already-paid items, and reject can't flip a paid one (no refund)
  const bal = (await db().ref("users/1/usdt_u").get()).val();
  const r2 = await bulkSettle([{ kind: "usdt", id: "u1" }, { kind: "tf", id: "t1" }], true, "", "adm");
  assert.ok(r2.every((x) => !x.ok && /Already paid/.test(x.error!)));
  const r3 = await bulkSettle([{ kind: "usdt", id: "u1" }, { kind: "usdt", id: "u3" }], false, "bad", "adm");
  assert.deepEqual(r3.map((x) => x.ok), [false, true]);
  assert.equal((await db().ref("usdt_withdrawals/u1/status").get()).val(), "paid");
  assert.equal((await db().ref("users/1/usdt_u").get()).val(), bal + 20_000_000, "only u3 refunded");

  // concurrent bulk runs: each item is paid exactly once
  await db().ref("usdt_withdrawals/c1").set({ uid: "1", amount: 1, status: "pending", created_at: now });
  const [a, b2] = await Promise.all([bulkSettle([{ kind: "usdt", id: "c1" }], true, "", "a"), bulkSettle([{ kind: "usdt", id: "c1" }], true, "", "b")]);
  assert.equal([...a, ...b2].filter((x) => x.ok).length, 1);

  await assert.rejects(mod("opsBulkReject", { items: [{ kind: "usdt", id: "u2" }], reason: "" }, ctx), /reason/);
  assert.equal(await mod("somethingElse", {}, ctx), undefined);

  const q: any = await mod("opsQueue", {}, ctx);
  assert.deepEqual(q.items.map((x: any) => x.id), ["u2"]);
  await mod("opsSetHoldings", { usdt: 5 }, ctx);
  const L: any = await mod("opsLiability", { refresh: true }, ctx);
  assert.equal(L.pending_usdt.count, 1);
  assert.ok(L.coverage > 0 && L.shortfall_usdt >= 0);
  const R: any = await mod("opsRecon", {}, ctx);
  assert.equal(R.withdrawals.length, 3);
  assert.equal(R.totals.usdt_fee, 1);
  assert.equal(R.totals.tfuel_amount, 20);
  const P: any = await mod("opsPnl", {}, ctx);
  assert.equal(P.income.ad_income_usdt, null);
  console.log("ops OK");
})().catch((e) => { console.error("FAIL", e); process.exit(1); });

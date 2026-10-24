import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
import assert from "node:assert/strict";
const calls: string[] = [];
(globalThis as any).fetch = async (u: string) => { calls.push(String(u)); return { json: async () => ({ ok: true, result: {} }) }; };
(async () => {
  const { db } = await import("../lib/firebase");
  await db().ref("users/1").set({ name: "A", balance: 1e7, created_at: 1 });
  const { setCfg2 } = await import("../lib/cfg2");
  await setCfg2("collect" as any, { enabled: true, items: [{ id: "c1", name: "N", emoji: "🎴", image: "", price: 1000, supply: 0, pts: 1, max: 0 }], season: { name: "s", end: Date.now() + 1e9, pool: 0, paid: false } });
  const { collectBuy } = await import("../lib/collect");
  await collectBuy("1", "c1");
  await assert.rejects(collectBuy("1", "c1"), /collect_max/);
  await db().ref("users/2").set({ name: "B", balance: 1e7, created_at: 1 });
  await collectBuy("2", "c1"); // unlimited supply: another user can buy

  const { renderMail } = await import("../lib/mailtpl");
  const m = renderMail({ title: "t", intro: "i", socials: [{ kind: "telegram", url: "https://t.me/x" }, { kind: "bogus", url: "https://x.y" }] });
  assert.ok(m.html.includes("/api/mail-icon?k=telegram") && m.html.includes('href="https://t.me/x"'));
  assert.ok(!m.html.includes("bogus"));

  const { parseSettings } = await import("../lib/settings") as any;
  const { ensureBotSynced } = await import("../lib/botsync");
  await ensureBotSynced();
  assert.ok(calls.some((c) => c.includes("setMyCommands")));
  const n = calls.length; await ensureBotSynced(); assert.equal(calls.length, n);
  console.log("v18.2 OK");
})().catch((e) => { console.error(e); process.exit(1); });

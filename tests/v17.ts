import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
import assert from "node:assert/strict";

const calls: { method: string; p: URLSearchParams }[] = [];
let memberStatus = "left";
(globalThis as any).fetch = async (url: string) => {
  const u = new URL(url);
  const method = u.pathname.split("/").pop()!;
  if (u.hostname === "api.telegram.org") {
    calls.push({ method, p: u.searchParams });
    if (method === "getChatMember") return { json: async () => ({ ok: true, result: { status: memberStatus } }) };
    return { json: async () => ({ ok: true, result: {} }) };
  }
  throw new Error("offline");
};
const last = (m: string) => [...calls].reverse().find((c) => c.method === m)!;

async function main() {
  const { db } = await import("../lib/firebase");
  const { handleBot } = await import("../lib/bot");
  const { holdReason } = await import("../lib/hold");
  const { DEFAULTS, parseSettings, invalidateSettings } = await import("../lib/settings");

  await db().ref("settings").set({ referral_link: "https://t.me/tfuel_bot/app", bot_buttons: [{ text: "📢 Official Channel", url: "https://t.me/tfuel" }] });
  invalidateSettings();
  await db().ref("users/42").set({ name: "Rafi", balance: 12500, usdt_u: 3500000, ref_count: 2, ref_earned: 1000, created_at: Date.now() });
  await db().ref("tasks/t1").set({ type: "telegram_join", title: "Join our channel", reward: 500, channel_id: "@tfuel" });
  await db().ref("tasks/t2").set({ type: "timer_visit", title: "Visit site", reward: 200, url: "https://x.y" });

  // /start
  await handleBot({ message: { text: "/start", chat: { id: 42, type: "private" }, from: { id: 42 } } });
  const s1 = last("sendMessage");
  assert.match(s1.p.get("text")!, /Welcome to TFUEL/);
  const kb1 = JSON.parse(s1.p.get("reply_markup")!).inline_keyboard;
  assert.equal(kb1[0][0].text, "⛏ Start Mining 🚀");
  assert.equal(kb1[0][0].url, "https://t.me/tfuel_bot/app");
  assert.deepEqual(kb1[1].map((b: any) => b.callback_data), ["p", "t"]);
  assert.equal(kb1[kb1.length - 1][0].text, "📢 Official Channel");

  // /start with referral param keeps it in the app link
  await handleBot({ message: { text: "/start Ab3xK9mQ2p", chat: { id: 7, type: "private" }, from: { id: 7 } } });
  assert.equal(JSON.parse(last("sendMessage").p.get("reply_markup")!).inline_keyboard[0][0].url, "https://t.me/tfuel_bot/app?startapp=Ab3xK9mQ2p");

  // profile
  await handleBot({ callback_query: { id: "c1", data: "p", from: { id: 42 }, message: { chat: { id: 42 }, message_id: 9 } } });
  const pe = last("editMessageText");
  const ptxt = pe.p.get("text")!;
  assert.match(ptxt, /TFUEL: <b>12\.500<\/b>/);
  assert.match(ptxt, /USDT: <b>3\.50<\/b>/);
  assert.match(ptxt, /startapp=[A-Za-z0-9]{10}/);
  assert.ok(!ptxt.includes("startapp=42") && !ptxt.includes("ref_42"), "telegram id not exposed");

  // tasks + verify
  await handleBot({ callback_query: { id: "c2", data: "t", from: { id: 42 }, message: { chat: { id: 42 }, message_id: 9 } } });
  const tk = JSON.parse(last("editMessageText").p.get("reply_markup")!).inline_keyboard;
  assert.ok(tk.some((r: any[]) => r.some((b) => b.callback_data === "v:t1")));
  assert.match(last("editMessageText").p.get("text")!, /1 more task/);
  await handleBot({ callback_query: { id: "c3", data: "v:t1", from: { id: 42, first_name: "Rafi" }, message: { chat: { id: 42 }, message_id: 9 } } });
  assert.match(last("answerCallbackQuery").p.get("text")!, /haven't joined/);
  memberStatus = "member";
  await handleBot({ callback_query: { id: "c4", data: "v:t1", from: { id: 42, first_name: "Rafi" }, message: { chat: { id: 42 }, message_id: 9 } } });
  assert.match(last("answerCallbackQuery").p.get("text")!, /\+0\.500 TFUEL/);
  assert.equal((await db().ref("users/42/balance").get()).val(), 13000);
  await handleBot({ callback_query: { id: "c5", data: "v:t1", from: { id: 42, first_name: "Rafi" }, message: { chat: { id: 42 }, message_id: 9 } } });
  assert.match(last("answerCallbackQuery").p.get("text")!, /Already claimed/);
  assert.equal((await db().ref("users/42/balance").get()).val(), 13000, "no double pay");
  assert.match(last("editMessageText").p.get("text")!, /completed everything|more task/);

  // invite
  await handleBot({ callback_query: { id: "c6", data: "i", from: { id: 42 }, message: { chat: { id: 42 }, message_id: 9 } } });
  assert.match(last("editMessageText").p.get("text")!, /Invite friends/);

  // unknown user profile
  await handleBot({ message: { text: "/profile", chat: { id: 99, type: "private" }, from: { id: 99 } } });
  assert.match(last("sendMessage").p.get("text")!, /Open the app once/);

  // hold rules
  const now = Date.now();
  const young: any = { created_at: now - 3600000 };
  assert.equal(holdReason(young, { ...DEFAULTS }, 5, now), "");
  assert.match(holdReason(young, { ...DEFAULTS, hold_new_hours: 24 }, 5, now), /younger than 24h/);
  assert.match(holdReason({ created_at: 1 } as any, { ...DEFAULTS, hold_amount_usdt: 100 }, 150, now), /large amount/);
  assert.equal(holdReason({ created_at: 1 } as any, { ...DEFAULTS, hold_amount_usdt: 100 }, 99, now), "");
  assert.match(holdReason({ created_at: 1 } as any, { ...DEFAULTS, hold_first_withdraw: true }, 1, now), /first withdrawal/);
  assert.equal(holdReason({ created_at: 1, withdrawals: { a: {} } } as any, { ...DEFAULTS, hold_first_withdraw: true }, 1, now), "");

  // settings parsing
  const ok = parseSettings({ bot_buttons: [{ text: "X", url: "https://t.me/x" }], terms_enabled: true, terms_version: 2, hold_new_hours: 12 }, DEFAULTS);
  assert.equal(ok.bot_buttons.length, 1); assert.equal(ok.terms_version, 2); assert.equal(ok.hold_new_hours, 12);
  assert.throws(() => parseSettings({ bot_buttons: [{ text: "X", url: "javascript:alert(1)" }] }, DEFAULTS), /https/);
  assert.throws(() => parseSettings({ terms_url: "http://x" }, DEFAULTS), /https/);
  console.log("v17 OK");
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });

import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
import assert from "node:assert/strict";
const calls: { m: string; p: Record<string, string> }[] = [];
(globalThis as any).fetch = async (url: string) => {
  const u = new URL(url);
  calls.push({ m: u.pathname.split("/").pop()!, p: Object.fromEntries(u.searchParams) });
  return { json: async () => ({ ok: true, result: {} }) };
};
const last = (m?: string) => [...calls].reverse().find((c) => !m || c.m === m)!;
const btns = (c: any) => (JSON.parse(c.p.reply_markup || "{}").inline_keyboard || []).flat();
(async () => {
  const { db } = await import("../lib/firebase");
  const { handleBot } = await import("../lib/bot");
  const { invalidateSettings } = await import("../lib/settings");
  const { dayKey } = await import("../lib/log");
  const { weekIndex } = await import("../lib/wallet");
  const msg = (text: string, id = 7, type = "private", name = "Rahim") => ({ message: { text, chat: { id: type === "private" ? id : -100, type }, from: { id, first_name: name } } });
  const cb = (data: string, id = 7, extra: any = {}) => ({ callback_query: { id: "q1", data, from: { id, first_name: "Rahim" }, message: { chat: { id }, message_id: 5, text: "x", ...extra } } });
  await db().ref("settings").set({ notify_enabled: true, referral_link: "https://t.me/bot/app", price_override: 0.05, coins_per_tfuel: 1000, daily_enabled: true, daily_rewards: [100, 200], lb_enabled: true, faq: [{ q: "How to withdraw?", a: "Profile → Withdraw" }] });
  invalidateSettings();

  // new user welcome: name replaced, menu built
  await handleBot(msg("/start"));
  let c = last("sendMessage");
  assert.match(c.p.text, /Hey Rahim/);
  assert.ok(btns(c).some((b: any) => b.callback_data === "d"), "daily button");
  assert.ok(btns(c).some((b: any) => b.callback_data === "w") && btns(c).some((b: any) => b.callback_data === "l") && btns(c).some((b: any) => b.callback_data === "x") && btns(c).some((b: any) => b.callback_data === "h") && btns(c).some((b: any) => b.callback_data === "s"));
  assert.ok(!btns(c).some((b: any) => b.callback_data === "c"), "clan hidden while feature off");

  // admin menu: reorder/off/label
  await db().ref("settings/bot_menu").set([{ k: "wallet", text: "💼 My money", on: true }, { k: "daily", text: "x", on: false }]);
  invalidateSettings();
  await handleBot(msg("/start"));
  c = last("sendMessage");
  assert.equal(btns(c)[1].text, "💼 My money", "first menu item = wallet with custom label");
  assert.ok(!btns(c).some((b: any) => b.callback_data === "d"), "daily off");
  assert.ok(btns(c).some((b: any) => b.callback_data === "h"), "missing keys appended");

  // returning user summary
  await db().ref("users/7").set({ name: "Rahim", balance: 5000, usdt_u: 2_500_000, daily: { day: "20200101", streak: 3 }, ref_count: 2, created_at: Date.now() - 9e8 });
  await handleBot(msg("/start"));
  assert.match(last("sendMessage").p.text, /Welcome back, Rahim[\s\S]*5\.000 TFUEL[\s\S]*Streak: 3[\s\S]*ready to claim/);
  await db().ref("settings/bot_menu").remove(); invalidateSettings();

  // banner photo
  await db().ref("settings/bot_photo").set("https://img.example/b.png"); invalidateSettings();
  await handleBot(msg("/start"));
  assert.equal(last().m, "sendPhoto");
  assert.match(last().p.caption, /Welcome back/);
  // back from a photo message edits the caption
  await handleBot(cb("m", 7, { photo: [{}] }));
  assert.equal(last().m, "editMessageCaption");
  await db().ref("settings/bot_photo").set(""); invalidateSettings();

  // daily claim in bot: streak resets to 1 (missed days) → +100; second time says already claimed
  await handleBot(cb("d"));
  assert.match(last("editMessageText").p.text, /Daily reward claimed[\s\S]*0\.100 TFUEL[\s\S]*Streak: <b>1/);
  assert.equal((await db().ref("users/7/balance").get()).val(), 5100);
  await handleBot(cb("d"));
  assert.match(last("editMessageText").p.text, /already claimed/);
  assert.equal((await db().ref("users/7/balance").get()).val(), 5100, "no double credit");

  // wallet
  await handleBot(msg("/balance"));
  c = last("sendMessage");
  assert.match(c.p.text, /Wallet[\s\S]*5\.100[\s\S]*2\.50/);
  assert.ok(btns(c).some((b: any) => /go_deposit/.test(b.url || "")) && btns(c).some((b: any) => /go_withdraw/.test(b.url || "")));

  // leaderboard + privacy
  await db().ref(`lb/d_${dayKey()}`).set({ "7": 9000, "8": 4000 });
  await db().ref("users/8").set({ name: "Hidden", balance: 1 });
  await db().ref("user_prefs/8").set({ lb_hide: true });
  await handleBot(msg("/top"));
  assert.match(last("sendMessage").p.text, /Rahim \(you\)[\s\S]*Anonymous/);
  await handleBot(cb("l:a"));
  assert.match(last("editMessageText").p.text, /all time/);

  // price
  await handleBot(msg("/price"));
  assert.match(last("sendMessage").p.text, /\$0\.050/);

  // help + faq answer
  await handleBot(msg("/help"));
  assert.ok(btns(last("sendMessage")).some((b: any) => b.callback_data === "q:0"));
  await handleBot(cb("q:0"));
  assert.match(last("editMessageText").p.text, /Profile → Withdraw/);

  // settings toggles keep the same indexes as the app
  await handleBot(cb("st:remind"));
  assert.equal((await db().ref("user_prefs/7/remind_daily").get()).val(), true);
  assert.equal((await db().ref("remind_users/7").get()).val(), true);
  await handleBot(cb("st:task"));
  assert.equal((await db().ref("task_users/7").get()).val(), true);
  await handleBot(cb("st:sum"));
  assert.equal((await db().ref("summary_users/7").get()).val(), true);
  await handleBot(cb("st:msg"));
  assert.equal((await db().ref("users/7/notify_off").get()).val(), true);
  await handleBot(cb("st:msg"));
  assert.equal((await db().ref("users/7/notify_off").get()).val(), null);

  // receipt: only the owner
  await db().ref("usdt_withdrawals/w1").set({ uid: "7", amount: 10, receive: 9, network_name: "TRC20", address: "TXabcdefghijklmnopqrstuvwxyz1234", status: "paid", created_at: Date.now(), handled_at: Date.now() });
  await handleBot(cb("r:u:w1"));
  assert.match(last("editMessageText").p.text, /Withdrawal receipt[\s\S]*10 USDT[\s\S]*TXabcd…/);
  await handleBot(cb("r:u:w1", 99));
  assert.match(last("editMessageText").p.text, /not found/);

  // group: only /top and /price; /balance ignored
  const n0 = calls.length;
  assert.equal(await handleBot(msg("/balance", 7, "supergroup")), false);
  assert.equal(calls.length, n0);
  await handleBot(msg("/top@mybot", 7, "supergroup"));
  assert.match(last("sendMessage").p.text, /Leaderboard/);
  assert.ok(!/\(you\)/.test(last("sendMessage").p.text), "no personal info in groups");

  // inline invite card
  await handleBot({ inline_query: { id: "iq", from: { id: 7 }, query: "" } });
  const ic = last("answerInlineQuery");
  const res = JSON.parse(ic.p.results);
  assert.match(res[0].input_message_content.message_text, /https:\/\/t\.me\/bot\/app\?startapp=/);
  await db().ref("settings/bot_inline").set(false); invalidateSettings();
  await handleBot({ inline_query: { id: "iq2", from: { id: 7 }, query: "" } });
  assert.equal(last("answerInlineQuery").p.results, "[]");

  // push buttons: notify with kb keeps buttons + open app
  const { notify } = await import("../lib/notify");
  await notify("7", "🎁 test", false, [[{ text: "🎁 Claim now", callback_data: "d" }]]);
  const nb = btns(last("sendMessage"));
  assert.equal(nb[0].callback_data, "d");
  assert.equal(nb[1].text, "Open app");

  // task alert → only opted-in users
  const { announceTask } = await import("../lib/taskalert");
  const bc = await announceTask("Join X", 5000);
  assert.equal(bc!.total, 1, "only user 7 opted in");

  // weekly winners → channel (once)
  await db().ref("settings").update({ autopost_enabled: true, autopost_channel: "@chan", autopost_winners: true });
  invalidateSettings();
  const { getSettings } = await import("../lib/settings");
  const s = await getSettings(true);
  const w = weekIndex() - 1;
  await db().ref(`lb/w_${w}`).set({ "7": 5000, "8": 1000 });
  const jb = await import("../lib/jobs-bot");
  assert.equal(await jb.postWeeklyWinners(s), 1);
  const post = calls.filter((x) => x.m === "sendMessage" && x.p.chat_id === "@chan").pop()!;
  assert.match(post.p.text, /Rahim — 5 TFUEL[\s\S]*Anonymous/);
  assert.equal(await jb.postWeeklyWinners(s), 0, "once per week");

  // clan boss alert (members told once at 50% and once when defeated)
  const { setCfg2 } = await import("../lib/cfg2");
  await setCfg2("clan", { enabled: true, create_cost: 0, max_members: 5, prizes: [1], boss: { enabled: true, name: "Golem", emoji: "🗿", hp_base: 1000, hp_per_member: 0, reward: 10 } });
  const cl = await import("../lib/clan");
  await db().ref("users/7/clan").set(""); 
  const id = await cl.clanCreate("7", "Alpha Team", "alp");
  await cl.clanAdd("7", 600);
  const before = calls.filter((x) => x.m === "sendMessage").length;
  assert.equal(await jb.bossAlerts(s), 1);
  assert.match(last("sendMessage").p.text, /down to 40%/);
  assert.equal(await jb.bossAlerts(s), 0, "no repeat");
  await cl.clanAdd("7", 600);
  assert.equal(await jb.bossAlerts(s), 1);
  assert.match(last("sendMessage").p.text, /defeated/);
  void before; void id;
  console.log("bot OK");
})().catch((e) => { console.error(e); process.exit(1); });

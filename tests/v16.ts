import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
import assert from "node:assert/strict";

const sent: { to: string; subject: string; text: string; html: string }[] = [];
process.env.SMTP_HOST = "h"; process.env.SMTP_USER = "u"; process.env.SMTP_PASS = "p";
(globalThis as any).__fakeMail = async (to: string, subject: string, b: { html: string; text: string }) => { sent.push({ to, subject, text: b.text, html: b.html }); };

async function main() {
  const { getRefCode, resolveRef } = await import("../lib/refcode");
  const { sendCode, checkCode } = await import("../lib/emailcode");
  const { checkAddress } = await import("../lib/addrcheck");
  const { DEFAULTS } = await import("../lib/settings");
  const { db } = await import("../lib/firebase");

  // --- referral code
  const c1 = await getRefCode("111");
  assert.match(c1, /^[A-Za-z0-9]{10}$/);
  assert.equal(await getRefCode("111"), c1, "stable per user");
  const c2 = await getRefCode("222");
  assert.notEqual(c1, c2);
  assert.equal(await resolveRef(c1), "111");
  assert.equal(await resolveRef("ref_555"), "555");
  assert.equal(await resolveRef("pay_abc"), null);
  assert.equal(await resolveRef("zzzzzzzzzz"), null);
  assert.ok(!c1.includes("111"));

  // --- email codes
  const code = async () => /Verification code: (\d{6})/.exec(sent[sent.length - 1].text)![1];
  await sendCode("111", "withdraw", "a@b.co");
  await assert.rejects(sendCode("111", "withdraw", "a@b.co"), /wait_a_minute/, "rate limit 1/min");
  await assert.rejects(checkCode("111", "withdraw", "000000", "a@b.co"), /ecode_wrong/);
  await assert.rejects(checkCode("111", "pin", await code(), "a@b.co"), /ecode_expired/, "purpose-bound");
  await checkCode("111", "withdraw", await code(), "a@b.co");
  await assert.rejects(checkCode("111", "withdraw", await code(), "a@b.co"), /ecode_expired/, "single use");
  // 5 wrong tries lock
  await db().ref("email_codes/111/rate").remove();
  await sendCode("111", "withdraw", "a@b.co");
  const real = await code();
  for (let i = 0; i < 5; i++) await assert.rejects(checkCode("111", "withdraw", real === "123456" ? "654321" : "123456", "a@b.co"), /ecode_wrong/);
  await assert.rejects(checkCode("111", "withdraw", real, "a@b.co"), /ecode_expired/, "locked after 5 wrong");
  await assert.rejects(checkCode("111", "withdraw", "abc", "a@b.co"), /ecode_required/);

  // --- address check
  const off = { ...DEFAULTS };
  await checkAddress("9", "TXabc12345", off);
  const wl = { ...DEFAULTS, withdraw_whitelist_only: true };
  await assert.rejects(checkAddress("9", "TXabc12345", wl), /addr_not_saved/);
  await db().ref("user_prefs/9/addrs/a1").set({ label: "x", address: "TXabc12345", added_at: Date.now() - 3600000 });
  await checkAddress("9", "txabc12345", wl);
  const cd = { ...DEFAULTS, addr_cooldown_hours: 2 };
  await assert.rejects(checkAddress("9", "TXabc12345", cd), /addr_cooldown/, "saved 1h ago, needs 2h");
  await db().ref("user_prefs/9/addrs/a1/added_at").set(Date.now() - 3 * 3600000);
  await checkAddress("9", "TXabc12345", cd);
  await assert.rejects(checkAddress("9", "TXnew0000000", cd), /addr_cooldown/, "first sight starts cooldown");
  await assert.rejects(checkAddress("9", "TXnew0000000", cd), /addr_cooldown/);
  // --- binding: withdraw code only works for the same address+amount
  await db().ref("email_codes/5").remove();
  await sendCode("5", "withdraw", "z@y.co", undefined, { amount: 10, asset: "USDT", address: "TXaaa bbb", network: "TRC20" });
  const c5 = await code();
  assert.ok(sent[sent.length - 1].html.includes("TRC20") && sent[sent.length - 1].html.includes("TXaaa bbb"), "mail shows details");
  await assert.rejects(checkCode("5", "withdraw", c5, "z@y.co", { amount: 10, address: "TXother" }), /ecode_wrong/);
  await assert.rejects(checkCode("5", "withdraw", c5, "z@y.co", { amount: 11, address: "TXaaabbb" }), /ecode_wrong/);
  await checkCode("5", "withdraw", c5, "z@y.co", { amount: 10.0001, address: "txAAAbbb" });
  // --- requireEmailCode semantics
  const { requireEmailCode } = await import("../lib/emailcode");
  const { invalidateSettings } = await import("../lib/settings");
  await db().ref("user_prefs/7/email").set({ addr: "q@w.co", verified: true });
  await requireEmailCode("7", "pin", ""); // optional + no code -> ok
  await assert.rejects(requireEmailCode("7", "pin", "123456"), /ecode_expired/, "optional but provided -> must be valid");
  await db().ref("settings/email_required").set(true); invalidateSettings();
  await assert.rejects(requireEmailCode("7", "pin", ""), /ecode_required/);
  await assert.rejects(requireEmailCode("8", "pin", "123456"), /email_required/, "no verified email");
  console.log("v16 OK");
}
main().catch((e) => { console.error("FAIL", e); process.exit(1); });

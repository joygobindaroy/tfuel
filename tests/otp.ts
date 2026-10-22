import { makeDb } from "./fakedb";
(globalThis as any).__fakeDb = makeDb();
process.env.SERVER_SECRET = "x".repeat(32);
process.env.BOT_TOKEN = "123:abc";
import crypto from "crypto";
const sent: any[] = [];
(globalThis as any).__fakeMail = async (to: string, s: string, b: any) => { sent.push({ to, s, text: b.text }); };
function initData(id: number) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id, first_name: "T" }) });
  const dcs = Array.from(p.entries()).map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const sk = crypto.createHmac("sha256", "WebAppData").update(process.env.BOT_TOKEN!).digest();
  p.set("hash", crypto.createHmac("sha256", sk).update(dcs).digest("hex"));
  return p.toString();
}
async function call(handler: any, id: number, body: any) {
  let out: any = {};
  const res: any = { status(c: number) { out.status = c; return this; }, json(b: any) { out.body = b; return this; }, setHeader() {} };
  await handler({ method: "POST", headers: { authorization: "Bearer " + initData(id), "user-agent": "Mozilla/5.0 (Linux; Android 14) Telegram" }, body, socket: {} }, res);
  return out;
}
(async () => {
  const { db } = await import("../lib/firebase");
  const h = (await import("../pages/api/account")).default;
  await db().ref("settings").set({ email_enabled: true });
  await db().ref("user_prefs/9/email").set({ addr: "a@b.co", verified: true });
  await db().ref("users/9").set({ name: "T", balance: 0, usdt_u: 5000000, created_at: Date.now() });
  const r = await call(h, 9, { action: "codeSend", purpose: "withdraw", details: { amount: 1, asset: "USDT", network: "BEP20", address: "0x775eb0000000000000000000000000028f9c917" } });
  console.log(r, sent.length);
})();

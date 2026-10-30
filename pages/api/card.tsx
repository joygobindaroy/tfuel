import { ImageResponse } from "next/og";
import { cardJsx, cardStyleOk, CARD_W, CARD_H } from "@/lib/cardkit";
import { qrDataUrl } from "@/lib/qrsvg";

export const config = { runtime: "edge" };
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function sign(s: string) {
  const enc = new TextEncoder();
  const secret = hex(await crypto.subtle.digest("SHA-256", enc.encode("card:" + (process.env.BOT_TOKEN || "dev"))));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 16);
}
const out = (el: React.ReactElement) => new ImageResponse(el, { width: CARD_W, height: CARD_H, headers: { "cache-control": "public, max-age=3600" } });

/** Invite card (PNG). Signed by the bot: /api/card?c=<code>&n=<name>&s=<sig>&v=<style 1|3|4|7>&l=<invite link, for the QR> */
export default async function handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const c = (q.get("c") || "").slice(0, 16), n = (q.get("n") || "").slice(0, 20);
  if (!c || (await sign(`${c}|${n}`)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  const link = q.get("l") || "";
  const qr = /^https:\/\/t\.me\/[\w./?=&-]{3,120}$/.test(link) && (await sign(`l|${c}|${link}`)) === q.get("ls") ? qrDataUrl(link) : undefined;
  return out(cardJsx(cardStyleOk(q.get("v")), { kicker: `Invited by ${n || "your friend"}`, h1: "Earn crypto\nevery day", code: c, foot: qr ? "scan or tap the link" : "tap the link below", qr, tag: "INVITE" }));
}

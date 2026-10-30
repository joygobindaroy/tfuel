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

/** "My earnings" share card: /api/earn?a=<amount text>&p=<period>&n=<name>&s=<sig>&v=<style> */
export default async function handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const a = (q.get("a") || "").slice(0, 24), pr = (q.get("p") || "").slice(0, 20), n = (q.get("n") || "").slice(0, 24);
  if (!a || (await sign(`earn|${a}|${pr}|${n}`)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  return out(cardJsx(cardStyleOk(q.get("v")), { kicker: pr, h1: "I earned", big: a, foot: n, tag: "EARNINGS" }));
}

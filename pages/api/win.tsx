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

/** Tournament winner card: /api/win?t=<title>&r=<rank>&p=<prize>&n=<name>&s=<sig>&v=<style> */
export default async function handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const t = (q.get("t") || "").slice(0, 50), r = (q.get("r") || "").slice(0, 3), p = (q.get("p") || "").slice(0, 14), n = (q.get("n") || "").slice(0, 24);
  if (!t || (await sign(`win|${t}|${r}|${p}|${n}`)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  const place = r === "1" ? "1ST PLACE" : r === "2" ? "2ND PLACE" : r === "3" ? "3RD PLACE" : `RANK ${r}`;
  return out(cardJsx(cardStyleOk(q.get("v")), { kicker: t, h1: place, big: `+${Number(p).toLocaleString("en-US")} coins`, foot: n, code: undefined, tag: "WINNER" }));
}

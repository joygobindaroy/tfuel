import { ImageResponse } from "next/og";
import { loadBr } from "@/lib/brandimg";
import { cardJsx, CARD_W, CARD_H } from "@/lib/cardkit";

export const config = { runtime: "edge" };
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function sign(s: string) {
  const enc = new TextEncoder();
  const secret = hex(await crypto.subtle.digest("SHA-256", enc.encode("card:" + (process.env.BOT_TOKEN || "dev"))));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 20);
}
const dec = (d: string) => { const b = d.replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(b + "=".repeat((4 - (b.length % 4)) % 4))))); };

/** Monthly recap picture (signed by the server): /api/recap?d=<base64url json>&s=<sig> */
export default async function handler(req: Request) {
  await loadBr(req.url);
  const q = new URL(req.url).searchParams;
  const d = q.get("d") || "";
  if (!d || d.length > 600 || (await sign("rc|" + d)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  let r: any;
  try { r = dec(d); } catch { return new Response("bad request", { status: 400 }); }
  const n = (x: any) => Number(x) || 0;
  return new ImageResponse(
    cardJsx("1", { kicker: `My month · ${String(r.l || "").slice(0, 20)}`, h1: `${n(r.so)} sent · ${n(r.si)} received`, big: `${n(r.t1)} TFUEL sent`, foot: `Received ${n(r.t2)} TFUEL${n(r.u1) || n(r.u2) ? ` · ${n(r.u1)}/${n(r.u2)} USDT out/in` : ""}${n(r.x) ? ` · ${n(r.x)} exchanges` : ""}`, tag: "RECAP" }),
    { width: CARD_W, height: CARD_H, headers: { "cache-control": "public, max-age=3600" } },
  );
}

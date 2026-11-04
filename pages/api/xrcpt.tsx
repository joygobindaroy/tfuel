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

/** Exchange receipt picture (signed by the server): /api/xrcpt?d=<base64url json>&s=<sig> */
export default async function handler(req: Request) {
  await loadBr(req.url);
  const q = new URL(req.url).searchParams;
  const d = q.get("d") || "";
  if (!d || d.length > 700 || (await sign("x|" + d)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  let r: any;
  try { r = dec(d); } catch { return new Response("bad request", { status: 400 }); }
  const usdt = (Number(r.u) || 0) / 1e6;
  const day = new Date(Number(r.at) || 0).toISOString().slice(0, 10);
  return new ImageResponse(
    cardJsx("1", { kicker: `Exchange · ${day} · #${String(r.i || "").slice(0, 8)}`, h1: r.k === "buy" ? "Bought" : "Sold", big: `${usdt} USDT`, foot: `${r.f} ${String(r.c || "").slice(0, 6)} via ${String(r.m || "").slice(0, 24)}${r.t ? " · Trusted trader" : ""}`, tag: "EXCHANGE" }),
    { width: CARD_W, height: CARD_H, headers: { "cache-control": "public, max-age=3600" } },
  );
}

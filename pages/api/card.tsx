import { ImageResponse } from "next/og";

export const config = { runtime: "edge" };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function sign(code: string, name: string) {
  const enc = new TextEncoder();
  const secret = hex(await crypto.subtle.digest("SHA-256", enc.encode("card:" + (process.env.BOT_TOKEN || "dev"))));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${code}|${name}`))).slice(0, 16);
}

/** Invite share card (PNG). Only cards signed by the bot are drawn: /api/card?c=<code>&n=<name>&s=<sig> */
export default async function handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const c = (q.get("c") || "").slice(0, 16);
  const n = (q.get("n") || "").slice(0, 20);
  if (!c || (await sign(c, n)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 1000, height: 560, padding: 56, color: "#fff", background: "linear-gradient(135deg,#0b1d4d 0%,#1f4fd8 55%,#38bdf8 100%)" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, letterSpacing: 4 }}>⛏ TFUEL</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, lineHeight: 1.1 }}>{`${n} invites you`}</div>
          <div style={{ display: "flex", fontSize: 36, marginTop: 14, opacity: 0.92 }}>Tap · Earn · Withdraw real TFUEL</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 30, background: "rgba(255,255,255,0.18)", padding: "12px 26px", borderRadius: 999 }}>{`Invite code: ${c}`}</div>
          <div style={{ display: "flex", fontSize: 28, opacity: 0.9 }}>Open the link below ↓</div>
        </div>
      </div>
    ),
    { width: 1000, height: 560, headers: { "cache-control": "public, max-age=86400, immutable" } }
  );
}

import { ImageResponse } from "next/og";

export const config = { runtime: "edge" };
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function sign(s: string) {
  const enc = new TextEncoder();
  const secret = hex(await crypto.subtle.digest("SHA-256", enc.encode("card:" + (process.env.BOT_TOKEN || "dev"))));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 16);
}

/** Tournament winner card (PNG), signed by the server: /api/win?t=<title>&r=<rank>&p=<prize>&n=<name>&s=<sig> */
export default async function handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const t = (q.get("t") || "").slice(0, 50), r = (q.get("r") || "").slice(0, 3), p = (q.get("p") || "").slice(0, 14), n = (q.get("n") || "").slice(0, 24);
  if (!t || (await sign(`win|${t}|${r}|${p}|${n}`)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  const medal = r === "1" ? "🥇" : r === "2" ? "🥈" : r === "3" ? "🥉" : "🏆";
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 1000, height: 560, padding: 56, color: "#fff", background: "linear-gradient(135deg,#0b1d4d 0%,#7c2d12 100%)", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 38, fontWeight: 700, letterSpacing: 4 }}>⛏ TFUEL · TOURNAMENT</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 120 }}>{medal}</div>
          <div style={{ display: "flex", fontSize: 58, fontWeight: 800 }}>{`${n} finished #${r}`}</div>
          <div style={{ display: "flex", fontSize: 36, marginTop: 8, opacity: 0.92 }}>{t}</div>
        </div>
        <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#fbbf24" }}>{`Won ${p} coins`}</div>
      </div>
    ),
    { width: 1000, height: 560, headers: { "cache-control": "public, max-age=86400, immutable" } }
  );
}

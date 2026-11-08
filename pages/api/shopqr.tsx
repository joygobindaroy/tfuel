import { ImageResponse } from "next/og";
import qrcode from "qrcode-generator";
import { loadBr } from "@/lib/brandimg";

export const config = { runtime: "edge" };
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function sign(s: string) {
  const enc = new TextEncoder();
  const secret = hex(await crypto.subtle.digest("SHA-256", enc.encode("card:" + (process.env.BOT_TOKEN || "dev"))));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 20);
}
const LOOKS: Record<string, { bg: string; fg: string; sub: string; acc: string; card: string }> = {
  dark: { bg: "#0f172a", fg: "#ffffff", sub: "#94a3b8", acc: "", card: "#ffffff" },
  light: { bg: "#f8fafc", fg: "#0f172a", sub: "#64748b", acc: "", card: "#ffffff" },
  neon: { bg: "#0a0a1f", fg: "#ffffff", sub: "#a5b4fc", acc: "#22e3ff", card: "#ffffff" },
  gold: { bg: "#17120a", fg: "#fdf3d0", sub: "#c9a74a", acc: "#f5c542", card: "#fffaf0" },
};

/** Shop payment poster (signed by the server): /api/shopqr?n=<shop>&d=<link>&t=<look>&s=<sig> */
export default async function handler(req: Request) {
  const br = await loadBr(req.url);
  const q = new URL(req.url).searchParams;
  const n = (q.get("n") || "").slice(0, 30), d = (q.get("d") || "").slice(0, 200);
  if (!n || !d || (await sign(`sq|${n}|${d}`)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  const L = LOOKS[q.get("t") || ""] || LOOKS.dark;
  const acc = L.acc || br.accent;
  const code = qrcode(0, "M");
  code.addData(d);
  code.make();
  const c = code.getModuleCount(), m = 2, size = c + m * 2;
  let path = "";
  for (let r = 0; r < c; r++) for (let k = 0; k < c; k++) if (code.isDark(r, k)) path += `M${k + m} ${r + m}h1v1h-1z`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${L.card}"/><path d="${path}" fill="#000"/></svg>`;
  const src = `data:image/svg+xml;base64,${btoa(svg)}`;
  const W = 800, H = 1100;
  const fs = n.length > 22 ? 44 : n.length > 14 ? 56 : 70;
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: W, height: H, background: L.bg, color: L.fg, fontFamily: "sans-serif", padding: "56px 48px", position: "relative" }}>
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: W, height: 14, background: acc }} />
        <div style={{ display: "flex", fontSize: 26, letterSpacing: 6, color: acc, fontWeight: 700 }}>{br.label.toUpperCase()} PAY</div>
        <div style={{ display: "flex", marginTop: 34, fontSize: fs, fontWeight: 800, textAlign: "center", justifyContent: "center", maxWidth: 700 }}>{n}</div>
        <div style={{ display: "flex", marginTop: 12, fontSize: 30, color: L.sub }}>Scan to pay</div>
        <div style={{ display: "flex", marginTop: 40, padding: 28, borderRadius: 36, background: L.card, border: `8px solid ${acc}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} width={540} height={540} alt="" />
        </div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 28, color: L.sub, textAlign: "center", justifyContent: "center" }}>Open with your camera or Telegram</div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 28, color: L.fg, fontWeight: 700 }}>Pay with TFUEL or USDT</div>
        <div style={{ display: "flex", position: "absolute", bottom: 40, fontSize: 22, color: L.sub }}>{br.foot ? br.foot.slice(0, 50) : ""}</div>
      </div>
    ),
    { width: W, height: H, headers: { "cache-control": "public, max-age=3600" } },
  );
}

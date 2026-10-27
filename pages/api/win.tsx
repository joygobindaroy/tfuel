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
  const place = r === "1" ? "1ST" : r === "2" ? "2ND" : r === "3" ? "3RD" : `#${r}`;
  const W = 1000, H = 560;
  const sticker = (bg: string, fg: string, rot: number, children: React.ReactNode, extra: React.CSSProperties = {}) => (
    <div style={{ display: "flex", background: bg, color: fg, borderRadius: 18, padding: "10px 22px", fontWeight: 800, transform: `rotate(${rot}deg)`, border: "4px solid #0b0614", boxShadow: "6px 6px 0 #0b0614", ...extra }}>{children}</div>
  );
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: W, height: H, background: "#0b0614", overflow: "hidden", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", position: "absolute", left: -130, bottom: -200, width: 520, height: 520, borderRadius: 999, background: "linear-gradient(135deg,#ffd23d,#ff3d9a)", opacity: 0.95 }} />
        <div style={{ display: "flex", position: "absolute", right: -120, top: -170, width: 480, height: 480, borderRadius: 999, background: "linear-gradient(135deg,#7c3aed,#22d3ee)", opacity: 0.9 }} />
        <div style={{ display: "flex", position: "absolute", right: 120, bottom: 70, width: 130, height: 130, borderRadius: 999, background: "#c6ff3d", border: "4px solid #0b0614" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: W, height: H, padding: "44px 56px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {sticker("#c6ff3d", "#0b0614", -4, <span style={{ fontSize: 30, letterSpacing: 2 }}>TFUEL</span>)}
            <div style={{ display: "flex", marginLeft: 18 }}>{sticker("#ffffff", "#0b0614", 3, <span style={{ fontSize: 24 }}>W MOVE</span>)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 36, fontWeight: 800, color: "#ffffff", textShadow: "3px 3px 0 #0b0614" }}>{`${n} just took`}</div>
            <div style={{ display: "flex", fontSize: 150, fontWeight: 800, lineHeight: 1, color: "#ffffff", textShadow: "8px 8px 0 #ff3d9a" }}>{place}</div>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#ffffff", marginTop: 6, textShadow: "2px 2px 0 #0b0614" }}>{t}</div>
          </div>
          <div style={{ display: "flex" }}>
            {sticker("#ffd23d", "#0b0614", -2, <span style={{ fontSize: 44 }}>{`+${p} coins, no cap`}</span>)}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "cache-control": "public, max-age=86400, immutable" } }
  );
}

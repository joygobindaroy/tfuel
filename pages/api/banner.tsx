import { ImageResponse } from "next/og";

export const config = { runtime: "edge" };
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function sign(s: string) {
  const enc = new TextEncoder();
  const secret = hex(await crypto.subtle.digest("SHA-256", enc.encode("card:" + (process.env.BOT_TOKEN || "dev"))));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 16);
}

const THEME: Record<string, { a: string; b: string; tag: string }> = {
  price: { a: "#c6ff3d", b: "#22d3ee", tag: "PRICE CHECK" },
  top: { a: "#ff3d9a", b: "#7c3aed", tag: "TOP EARNERS" },
  tour: { a: "#ffd23d", b: "#ff3d9a", tag: "FREE TOURNAMENT" },
};

/** Gen Z banner for auto-posts (PNG), signed by the server: /api/banner?k=price|top|tour&t=<title>&a=<big text>&r=<row|row|…>&s=<sig> */
export default async function handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const k = THEME[q.get("k") || ""] ? (q.get("k") as string) : "";
  const t = (q.get("t") || "").slice(0, 60), a = (q.get("a") || "").slice(0, 24), r = (q.get("r") || "").slice(0, 400);
  if (!k || (await sign(`ban|${k}|${t}|${a}|${r}`)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  const th = THEME[k];
  const rows = r.split("|").map((x) => x.trim()).filter(Boolean).slice(0, 5);
  const W = 1000, H = 560;
  const sticker = (bg: string, fg: string, rot: number, children: React.ReactNode, extra: React.CSSProperties = {}) => (
    <div style={{ display: "flex", background: bg, color: fg, borderRadius: 18, padding: "10px 22px", fontWeight: 800, transform: `rotate(${rot}deg)`, border: "4px solid #0b0614", boxShadow: "6px 6px 0 #0b0614", ...extra }}>{children}</div>
  );
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: W, height: H, background: "#0b0614", overflow: "hidden", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", position: "absolute", left: -150, top: -170, width: 460, height: 460, borderRadius: 999, background: `linear-gradient(135deg,${th.a},${th.b})`, opacity: 0.9 }} />
        <div style={{ display: "flex", position: "absolute", right: -130, bottom: -190, width: 500, height: 500, borderRadius: 999, background: `linear-gradient(135deg,${th.b},${th.a})`, opacity: 0.85 }} />
        <div style={{ display: "flex", position: "absolute", right: 70, top: 46, width: 90, height: 90, borderRadius: 999, background: "#ffd23d", border: "4px solid #0b0614" }} />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: W, height: H, padding: "44px 56px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {sticker("#c6ff3d", "#0b0614", -4, <span style={{ fontSize: 30, letterSpacing: 2 }}>TFUEL</span>)}
            <div style={{ display: "flex", marginLeft: 18 }}>{sticker("#ffffff", "#0b0614", 3, <span style={{ fontSize: 24 }}>{th.tag}</span>)}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 38, fontWeight: 800, color: "#ffffff", textShadow: "3px 3px 0 #0b0614" }}>{t}</div>
            {a && <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1.05, color: "#ffffff", textShadow: `6px 6px 0 ${th.a === "#c6ff3d" ? "#ff3d9a" : th.a}`, marginTop: 6 }}>{a}</div>}
            <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
              {rows.map((x, i) => (
                <div key={i} style={{ display: "flex", fontSize: a ? 28 : 34, fontWeight: 700, color: "#ffffff", marginTop: 6, textShadow: "2px 2px 0 #0b0614" }}>{x}</div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            {sticker("#0b0614", "#c6ff3d", -3, <span style={{ fontSize: 26 }}>tap the button below &gt;&gt;</span>, { border: "4px solid #c6ff3d", boxShadow: "6px 6px 0 #ff3d9a" })}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "cache-control": "public, max-age=3600" } }
  );
}

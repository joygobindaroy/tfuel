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
  const W = 1000, H = 560;
  const name = n || "Your friend";
  const sticker = (bg: string, fg: string, rot: number, children: React.ReactNode, extra: React.CSSProperties = {}) => (
    <div style={{ display: "flex", background: bg, color: fg, borderRadius: 18, padding: "10px 22px", fontWeight: 800, transform: `rotate(${rot}deg)`, border: "4px solid #0b0614", boxShadow: "6px 6px 0 #0b0614", ...extra }}>{children}</div>
  );
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: W, height: H, background: "#0b0614", overflow: "hidden", fontFamily: "sans-serif" }}>
        {/* blobs */}
        <div style={{ display: "flex", position: "absolute", left: -140, top: -160, width: 460, height: 460, borderRadius: 999, background: "linear-gradient(135deg,#ff3d9a,#7c3aed)", opacity: 0.9 }} />
        <div style={{ display: "flex", position: "absolute", right: -120, bottom: -180, width: 520, height: 520, borderRadius: 999, background: "linear-gradient(135deg,#c6ff3d,#22d3ee)", opacity: 0.9 }} />
        <div style={{ display: "flex", position: "absolute", right: 90, top: 40, width: 120, height: 120, borderRadius: 999, background: "#ffd23d", border: "4px solid #0b0614" }} />
        <div style={{ display: "flex", position: "absolute", left: 420, bottom: 30, width: 54, height: 54, borderRadius: 14, background: "#ff3d9a", border: "4px solid #0b0614", transform: "rotate(18deg)" }} />
        {/* grid dots strip */}
        <div style={{ display: "flex", position: "absolute", left: 0, right: 0, top: 0, height: H, border: "10px solid #0b0614" }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: W, height: H, padding: "44px 56px", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {sticker("#c6ff3d", "#0b0614", -4, <span style={{ fontSize: 34, letterSpacing: 2 }}>TFUEL</span>)}
            {sticker("#ffffff", "#0b0614", 5, <span style={{ fontSize: 26 }}>free to join</span>, { marginRight: 150 })}
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#ffffff", textShadow: "3px 3px 0 #0b0614", marginTop: 14 }}>{name} says</div>
            <div style={{ display: "flex", fontSize: 88, fontWeight: 800, lineHeight: 1, color: "#ffffff", textShadow: "6px 6px 0 #ff3d9a", marginTop: 6 }}>GET PAID</div>
            <div style={{ display: "flex", marginTop: 8 }}>
              {sticker("#ff3d9a", "#ffffff", -2, <span style={{ fontSize: 50, lineHeight: 1 }}>to scroll &amp; tap</span>, { padding: "8px 26px" })}
            </div>
            <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#ffffff", marginTop: 16 }}>tap · earn · cash out real TFUEL — no cap</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {sticker("#ffffff", "#0b0614", 2, <span style={{ fontSize: 30 }}>{`my code: ${c}`}</span>)}
            {sticker("#0b0614", "#c6ff3d", -3, <span style={{ fontSize: 28 }}>tap the link below &gt;&gt;</span>, { border: "4px solid #c6ff3d", boxShadow: "6px 6px 0 #ff3d9a" })}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "cache-control": "public, max-age=86400, immutable" } }
  );
}

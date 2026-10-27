import { ImageResponse } from "next/og";

export const config = { runtime: "edge" };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function sig(s: string) {
  const enc = new TextEncoder();
  const secret = hex(await crypto.subtle.digest("SHA-256", enc.encode("card:" + (process.env.BOT_TOKEN || "dev"))));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 20);
}
const dec = (d: string) => { const b = d.replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(b + "=".repeat((4 - (b.length % 4)) % 4))))); };

/** Transfer receipt as a PNG. Only receipts signed by the server are drawn. */
export default async function handler(req: Request) {
  const q = new URL(req.url).searchParams;
  const d = q.get("d") || "";
  if (!d || d.length > 1500 || (await sig("i|" + d)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  let r: any;
  try { r = dec(d); } catch { return new Response("bad request", { status: 400 }); }
  const wd = r.v === "wd", out = r.v !== "in";
  const label = wd ? "Destination" : out ? "To" : "From";
  const rows: [string, string][] = [
    [label, `${r.o}${r.c ? "  (" + r.c + ")" : ""}`],
    ...(r.f ? ([["Fee", r.f]] as [string, string][]) : []),
    ...(r.n ? ([["Note", r.n]] as [string, string][]) : []),
    ["Time", new Date(r.at).toISOString().replace("T", " ").slice(0, 16) + " UTC"],
  ];
  const ok = wd ? r.s === "paid" : !r.h;
  const status = wd ? (r.s === "paid" ? "PAID" : r.s === "rejected" ? "REJECTED" : "PENDING") : r.h ? "ON HOLD" : "DONE";
  const A = out ? "#ff3d9a" : "#c6ff3d", B = out ? "#7c3aed" : "#22d3ee";
  const W = 900, H = 760;
  const sticker = (bg: string, fg: string, rot: number, children: React.ReactNode) => (
    <div style={{ display: "flex", background: bg, color: fg, borderRadius: 16, padding: "8px 20px", fontWeight: 800, transform: `rotate(${rot}deg)`, border: "4px solid #0b0614", boxShadow: "5px 5px 0 #0b0614" }}>{children}</div>
  );
  return new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: W, height: H, background: "#0b0614", overflow: "hidden", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", position: "absolute", left: -140, top: -150, width: 420, height: 420, borderRadius: 999, background: `linear-gradient(135deg,${A},${B})`, opacity: 0.9 }} />
        <div style={{ display: "flex", position: "absolute", right: -120, bottom: -160, width: 440, height: 440, borderRadius: 999, background: `linear-gradient(135deg,${B},${A})`, opacity: 0.85 }} />
        <div style={{ display: "flex", flexDirection: "column", width: W, height: H, padding: "40px 48px", position: "relative" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {sticker("#c6ff3d", "#0b0614", -4, <span style={{ fontSize: 28, letterSpacing: 2 }}>TFUEL</span>)}
            {sticker(ok ? "#ffffff" : "#ffd23d", "#0b0614", 3, <span style={{ fontSize: 24 }}>{status}</span>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", background: "#ffffff", borderRadius: 26, border: "5px solid #0b0614", boxShadow: "9px 9px 0 #0b0614", padding: "26px 34px", marginTop: 30 }}>
            <div style={{ display: "flex", fontSize: 24, color: "#6b7280", fontWeight: 700 }}>{wd ? "RECEIPT - WITHDRAWAL" : out ? "RECEIPT - YOU SENT" : "RECEIPT - YOU GOT"}</div>
            <div style={{ display: "flex", fontSize: 70, fontWeight: 800, color: "#0b0614", lineHeight: 1.1 }}>{`${out ? "-" : "+"}${r.a}`}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 10 }}>
              {rows.map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "2px dashed #d1d5db", fontSize: 25 }}>
                  <div style={{ display: "flex", color: "#6b7280" }}>{k}</div>
                  <div style={{ display: "flex", color: "#0b0614", fontWeight: 800 }}>{String(v).slice(0, 40)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 14 }}>
              <div style={{ display: "flex", fontSize: 19, color: "#6b7280" }}>{wd ? "Reference" : "Transaction hash"}</div>
              <div style={{ display: "flex", fontSize: 20, color: "#0b0614", fontWeight: 800, wordBreak: "break-all" }}>{r.t}</div>
            </div>
          </div>
          <div style={{ display: "flex", marginTop: "auto", justifyContent: "flex-end" }}>
            {sticker("#0b0614", "#c6ff3d", -3, <span style={{ fontSize: 22 }}>verified by TFUEL</span>)}
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "cache-control": "public, max-age=31536000, immutable" } }
  );
}

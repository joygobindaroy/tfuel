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
  const rows: [string, string][] = [
    [wd ? "Destination" : out ? "To" : "From", `${r.o}${r.c ? "  (" + r.c + ")" : ""}`],
    ...(r.f ? ([["Fee", r.f]] as [string, string][]) : []),
    ...(r.n ? ([["Note", r.n]] as [string, string][]) : []),
    ["Date", new Date(r.at).toISOString().replace("T", " ").slice(0, 16) + " UTC"],
  ];
  const ok = wd ? r.s === "paid" : !r.h;
  const status = wd ? (r.s === "paid" ? "Paid" : r.s === "rejected" ? "Rejected" : "Pending") : r.h ? "On hold" : "Completed";
  const sc = ok ? { fg: "#15803d", bg: "#dcfce7" } : r.s === "rejected" ? { fg: "#b91c1c", bg: "#fee2e2" } : { fg: "#b45309", bg: "#fef3c7" };
  const W = 900, H = 700 + rows.length * 66;
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: W, height: H, background: "#e8ebf2", padding: 40, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#ffffff", borderRadius: 28, overflow: "hidden", border: "2px solid #d5dae5" }}>
          <div style={{ display: "flex", flexDirection: "column", background: "linear-gradient(135deg,#0b1220,#1e2a5a)", padding: "34px 44px 30px", position: "relative" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <div style={{ display: "flex", width: 46, height: 46, borderRadius: 999, background: "#f5a623", alignItems: "center", justifyContent: "center", color: "#0b1220", fontSize: 26, fontWeight: 800 }}>T</div>
                <div style={{ display: "flex", marginLeft: 14, fontSize: 32, fontWeight: 800, color: "#ffffff", letterSpacing: 2 }}>TFUEL</div>
              </div>
              <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: sc.fg, background: sc.bg, padding: "7px 22px", borderRadius: 999 }}>{status}</div>
            </div>
            <div style={{ display: "flex", fontSize: 22, color: "#aab4d4", marginTop: 26 }}>{wd ? "Withdrawal receipt" : out ? "Payment sent" : "Payment received"}</div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#ffffff", lineHeight: 1.1, marginTop: 4 }}>{`${out ? "-" : "+"}${r.a}`}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "14px 44px 0" }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 66, borderBottom: "2px solid #eef0f6", fontSize: 25 }}>
                <div style={{ display: "flex", color: "#6b7280" }}>{k}</div>
                <div style={{ display: "flex", color: "#0b1220", fontWeight: 700 }}>{String(v).slice(0, 38)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", background: "#f6f7fb", borderTop: "3px dashed #cbd2e1", padding: "22px 44px 26px" }}>
            <div style={{ display: "flex", fontSize: 19, color: "#6b7280", fontWeight: 700 }}>{wd ? "REFERENCE" : "TRANSACTION HASH"}</div>
            <div style={{ display: "flex", fontSize: 21, color: "#0b1220", fontWeight: 700, wordBreak: "break-all", marginTop: 4 }}>{r.t}</div>
            <div style={{ display: "flex", fontSize: 18, color: "#9aa3b5", marginTop: 12 }}>Electronic receipt issued by TFUEL. Check authenticity with the hash on the Verify page.</div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "cache-control": "public, max-age=31536000, immutable" } }
  );
}

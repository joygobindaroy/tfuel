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
  const out = r.v === "out";
  const rows: [string, string][] = [
    [out ? "To" : "From", `${r.o}${r.c ? "  (" + r.c + ")" : ""}`],
    ...(r.f ? ([["Fee", r.f]] as [string, string][]) : []),
    ...(r.n ? ([["Note", r.n]] as [string, string][]) : []),
    ["Time", new Date(r.at).toISOString().replace("T", " ").slice(0, 19) + " UTC"],
  ];
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", width: 900, height: 720, padding: 48, background: "#f3f4f8", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, background: "#fff", borderRadius: 28, padding: 40, border: "2px solid #e5e7eb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 800, color: "#0f172a" }}>⛏ TFUEL</div>
            <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: r.h ? "#b45309" : "#15803d", background: r.h ? "#fef3c7" : "#dcfce7", padding: "8px 20px", borderRadius: 999 }}>{r.h ? "On hold" : "Completed"}</div>
          </div>
          <div style={{ display: "flex", fontSize: 26, color: "#6b7280", marginTop: 26 }}>{out ? "You sent" : "You received"}</div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, color: out ? "#0f172a" : "#15803d" }}>{`${out ? "−" : "+"}${r.a}`}</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 18 }}>
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #eef0f4", fontSize: 25 }}>
                <div style={{ display: "flex", color: "#6b7280" }}>{k}</div>
                <div style={{ display: "flex", color: "#111827", fontWeight: 700 }}>{String(v).slice(0, 44)}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: "auto" }}>
            <div style={{ display: "flex", fontSize: 20, color: "#6b7280" }}>Transaction hash</div>
            <div style={{ display: "flex", fontSize: 21, color: "#111827", fontWeight: 700, wordBreak: "break-all" }}>{r.t}</div>
          </div>
        </div>
      </div>
    ),
    { width: 900, height: 720, headers: { "cache-control": "public, max-age=31536000, immutable" } }
  );
}

import { useEffect, useState } from "react";
import Head from "next/head";

const COL = { ok: "#16a34a", degraded: "#f59e0b", outage: "#dc2626" } as const;
const LABEL = { ok: "All systems operational", degraded: "Some systems are slower than usual", outage: "We are having problems" } as const;

/** Public status page: /status */
export default function Status() {
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    const load = () => fetch("/api/status").then((r) => r.json()).then(setD).catch(() => setD({ level: "outage", comps: [], note: "" }));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  const lv = (d?.level || "ok") as keyof typeof COL;
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 16px", fontFamily: "system-ui, sans-serif", color: "#111" }}>
      <Head><title>TFUEL status</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <h1 style={{ fontSize: 22, margin: "0 0 14px" }}>TFUEL status</h1>
      {!d ? <p>Loading…</p> : (
        <>
          <div style={{ background: COL[lv], color: "#fff", borderRadius: 14, padding: "16px 18px", fontWeight: 700 }}>{LABEL[lv]}</div>
          {d.note && <p style={{ background: "#f3f4f6", borderRadius: 10, padding: 12 }}>{d.note}</p>}
          <div style={{ marginTop: 16 }}>
            {(d.comps || []).map((c: any) => (
              <div key={c.name} style={{ display: "flex", justifyContent: "space-between", padding: "12px 4px", borderBottom: "1px solid #e5e7eb" }}>
                <div><div style={{ fontWeight: 600 }}>{c.name}</div><div style={{ fontSize: 13, color: "#6b7280" }}>{c.msg}</div></div>
                <span style={{ color: COL[c.level as keyof typeof COL], fontWeight: 700, alignSelf: "center" }}>● {c.level === "ok" ? "OK" : c.level === "degraded" ? "Slow" : "Down"}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 14 }}>Updated {new Date(d.at || Date.now()).toLocaleTimeString()} · refreshes automatically</p>
        </>
      )}
    </div>
  );
}

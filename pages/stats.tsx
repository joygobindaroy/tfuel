import Head from "next/head";
import { useEffect, useState } from "react";
import { BRAND } from "@/lib/brand";

export default function StatsPage() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/pubstats").then((r) => r.json()).then(setD).catch(() => setD({ success: false })); }, []);
  const rows: [string, string][] = d?.success ? [["People in the community", d.users.toLocaleString("en-US")], ["Active today", d.active_today.toLocaleString("en-US")], ["Joined in 30 days", d.joined_30d.toLocaleString("en-US")], ["Paid out in 30 days", `${d.paid_out_30d_usdt.toLocaleString("en-US")} USDT`]] : [];
  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <Head><title>{BRAND} · Numbers</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <h1 style={{ fontSize: 22 }}>{BRAND} in numbers</h1>
      {!d && <p>Loading…</p>}
      {d && !d.success && <p>This page isn&apos;t public right now.</p>}
      {rows.map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #e5e7eb" }}><span>{k}</span><b>{v}</b></div>)}
    </div>
  );
}

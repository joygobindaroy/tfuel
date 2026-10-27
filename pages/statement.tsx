import type { GetServerSideProps } from "next";
import Head from "next/head";

interface Row { at: number; d: "out" | "in"; amt: string; fee: string; peer: string; tx: string; tag: string }
interface P { ok: boolean; month?: string; rows?: Row[]; tot?: string[]; err?: string }

export const getServerSideProps: GetServerSideProps<P> = async ({ query, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const { stmtSig } = await import("@/lib/receipt");
    const { db } = await import("@/lib/firebase");
    const { getSettings } = await import("@/lib/settings");
    const { amtStr } = await import("@/lib/transfer");
    const u = String(query.u || ""), m = String(query.m || ""), s = String(query.s || "");
    if (!/^\d{1,20}$/.test(u) || !/^\d{4}-\d{2}$/.test(m) || stmtSig(u, m) !== s) return { props: { ok: false, err: "This statement link is not valid." } };
    const cpt = (await getSettings()).coins_per_tfuel;
    const [y, mo] = m.split("-").map(Number);
    const a = Date.UTC(y, mo - 1, 1), b = Date.UTC(y, mo, 1);
    const all = ((await db().ref(`user_xfers/${u}`).get()).val() || {}) as Record<string, any>;
    const list = Object.values(all).filter((r: any) => r.at >= a && r.at < b && r.st !== "cancelled" && r.st !== "held").sort((x: any, z: any) => x.at - z.at) as any[];
    const t: Record<string, { s: number; r: number; f: number }> = { tfuel: { s: 0, r: 0, f: 0 }, usdt: { s: 0, r: 0, f: 0 } };
    for (const r of list) { const k = t[r.a === "usdt" ? "usdt" : "tfuel"]; if (r.d === "out") { k.s += r.amt; k.f += r.fee || 0; } else k.r += r.amt; }
    const rows: Row[] = list.map((r) => ({ at: r.at, d: r.d, amt: amtStr(r.a, r.amt, cpt), fee: r.fee ? amtStr(r.a, r.fee, cpt) : "", peer: String(r.peer || "") + (r.pc ? ` (${r.pc})` : ""), tx: String(r.tx || ""), tag: String(r.tag || "") }));
    const tot = (["tfuel", "usdt"] as const).filter((k) => t[k].s || t[k].r).map((k) => `${k === "usdt" ? "USDT" : "TFUEL"}: sent ${amtStr(k, t[k].s, cpt)} · received ${amtStr(k, t[k].r, cpt)} · fees ${amtStr(k, t[k].f, cpt)}`);
    return { props: { ok: true, month: m, rows, tot } };
  } catch { return { props: { ok: false, err: "Statement not available." } }; }
};

/** Printable monthly statement of user-to-user transfers (Print → Save as PDF) */
export default function Statement({ ok, month, rows = [], tot = [], err }: P) {
  if (!ok) return <div style={{ font: "16px system-ui", padding: 40, textAlign: "center" }}><Head><title>Statement</title><meta name="robots" content="noindex" /></Head>{err}</div>;
  return (
    <div className="st">
      <Head><title>{`Statement ${month}`}</title><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="robots" content="noindex" /></Head>
      <style>{`body{margin:0;background:#f3f4f8;font:14px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827}.st{max-width:820px;margin:0 auto;padding:18px 14px}.cd{background:#fff;border-radius:16px;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px}th,td{text-align:left;padding:7px 6px;border-bottom:1px solid #e5e7eb;vertical-align:top}.h{font-size:11px;color:#6b7280;word-break:break-all}.in{color:#15803d}.bt{margin-top:14px;padding:12px 18px;border:0;border-radius:12px;background:#111827;color:#fff;font:600 15px system-ui;cursor:pointer}@media print{body{background:#fff}.np{display:none}.st{padding:0}.cd{box-shadow:none;padding:0}}`}</style>
      <div className="cd">
        <b style={{ fontSize: 20 }}>⛏ TFUEL — Transfer statement</b>
        <div style={{ color: "#6b7280" }}>{month} (UTC)</div>
        {tot.map((t) => <div key={t} style={{ marginTop: 6 }}><b>{t}</b></div>)}
        {rows.length === 0 ? <div style={{ marginTop: 14 }}>No transfers this month.</div> : (
          <table>
            <thead><tr><th>Date</th><th>Person</th><th>Amount</th><th>Fee</th><th>Hash / note</th></tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i}><td>{new Date(r.at).toISOString().replace("T", " ").slice(0, 16)}</td><td>{r.d === "in" ? "From " : "To "}{r.peer}</td><td className={r.d === "in" ? "in" : ""}><b>{r.d === "in" ? "+" : "−"}{r.amt}</b></td><td>{r.fee}</td><td><span className="h">{r.tx}</span>{r.tag ? <div>🏷 {r.tag}</div> : null}</td></tr>)}</tbody>
          </table>
        )}
        <div className="np"><button className="bt" onClick={() => window.print()}>🖨 Print / Save as PDF</button></div>
      </div>
    </div>
  );
}

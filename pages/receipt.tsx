import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useState } from "react";

interface P { ok: boolean; r?: { txid: string; at: number; dir: "out" | "in" | "wd"; st?: string; amount: string; fee: string; other: string; otherCode: string; note: string; held: boolean }; img?: string; err?: string }

export const getServerSideProps: GetServerSideProps<P> = async ({ query, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const { loadReceipt, pageSig, receiptLinks } = await import("@/lib/receipt");
    const { amtStr } = await import("@/lib/transfer");
    const { getSettings } = await import("@/lib/settings");
    const t = String(query.t || "").toUpperCase(), u = String(query.u || ""), s = String(query.s || "");
    if (!/^\d{1,20}$/.test(u) || pageSig(t, u) !== s) return { props: { ok: false, err: "This receipt link is not valid." } };
    const [r, st] = await Promise.all([loadReceipt(t, u), getSettings()]);
    const cpt = st.coins_per_tfuel;
    return { props: { ok: true, r: { txid: r.txid, at: r.at, dir: r.dir, amount: r.amtText || amtStr(r.asset, r.amount, cpt), st: r.st || "", fee: r.fee ? amtStr(r.asset, r.fee, cpt) : "", other: r.other, otherCode: r.otherCode, note: r.note, held: r.held }, img: receiptLinks(r, u, cpt, "").img } };
  } catch { return { props: { ok: false, err: "Receipt not found." } }; }
};

export default function Receipt({ ok, r, img, err }: P) {
  const [copied, setCopied] = useState(false);
  if (!ok || !r) return <div style={{ font: "16px system-ui", padding: 40, textAlign: "center" }}><Head><title>Receipt</title><meta name="robots" content="noindex" /></Head>{err}</div>;
  const out = r.dir !== "in", wd = r.dir === "wd";
  const stOk = !wd || r.st === "paid", stLabel = wd ? (r.st === "paid" ? "Paid" : r.st === "rejected" ? "Rejected" : "Pending") : r.held ? "On hold" : "Completed";
  const rows: [string, string][] = [[wd ? "Destination" : out ? "To" : "From", r.other + (r.otherCode ? `  (${r.otherCode})` : "")], ...(r.fee ? [["Fee", r.fee] as [string, string]] : []), ...(r.note ? [["Note", r.note] as [string, string]] : []), ["Time", new Date(r.at).toISOString().replace("T", " ").slice(0, 19) + " UTC"], [wd ? "Reference" : "Transaction hash", r.txid]];
  return (
    <div className="rc">
      <Head><title>{`Receipt ${r.txid.slice(0, 10)}`}</title><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="robots" content="noindex" /></Head>
      <style>{`body{margin:0;background:#f3f4f8;font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827}.rc{max-width:520px;margin:0 auto;padding:20px 14px}.cd{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:22px}.bt{display:inline-block;border:0;border-radius:10px;padding:11px 18px;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;background:#f5a623;color:#111827;margin:4px 4px 0 0}.bt.s{background:#e5e7eb}.rw{display:flex;justify-content:space-between;gap:14px;padding:10px 0;border-bottom:1px solid #eef0f4}.rw span{color:#6b7280}.rw b{text-align:right;word-break:break-all}@media print{body{background:#fff}.np{display:none!important}.cd{border:0;padding:0}}`}</style>
      <div className="cd">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><b style={{ fontSize: 20 }}>⛏ TFUEL</b><b style={{ color: !stOk || r.held ? "#b45309" : "#15803d", background: !stOk || r.held ? "#fef3c7" : "#dcfce7", padding: "4px 12px", borderRadius: 99, fontSize: 13 }}>{stLabel}</b></div>
        <div style={{ color: "#6b7280", marginTop: 18 }}>{wd ? "You withdrew" : out ? "You sent" : "You received"}</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: out ? "#0f172a" : "#15803d" }}>{out ? "−" : "+"}{r.amount}</div>
        <div style={{ marginTop: 10 }}>{rows.map(([k, v]) => <div className="rw" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        <div className="np" style={{ marginTop: 14 }}>
          <button className="bt" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
          <a className="bt s" href={img} download={`receipt-${r.txid.slice(0, 10)}.png`}>⬇ Download image</a>
          <button className="bt s" onClick={() => { try { navigator.clipboard.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} }}>{copied ? "Copied ✓" : "🔗 Copy link"}</button>
        </div>
        <div className="np" style={{ color: "#9ca3af", fontSize: 12, marginTop: 14 }}>Keep this link private — it shows the details of this transfer. Anyone with the transaction hash can confirm it is genuine at /verify.</div>
      </div>
    </div>
  );
}

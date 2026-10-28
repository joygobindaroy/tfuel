import type { GetServerSideProps } from "next";
import Icon from "@/components/Icons";
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
      <style>{`body{margin:0;background:#e8ebf2;font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b1220}.rc{max-width:540px;margin:0 auto;padding:22px 14px}.cd{background:#fff;border:1px solid #d5dae5;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08)}.hd{background:linear-gradient(135deg,#0b1220,#1e2a5a);color:#fff;padding:24px 26px 22px}.lg{display:flex;align-items:center;gap:10px;font-weight:800;letter-spacing:2px;font-size:20px}.lg i{display:inline-flex;width:34px;height:34px;border-radius:50%;background:#f5a623;color:#0b1220;align-items:center;justify-content:center;font-style:normal;font-size:18px}.chip{margin-left:auto;font-size:13px;font-weight:700;padding:4px 14px;border-radius:99px;letter-spacing:0}.bd{padding:6px 26px 4px}.bt{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:10px;padding:11px 16px;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;background:#f5a623;color:#0b1220;margin:4px 6px 0 0}.bt.s{background:#e5e8f0}.rw{display:flex;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid #eef0f6}.rw span{color:#6b7280}.rw b{text-align:right;word-break:break-all}.ft{background:#f6f7fb;border-top:2px dashed #cbd2e1;padding:16px 26px 18px}.ft small{color:#6b7280;font-weight:700;letter-spacing:.5px}.ft div{font-weight:700;word-break:break-all;margin-top:2px}@media print{body{background:#fff}.np{display:none!important}.cd{border:0;box-shadow:none}.hd{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
      <div className="cd">
        <div className="hd">
          <div className="lg"><i>T</i>TFUEL<span className="chip" style={{ color: !stOk || r.held ? "#b45309" : "#15803d", background: !stOk || r.held ? "#fef3c7" : "#dcfce7" }}>{stLabel}</span></div>
          <div style={{ color: "#aab4d4", marginTop: 18 }}>{wd ? "Withdrawal receipt" : out ? "Payment sent" : "Payment received"}</div>
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15 }}>{out ? "−" : "+"}{r.amount}</div>
        </div>
        <div className="bd">{rows.filter(([k]) => !k.startsWith("Transaction") && k !== "Reference").map(([k, v]) => <div className="rw" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
        <div className="ft"><small>{wd ? "REFERENCE" : "TRANSACTION HASH"}</small><div>{r.txid}</div></div>
      </div>
      <div className="np" style={{ marginTop: 14 }}>
        <button className="bt" onClick={() => window.print()}><Icon name="print" size={14} /> Print / Save as PDF</button>
        <a className="bt s" href={img} download={`receipt-${r.txid.slice(0, 10)}.png`}><Icon name="download" size={14} /> Download image</a>
      </div>
      <div className="np" style={{ color: "#8a93a6", fontSize: 12, marginTop: 14 }}>Keep this link private. Anyone can check that a transaction hash is genuine on the Verify page, without seeing any names.</div>
    </div>
  );
}

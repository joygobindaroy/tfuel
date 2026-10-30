import type { GetServerSideProps } from "next";
import Head from "next/head";
import { RCPT_STYLES } from "@/lib/rcptkit";

interface P { ok: boolean; txid?: string; img?: string; y?: string; base?: string; err?: string }

export const getServerSideProps: GetServerSideProps<P> = async ({ query, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const { loadReceipt, pageSig, receiptLinks } = await import("@/lib/receipt");
    const { getSettings } = await import("@/lib/settings");
    const { rcptStyleOf } = await import("@/lib/styles");
    const { rcptStyleOk } = await import("@/lib/rcptkit");
    const t = String(query.t || ""), u = String(query.u || ""), s = String(query.s || "");
    const tid = /^TF[0-9a-fA-F]{40}$/.test(t) ? t.toUpperCase() : t;
    if (!/^\d{1,20}$/.test(u) || pageSig(tid, u) !== s) return { props: { ok: false, err: "This receipt link is not valid." } };
    const [r, st] = await Promise.all([loadReceipt(tid, u), getSettings()]);
    const y = query.y ? rcptStyleOk(query.y) : await rcptStyleOf(u);
    return { props: { ok: true, txid: r.txid, y, img: receiptLinks(r, u, st.coins_per_tfuel, "", y).img, base: `/receipt?t=${encodeURIComponent(tid)}&u=${encodeURIComponent(u)}&s=${encodeURIComponent(s)}` } };
  } catch { return { props: { ok: false, err: "Receipt not found." } }; }
};

export default function Receipt({ ok, txid, img, y, base, err }: P) {
  if (!ok || !img) return <div style={{ font: "16px system-ui", padding: 40, textAlign: "center" }}><Head><title>Receipt</title><meta name="robots" content="noindex" /></Head>{err}</div>;
  return (
    <div className="rc">
      <Head><title>{`Receipt ${String(txid).slice(0, 14)}`}</title><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="robots" content="noindex" /></Head>
      <style>{`body{margin:0;background:#e8ebf2;font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b1220}.rc{max-width:560px;margin:0 auto;padding:18px 14px}.pic{width:100%;display:block;border-radius:18px;box-shadow:0 10px 30px rgba(15,23,42,.14)}.bt{display:inline-block;border:0;border-radius:10px;padding:11px 16px;font-weight:700;font-size:15px;cursor:pointer;text-decoration:none;background:#f5a623;color:#0b1220;margin:12px 8px 0 0}.bt.s{background:#dfe3ee}.ch{display:inline-block;padding:6px 12px;border-radius:99px;background:#fff;border:1px solid #d5dae5;color:#0b1220;text-decoration:none;font-size:13px;font-weight:600;margin:0 6px 6px 0}.ch.on{background:#0b1220;color:#fff;border-color:#0b1220}@media print{body{background:#fff}.np{display:none!important}.rc{padding:0}.pic{box-shadow:none;border-radius:0}}`}</style>
      <div className="np" style={{ marginBottom: 10 }}>{RCPT_STYLES.map((s) => <a key={s.id} className={`ch ${y === s.id ? "on" : ""}`} href={`${base}&y=${s.id}`}>{s.name}</a>)}</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img loading="lazy" className="pic" src={img} alt="Receipt" />
      <div className="np">
        <button className="bt" onClick={() => window.print()}>Print / Save as PDF</button>
        <a className="bt s" href={img} download={`receipt-${String(txid).slice(0, 12)}.png`}>Download image</a>
      </div>
      <div className="np" style={{ color: "#8a93a6", fontSize: 12, marginTop: 14 }}>Keep this link private. Anyone can check that a reference is genuine on the Verify page, without seeing any names.</div>
    </div>
  );
}

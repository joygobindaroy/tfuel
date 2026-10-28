import type { GetServerSideProps } from "next";
import Icon from "@/components/Icons";
import Head from "next/head";

interface P { ok: boolean; err?: string; i?: { id: string; shop: string; title: string; ref: string; usd: string; paid: string; at: number; date: number } }

export const getServerSideProps: GetServerSideProps<P> = async ({ query, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const { invoiceSig } = await import("@/lib/v20");
    const { db } = await import("@/lib/firebase");
    const o = String(query.o || ""), u = String(query.u || ""), s = String(query.s || "");
    if (!/^[\w-]{4,40}$/.test(o) || !/^\d{1,20}$/.test(u) || invoiceSig(o, u) !== s) return { props: { ok: false, err: "This invoice link is not valid." } };
    const ord = (await db().ref(`shop_orders/${o}`).get()).val() as any;
    if (!ord || String(ord.paid_by) !== u || (ord.status !== "paid" && ord.status !== "refunded")) return { props: { ok: false, err: "Invoice not found." } };
    const shop = (await db().ref(`shops/${ord.shop}`).get()).val() as any;
    const parts = [ord.coins ? `${ord.coins} coins` : "", ord.usdt_u ? `${(ord.usdt_u / 1e6).toFixed(2)} USDT` : ""].filter(Boolean).join(" + ");
    return { props: { ok: true, i: { id: o, shop: String(shop?.name || "Shop"), title: String(ord.title || ""), ref: String(ord.ref || ""), usd: `$${((Number(ord.usd_u) || 0) / 1e6).toFixed(2)}`, paid: parts || "-", at: Number(ord.paid_at) || 0, date: Number(ord.created_at) || 0 } } };
  } catch { return { props: { ok: false, err: "Invoice not available." } }; }
};

export default function Invoice({ ok, err, i }: P) {
  if (!ok || !i) return <div style={{ font: "16px system-ui", padding: 40, textAlign: "center" }}><Head><title>Invoice</title><meta name="robots" content="noindex" /></Head>{err}</div>;
  const rows: [string, string][] = [["Seller", i.shop], ["Item", i.title || "-"], ["Order reference", i.ref], ["Paid with", i.paid], ["Paid on", new Date(i.at || i.date).toISOString().replace("T", " ").slice(0, 16) + " UTC"], ["Order ID", i.id]];
  return (
    <div className="rc">
      <Head><title>{`Invoice ${i.id.slice(0, 10)}`}</title><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="robots" content="noindex" /></Head>
      <style>{`body{margin:0;background:#e8ebf2;font:15px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#0b1220}.rc{max-width:540px;margin:0 auto;padding:22px 14px}.cd{background:#fff;border:1px solid #d5dae5;border-radius:20px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,.08)}.hd{background:linear-gradient(135deg,#0b1220,#1e2a5a);color:#fff;padding:24px 26px}.bd{padding:6px 26px 10px}.rw{display:flex;justify-content:space-between;gap:14px;padding:13px 0;border-bottom:1px solid #eef0f6}.rw span{color:#6b7280}.rw b{text-align:right;word-break:break-all}.bt{border:0;border-radius:10px;padding:11px 16px;font-weight:700;font-size:15px;cursor:pointer;background:#f5a623;color:#0b1220;margin-top:14px}@media print{body{background:#fff}.np{display:none!important}.cd{border:0;box-shadow:none}.hd{-webkit-print-color-adjust:exact;print-color-adjust:exact}}`}</style>
      <div className="cd">
        <div className="hd"><div style={{ letterSpacing: 2, fontWeight: 800 }}>INVOICE</div><div style={{ color: "#aab4d4", marginTop: 14 }}>Total</div><div style={{ fontSize: 36, fontWeight: 800 }}>{i.usd}</div></div>
        <div className="bd">{rows.map(([k, v]) => <div className="rw" key={k}><span>{k}</span><b>{v}</b></div>)}</div>
      </div>
      <button className="bt np" onClick={() => window.print()}><Icon name="print" size={14} /> Print / Save as PDF</button>
    </div>
  );
}

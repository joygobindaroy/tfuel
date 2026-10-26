import type { GetServerSideProps } from "next";
import Head from "next/head";

interface P { ok: boolean; name?: string; code?: string; link?: string; qr?: string; err?: string }

export const getServerSideProps: GetServerSideProps<P> = async ({ query, res }) => {
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const { cardSig } = await import("@/lib/cardsig");
    const { getSettings } = await import("@/lib/settings");
    const c = String(query.c || "").slice(0, 16), n = String(query.n || "").slice(0, 20), s = String(query.s || "");
    if (!c || cardSig(c, n) !== s) return { props: { ok: false, err: "This poster link is not valid." } };
    const st = await getSettings();
    if (!st.referral_link) return { props: { ok: false, err: "Invite link is not set up yet." } };
    const link = `${st.referral_link}?startapp=${c}`;
    return { props: { ok: true, name: n, code: c, link, qr: `/api/qr?d=${encodeURIComponent(link)}` } };
  } catch { return { props: { ok: false, err: "Poster not available." } }; }
};

/** Printable invite poster: QR + your link. Print or save as PDF; screenshot to share. */
export default function Poster({ ok, name, code, link, qr, err }: P) {
  if (!ok) return <div style={{ font: "16px system-ui", padding: 40, textAlign: "center" }}><Head><title>Poster</title><meta name="robots" content="noindex" /></Head>{err}</div>;
  return (
    <div className="pp">
      <Head><title>TFUEL invite poster</title><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="robots" content="noindex" /></Head>
      <style>{`body{margin:0;background:#f3f4f8;font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}.pp{max-width:520px;margin:0 auto;padding:18px 14px}.po{background:linear-gradient(145deg,#f5a623,#ef6c00);color:#fff;border-radius:24px;padding:32px 24px;text-align:center}.po img{background:#fff;border-radius:18px;padding:10px;width:260px;height:260px;margin:18px auto 14px;display:block}.code{display:inline-block;background:rgba(255,255,255,.2);border-radius:999px;padding:8px 18px;font-weight:700;letter-spacing:1px}.bt{display:block;width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#111827;color:#fff;font:600 16px system-ui;cursor:pointer}@media print{body{background:#fff}.np{display:none}.pp{padding:0}}`}</style>
      <div className="po">
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 3 }}>⛏ TFUEL</div>
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.15, marginTop: 14 }}>{name ? `${name} invites you` : "Join me"}</div>
        <div style={{ opacity: 0.95, marginTop: 6 }}>Tap · Earn · Withdraw real TFUEL</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code" />
        <div className="code">ID: {code}</div>
        <div style={{ marginTop: 12, fontSize: 13, wordBreak: "break-all", opacity: 0.95 }}>{link}</div>
      </div>
      <div className="np">
        <button className="bt" onClick={() => window.print()}>🖨 Print / Save as PDF</button>
        <button className="bt" style={{ background: "#fff", color: "#111827", border: "1px solid #d1d5db" }} onClick={() => { try { navigator.clipboard.writeText(link || ""); } catch {} }}>Copy link</button>
      </div>
    </div>
  );
}

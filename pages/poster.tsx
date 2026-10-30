import type { GetServerSideProps } from "next";
import Icon from "@/components/Icons";
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
      <style>{`body{margin:0;background:#0b0614;font:16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif}.pp{max-width:520px;margin:0 auto;padding:18px 14px}.po{position:relative;overflow:hidden;background:#0b0614;border:4px solid #c6ff3d;border-radius:28px;padding:30px 22px 26px;text-align:center;color:#fff}.b1,.b2{position:absolute;border-radius:50%;z-index:0}.b1{width:240px;height:240px;left:-90px;top:-90px;background:linear-gradient(135deg,#ff3d9a,#7c3aed)}.b2{width:260px;height:260px;right:-100px;bottom:-110px;background:linear-gradient(135deg,#c6ff3d,#22d3ee)}.in{position:relative;z-index:1}.st{display:inline-block;border:4px solid #0b0614;box-shadow:5px 5px 0 #0b0614;border-radius:16px;padding:6px 18px;font-weight:800}.big{font-size:44px;font-weight:800;line-height:1.05;text-shadow:4px 4px 0 #ff3d9a;margin-top:18px}.po img{background:#fff;border:5px solid #0b0614;box-shadow:8px 8px 0 #0b0614;border-radius:20px;padding:10px;width:240px;height:240px;margin:22px auto 16px;display:block}.code{display:inline-block;background:#ffd23d;color:#0b0614;border:4px solid #0b0614;box-shadow:5px 5px 0 #0b0614;border-radius:14px;padding:6px 18px;font-weight:800;letter-spacing:1px;transform:rotate(-2deg)}.bt{display:block;width:100%;margin-top:12px;padding:14px;border:0;border-radius:14px;background:#c6ff3d;color:#0b0614;font:800 16px system-ui;cursor:pointer}@media print{body{background:#fff}.np{display:none}.pp{padding:0}}`}</style>
      <div className="po">
        <div className="b1" /><div className="b2" />
        <div className="in">
          <span className="st" style={{ background: "#c6ff3d", color: "#0b0614", transform: "rotate(-3deg)", fontSize: 22, letterSpacing: 2 }}>TFUEL</span>
          <div className="big">{name ? `${name} says` : "join me"}<br />GET PAID<br />to scroll &amp; tap</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img loading="lazy" src={qr} alt="QR code" />
          <div className="code">my code: {code}</div>
          <div style={{ marginTop: 14, fontSize: 13, wordBreak: "break-all", fontWeight: 700 }}>{link}</div>
          <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>scan it or tap the link. no cap.</div>
        </div>
      </div>
      <div className="np">
        <button className="bt" onClick={() => window.print()}><Icon name="print" size={14} /> Print / Save as PDF</button>
        <button className="bt" style={{ background: "#fff", color: "#111827", border: "1px solid #d1d5db" }} onClick={() => { try { navigator.clipboard.writeText(link || ""); } catch {} }}>Copy link</button>
      </div>
    </div>
  );
}

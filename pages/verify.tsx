import type { GetServerSideProps } from "next";
import Icon from "@/components/Icons";
import Head from "next/head";

interface P { checked: boolean; found: boolean; h: string; info?: { at: number; amount: string; asset: string } }

export const getServerSideProps: GetServerSideProps<P> = async ({ query, res }) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  const h = String(query.h || "").trim().toUpperCase();
  if (!h) return { props: { checked: false, found: false, h: "" } };
  if (!/^TF[0-9A-F]{40}$/.test(h)) return { props: { checked: true, found: false, h: h.slice(0, 60) } };
  try {
    const { db } = await import("@/lib/firebase");
    const { getSettings } = await import("@/lib/settings");
    const { amtStr } = await import("@/lib/transfer");
    const id = (await db().ref(`transfer_tx/${h}`).get()).val();
    const t: any = id ? (await db().ref(`transfers/${id}`).get()).val() : null;
    if (!t) return { props: { checked: true, found: false, h } };
    const cpt = (await getSettings()).coins_per_tfuel;
    return { props: { checked: true, found: true, h, info: { at: t.at, amount: amtStr(t.asset || "tfuel", t.amount, cpt), asset: t.asset === "usdt" ? "USDT" : "TFUEL" } } };
  } catch { return { props: { checked: true, found: false, h } }; }
};

/** Anyone holding a transaction hash can check it is genuine. Names are never shown. */
export default function Verify({ checked, found, h, info }: P) {
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "28px 16px", font: "16px/1.5 -apple-system,Segoe UI,Roboto,Arial,sans-serif" }}>
      <Head><title>Verify a transfer</title><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="robots" content="noindex" /></Head>
      <h2 style={{ marginTop: 0 }}><Icon name="bolt" size={14} /> TFUEL — Verify a transfer</h2>
      <form method="get"><input name="h" defaultValue={h} placeholder="Transaction hash (TF…)" style={{ width: "100%", boxSizing: "border-box", padding: 12, fontSize: 15, borderRadius: 10, border: "1px solid #d1d5db" }} /><button style={{ marginTop: 10, width: "100%", padding: 12, border: 0, borderRadius: 10, background: "#111827", color: "#fff", fontWeight: 600, fontSize: 16 }}>Check</button></form>
      {checked && (found && info ? (
        <div style={{ marginTop: 16, background: "#ecfdf5", border: "1px solid #6ee7b7", borderRadius: 12, padding: 16 }}>
          <b style={{ color: "#047857" }}><Icon name="check" size={14} /> Genuine — this transfer is completed.</b>
          <div style={{ marginTop: 6 }}>Amount: <b>{info.amount}</b></div>
          <div>Time: {new Date(info.at).toISOString().replace("T", " ").slice(0, 19)} UTC</div>
        </div>
      ) : (
        <div style={{ marginTop: 16, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 12, padding: 16 }}><b style={{ color: "#b91c1c" }}><Icon name="x" size={14} /> Not found.</b> This hash does not match any completed transfer.</div>
      ))}
    </div>
  );
}

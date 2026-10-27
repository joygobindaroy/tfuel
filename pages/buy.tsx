import type { GetServerSideProps } from "next";
import Head from "next/head";

interface P { err: string }

/** Signed "Buy now" link → creates an order and sends the buyer to the pay screen in Telegram */
export const getServerSideProps: GetServerSideProps<P> = async ({ query, res }) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Robots-Tag", "noindex");
  try {
    const { buyOrder } = await import("@/lib/shop");
    const { rateLimit } = await import("@/lib/api");
    const k = String(query.k || ""), t = String(query.t || "").slice(0, 80), a = Number(query.a);
    await rateLimit("buy:" + k, "buylink", 30);
    const url = await buyOrder(k, a, t, String(query.s || ""));
    return { redirect: { destination: url, permanent: false } };
  } catch (e: any) {
    return { props: { err: String(e?.message || "").slice(0, 120) || "Could not start the payment. Please try again." } };
  }
};

export default function Buy({ err }: P) {
  return (
    <div style={{ font: "16px system-ui", padding: 40, textAlign: "center" }}>
      <Head><title>Pay with TFUEL</title><meta name="robots" content="noindex" /></Head>
      {err}
    </div>
  );
}

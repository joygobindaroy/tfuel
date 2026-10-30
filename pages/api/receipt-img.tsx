import { ImageResponse } from "next/og";
import { rcptJsx, rcptHeight, rcptStyleOk, type RcptData } from "@/lib/rcptkit";
import { qrDataUrl } from "@/lib/qrsvg";

export const config = { runtime: "edge" };

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function sig(s: string) {
  const enc = new TextEncoder();
  const secret = hex(await crypto.subtle.digest("SHA-256", enc.encode("card:" + (process.env.BOT_TOKEN || "dev"))));
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(s))).slice(0, 20);
}
const dec = (d: string) => { const b = d.replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(b + "=".repeat((4 - (b.length % 4)) % 4))))); };
const t8 = (t: number) => (t ? new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC" : "");

/** Receipt as a PNG in one of five looks (y=b|d|e|f|g). Only receipts signed by the server are drawn. */
export default async function handler(req: Request) {
  const u = new URL(req.url);
  const q = u.searchParams;
  const d = q.get("d") || "";
  if (!d || d.length > 1800 || (await sig("i|" + d)) !== q.get("s")) return new Response("forbidden", { status: 403 });
  let r: any;
  try { r = dec(d); } catch { return new Response("bad request", { status: 400 }); }
  const kind: "t" | "w" | "d" = r.v === "wd" ? "w" : r.v === "dep" ? "d" : "t";
  const out = kind === "w" ? true : kind === "d" ? false : r.v === "out";
  let state: "ok" | "wait" | "bad" = "ok", status = "Completed";
  if (kind === "w") { state = r.s === "paid" ? "ok" : r.s === "rejected" ? "bad" : "wait"; status = r.s === "paid" ? "Paid" : r.s === "rejected" ? "Rejected" : "Pending"; }
  else if (kind === "d") { state = r.s === "paid" ? "ok" : r.s === "rejected" ? "bad" : "wait"; status = r.s === "paid" ? "Credited" : r.s === "rejected" ? "Rejected" : "Pending"; }
  else if (r.h) { state = "wait"; status = "On hold"; }
  const rows: [string, string][] = [];
  rows.push([kind === "w" ? "Destination" : kind === "d" ? "Network" : out ? "To" : "From", `${r.o}${r.c ? "  (" + r.c + ")" : ""}`]);
  if (kind === "w" && r.fe) rows.push(["Fee", r.fe]);
  if (kind === "w" && r.x) rows.push(["You receive", r.x]);
  if (kind === "t" && r.f) rows.push(["Fee", r.f]);
  if (r.n) rows.push(["Note", r.n]);
  rows.push(["Date", t8(r.at)]);
  const handled = state !== "wait";
  const steps =
    kind === "w" ? [{ t: "Requested", sub: t8(r.c0 || r.at), done: true }, { t: state === "bad" ? "Rejected" : "Reviewed", sub: handled ? t8(r.at) : "In review", done: handled }, { t: "Sent to your wallet", sub: state === "ok" ? `${r.x || r.a} · ${t8(r.at)}` : "Waiting", done: state === "ok" }]
    : kind === "d" ? [{ t: "Submitted", sub: t8(r.c0 || r.at), done: true }, { t: state === "bad" ? "Rejected" : "Verified", sub: handled ? t8(r.at) : "Checking the transaction", done: handled }, { t: "Credited to your balance", sub: state === "ok" ? `${r.a} · ${t8(r.at)}` : "Waiting", done: state === "ok" }]
    : [{ t: "Initiated", sub: t8(r.at), done: true }, { t: r.h ? "Held until released" : out ? "Delivered" : "Received", sub: r.h ? "You can cancel it from Send > History" : "Completed", done: !r.h }];
  const data: RcptData = {
    kind, out, state, status, rows, steps,
    title: kind === "w" ? "Withdrawal" : kind === "d" ? "Deposit" : out ? "Payment sent" : "Payment received",
    amount: String(r.a || ""), hashLabel: kind === "t" ? "Transaction hash" : "Reference", hash: String(r.t || ""), at: Number(r.at) || 0,
    fee: r.fe || r.f || "", net: r.x || "",
    qr: qrDataUrl(`${u.origin}/verify?h=${encodeURIComponent(String(r.t || ""))}`),
  };
  const style = rcptStyleOk(q.get("y"));
  return new ImageResponse(rcptJsx(style, data), { width: 900, height: rcptHeight(style, data), headers: { "cache-control": "public, max-age=31536000, immutable" } });
}

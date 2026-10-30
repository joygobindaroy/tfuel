import React from "react";

export type RcptStyle = "b" | "d" | "e" | "f" | "g";
export const RCPT_STYLES: { id: RcptStyle; name: string }[] = [
  { id: "b", name: "Banking" },
  { id: "d", name: "Invoice" },
  { id: "e", name: "Certificate" },
  { id: "f", name: "Timeline" },
  { id: "g", name: "Explorer" },
];
export const rcptStyleOk = (s: unknown): RcptStyle => (s === "d" || s === "e" || s === "f" || s === "g" ? s : "b");

export interface RcptData {
  kind: "t" | "w" | "d"; // transfer · withdrawal · deposit
  out: boolean; // money leaves the user
  title: string; // "Payment sent", "Withdrawal", ...
  amount: string; // "25 USDT"
  state: "ok" | "wait" | "bad";
  status: string; // "Completed", "Paid", "On hold"...
  rows: [string, string][];
  hashLabel: string;
  hash: string;
  at: number;
  steps: { t: string; sub: string; done: boolean }[];
  fee?: string;
  net?: string;
  qr?: string;
}

const W = 900;
const kids = (c: React.ReactNode): React.ReactNode => (React.isValidElement(c) && c.type === React.Fragment ? React.Children.toArray((c.props as { children?: React.ReactNode }).children) : c);
const f = (s: React.CSSProperties & { key?: React.Key }, c?: React.ReactNode) => { const { key, ...st } = s; return <div key={key} style={{ display: "flex", ...st }}>{kids(c)}</div>; };
const utc = (t: number) => new Date(t).toISOString().replace("T", " ").slice(0, 16) + " UTC";
const COL = { ok: "#16a34a", wait: "#d97706", bad: "#dc2626" };
const SOFT = { ok: "#dcfce7", wait: "#fef3c7", bad: "#fee2e2" };
const ICON = { ok: "M20 6L9 17l-5-5", wait: "M12 6v6l4 2", bad: "M18 6L6 18M6 6l12 12" };
const mark = (state: "ok" | "wait" | "bad", size: number, color: string) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[state]} /></svg>
);
const qrBlock = (qr: string | undefined, size: number, label: string, dark = false) => (qr ? f({ flexDirection: "column", alignItems: "center" }, <>
  {f({ background: "#fff", padding: 8, borderRadius: 12 }, /* eslint-disable-next-line @next/next/no-img-element */ <img src={qr} width={size} height={size} alt="" />)}
  {f({ fontSize: 17, marginTop: 6, color: dark ? "#8b949e" : "#6b7280" }, label)}
</>) : null);

export function rcptHeight(style: RcptStyle, d: RcptData) {
  const n = d.rows.length;
  if (style === "b") return 560 + n * 64 + (d.qr ? 210 : 40);
  if (style === "d") return 520 + n * 60 + 120 + (d.qr ? 90 : 0);
  if (style === "e") return 700 + (d.qr ? 120 : 20) + Math.min(2, n) * 20;
  if (style === "f") return 380 + d.steps.length * 104 + n * 52 + (d.qr ? 170 : 40);
  return 520 + n * 56 + 90;
}

/** B Banking · D Invoice · E Certificate · F Timeline · G Explorer */
export function rcptJsx(style: RcptStyle, d: RcptData) {
  const H = rcptHeight(style, d);
  const sc = COL[d.state];
  const sign = d.out ? "-" : "+";
  if (style === "b") {
    return f({ flexDirection: "column", width: W, height: H, background: "#e9edf5", padding: 36, fontFamily: "sans-serif" }, f({ flexDirection: "column", alignItems: "center", flex: 1, background: "#fff", borderRadius: 40, padding: "44px 48px 30px" }, <>
      {f({ width: 128, height: 128, borderRadius: 999, background: SOFT[d.state], alignItems: "center", justifyContent: "center" }, f({ width: 84, height: 84, borderRadius: 999, background: sc, alignItems: "center", justifyContent: "center" }, mark(d.state, 48, "#fff")))}
      {f({ fontSize: 40, fontWeight: 800, color: "#0b1220", marginTop: 22 }, `${d.title} ${d.state === "ok" ? "successful" : d.state === "wait" ? "pending" : "failed"}`)}
      {f({ fontSize: 22, color: "#6b7280", marginTop: 6 }, utc(d.at))}
      {f({ fontSize: 76, fontWeight: 800, color: "#0b1220", marginTop: 16 }, `${sign}${d.amount}`)}
      {f({ flexDirection: "column", width: "100%", background: "#f4f6fb", borderRadius: 24, padding: "10px 28px", marginTop: 22 }, d.rows.map(([k, v]) => f({ key: k, justifyContent: "space-between", alignItems: "center", height: 64, fontSize: 25 }, <>{f({ color: "#6b7280" }, k)}{f({ color: "#0b1220", fontWeight: 700 }, String(v).slice(0, 36))}</>)))}
      {f({ flexDirection: "column", alignItems: "center", marginTop: "auto", paddingTop: 16 }, <>
        {qrBlock(d.qr, 120, "Scan to verify")}
        {f({ fontSize: 19, color: "#9aa3b5", marginTop: 8 }, `${d.hashLabel}: ${d.hash.slice(0, 44)}${d.hash.length > 44 ? "…" : ""}`)}
      </>)}
    </>));
  }
  if (style === "d") {
    return f({ flexDirection: "column", width: W, height: H, background: "#e9edf5", padding: 36, fontFamily: "sans-serif" }, f({ flexDirection: "column", flex: 1, background: "#fff", borderTop: "14px solid #0b1220", padding: "34px 44px 30px" }, <>
      {f({ justifyContent: "space-between", alignItems: "flex-start" }, <>
        {f({ fontSize: 38, fontWeight: 800, letterSpacing: 4, color: "#0b1220" }, "TFUEL")}
        {f({ flexDirection: "column", alignItems: "flex-end" }, <>{f({ fontSize: 18, color: "#6b7280", letterSpacing: 2 }, "RECEIPT")}{f({ fontSize: 22, fontWeight: 700, color: "#0b1220" }, d.hash.slice(0, 26))}</>)}
      </>)}
      {f({ justifyContent: "space-between", marginTop: 26 }, <>
        {f({ flexDirection: "column" }, <>{f({ fontSize: 18, color: "#6b7280" }, "Type")}{f({ fontSize: 26, fontWeight: 700 }, d.title)}</>)}
        {f({ flexDirection: "column", alignItems: "flex-end" }, <>{f({ fontSize: 18, color: "#6b7280" }, "Date")}{f({ fontSize: 26, fontWeight: 700 }, utc(d.at))}</>)}
      </>)}
      {f({ flexDirection: "column", marginTop: 26 }, <>
        {f({ background: "#eef0f7", padding: "12px 18px", fontSize: 21, color: "#4b5563", justifyContent: "space-between" }, <>{f({}, "Description")}{f({}, "Amount")}</>)}
        {d.rows.map(([k, v]) => f({ key: k, justifyContent: "space-between", padding: "14px 18px", fontSize: 24, borderBottom: "2px solid #eef0f6" }, <>{f({ color: "#6b7280" }, k)}{f({ fontWeight: 700 }, String(v).slice(0, 34))}</>))}
        {f({ justifyContent: "space-between", padding: "18px 18px 8px", fontSize: 32, fontWeight: 800, borderTop: "3px solid #0b1220", marginTop: 10 }, <>{f({}, d.kind === "w" ? "Total received" : d.kind === "d" ? "Credited" : "Amount")}{f({}, d.net || d.amount)}</>)}
      </>)}
      {f({ justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", paddingTop: 20 }, <>
        {f({ flexDirection: "column" }, <>
          {f({ fontSize: 22, fontWeight: 800, color: sc }, d.status.toUpperCase())}
          {f({ fontSize: 18, color: "#9aa3b5", marginTop: 4 }, "Electronic receipt issued by TFUEL.")}
        </>)}
        {qrBlock(d.qr, 100, "Verify")}
      </>)}
    </>));
  }
  if (style === "e") {
    return f({ flexDirection: "column", width: W, height: H, background: "#efe6cf", padding: 30, fontFamily: "sans-serif" }, f({ flexDirection: "column", flex: 1, background: "#fbf7ec", border: "6px solid #8a6d2f", outline: "2px solid #8a6d2f", padding: "40px 48px 34px", alignItems: "center", position: "relative" }, <>
      {f({ fontSize: 22, letterSpacing: 8, color: "#6b5a2c" }, "TFUEL")}
      {f({ fontSize: 46, fontWeight: 800, color: "#3b2f12", marginTop: 14 }, d.kind === "w" ? "Certificate of Payout" : d.kind === "d" ? "Certificate of Deposit" : "Certificate of Transfer")}
      {f({ width: 160, height: 4, background: "#8a6d2f", marginTop: 18 })}
      {f({ fontSize: 26, color: "#6b5a2c", marginTop: 26 }, d.kind === "d" ? "This confirms that a deposit of" : d.kind === "w" ? "This confirms that a payout of" : d.out ? "This confirms that you sent" : "This confirms that you received")}
      {f({ fontSize: 78, fontWeight: 800, color: "#3b2f12", marginTop: 10 }, d.amount)}
      {f({ fontSize: 26, color: "#6b5a2c", marginTop: 10 }, `${d.rows[0]?.[0] === "From" ? "from" : d.kind === "d" ? "via" : "to"}`)}
      {f({ fontSize: 30, fontWeight: 700, color: "#3b2f12", marginTop: 6 }, String(d.rows[0]?.[1] || "").slice(0, 38))}
      {f({ fontSize: 23, color: "#6b5a2c", marginTop: 22 }, utc(d.at))}
      {f({ position: "absolute", right: 46, top: 250, width: 190, height: 190, border: `8px solid ${d.state === "bad" ? "#b91c1c" : d.state === "wait" ? "#d97706" : "#b91c1c"}`, borderRadius: 999, transform: "rotate(-14deg)", alignItems: "center", justifyContent: "center", fontSize: 44, fontWeight: 900, letterSpacing: 4, color: d.state === "wait" ? "#d97706" : "#b91c1c", opacity: 0.88 }, d.state === "ok" ? (d.kind === "w" || d.kind === "d" ? "PAID" : "DONE") : d.state === "wait" ? "PENDING" : "VOID")}
      {f({ justifyContent: "space-between", alignItems: "flex-end", width: "100%", marginTop: "auto", paddingTop: 18 }, <>
        {f({ flexDirection: "column" }, <>{f({ fontSize: 17, color: "#8a7a4a" }, d.hashLabel)}{f({ fontSize: 21, fontWeight: 700, color: "#3b2f12" }, d.hash.slice(0, 30))}</>)}
        {qrBlock(d.qr, 96, "Verify")}
      </>)}
    </>));
  }
  if (style === "f") {
    return f({ flexDirection: "column", width: W, height: H, background: "#e9edf5", padding: 36, fontFamily: "sans-serif" }, f({ flexDirection: "column", flex: 1, background: "#fff", borderRadius: 36, padding: "40px 48px 30px" }, <>
      {f({ justifyContent: "space-between", alignItems: "center" }, <>
        {f({ fontSize: 24, fontWeight: 800, letterSpacing: 3, color: "#0b1220" }, "TFUEL")}
        {f({ fontSize: 21, fontWeight: 700, color: sc, background: SOFT[d.state], padding: "6px 20px", borderRadius: 999 }, d.status)}
      </>)}
      {f({ fontSize: 24, color: "#6b7280", marginTop: 22 }, d.title)}
      {f({ fontSize: 72, fontWeight: 800, color: "#0b1220" }, `${sign}${d.amount}`)}
      {f({ flexDirection: "column", marginTop: 26, position: "relative" }, <>
        {f({ position: "absolute", left: 17, top: 14, bottom: 30, width: 4, background: d.steps.every((s) => s.done) ? "#16a34a" : "#d8dde8" })}
        {d.steps.map((s, i) => f({ key: i, alignItems: "flex-start", height: 104 }, <>
          {f({ width: 38, height: 38, borderRadius: 999, background: s.done ? "#16a34a" : "#fff", border: s.done ? "none" : "4px solid #cbd2e1", alignItems: "center", justifyContent: "center", marginRight: 22 }, s.done ? mark("ok", 22, "#fff") : null)}
          {f({ flexDirection: "column" }, <>{f({ fontSize: 28, fontWeight: 700, color: s.done ? "#0b1220" : "#9aa3b5" }, s.t)}{f({ fontSize: 21, color: "#6b7280", marginTop: 2 }, s.sub)}</>)}
        </>))}
      </>)}
      {f({ flexDirection: "column", background: "#f4f6fb", borderRadius: 20, padding: "6px 24px", marginTop: 6 }, d.rows.map(([k, v]) => f({ key: k, justifyContent: "space-between", height: 52, alignItems: "center", fontSize: 22 }, <>{f({ color: "#6b7280" }, k)}{f({ fontWeight: 700 }, String(v).slice(0, 34))}</>)))}
      {f({ justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", paddingTop: 16 }, <>
        {f({ flexDirection: "column" }, <>{f({ fontSize: 17, color: "#9aa3b5" }, d.hashLabel)}{f({ fontSize: 19, fontWeight: 700 }, d.hash.slice(0, 32))}</>)}
        {qrBlock(d.qr, 100, "Verify")}
      </>)}
    </>));
  }
  // g — explorer (dark)
  const g = { bg: "#0d1117", line: "#30363d", mute: "#8b949e", txt: "#e6edf3", ok: "#3fb950" };
  return f({ flexDirection: "column", width: W, height: H, background: "#05070a", padding: 36, fontFamily: "monospace" }, f({ flexDirection: "column", flex: 1, background: g.bg, border: `2px solid ${g.line}`, borderRadius: 24, padding: "34px 40px" }, <>
    {f({ justifyContent: "space-between", fontSize: 21, color: g.mute }, <>{f({}, "TFUEL EXPLORER")}{f({ alignItems: "center", color: d.state === "ok" ? g.ok : d.state === "wait" ? "#d29922" : "#f85149" }, <>{f({ width: 14, height: 14, borderRadius: 999, background: d.state === "ok" ? g.ok : d.state === "wait" ? "#d29922" : "#f85149", marginRight: 10 })}{d.status.toUpperCase()}</>)}</>)}
    {f({ fontSize: 70, fontWeight: 700, color: g.txt, marginTop: 24 }, `${sign}${d.amount}`)}
    {f({ fontSize: 22, color: g.mute, marginTop: 4 }, `${d.title.toUpperCase()}`)}
    {f({ flexDirection: "column", marginTop: 26, borderTop: `2px solid ${g.line}` }, d.rows.concat([[d.hashLabel, d.hash.slice(0, 30)], ["Time", utc(d.at)]]).map(([k, v]) => f({ key: k, justifyContent: "space-between", height: 56, alignItems: "center", fontSize: 22, borderBottom: `2px solid ${g.line}` }, <>{f({ color: g.mute }, k.toUpperCase())}{f({ color: g.txt }, String(v).slice(0, 34))}</>)))}
    {f({ justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto", paddingTop: 16 }, <>
      {f({ fontSize: 18, color: g.mute }, "Scan the code to verify this record")}
      {qrBlock(d.qr, 100, "", true)}
    </>)}
  </>));
}

import React from "react";

export type CardStyle = "1" | "3" | "4" | "7";
export const CARD_STYLES: { id: CardStyle; name: string }[] = [
  { id: "1", name: "Dark Fintech" },
  { id: "3", name: "Neon Cyber" },
  { id: "4", name: "Gold Premium" },
  { id: "7", name: "Member Card" },
];
export const cardStyleOk = (s: unknown): CardStyle => (s === "3" || s === "4" || s === "7" ? s : "1");

export interface CardData { kicker: string; h1: string; big?: string; code?: string; foot?: string; qr?: string; tag?: string }
export const CARD_W = 1000, CARD_H = 560;

const kids = (c: React.ReactNode): React.ReactNode => (React.isValidElement(c) && c.type === React.Fragment ? React.Children.toArray((c.props as { children?: React.ReactNode }).children) : c);
const row = (s: React.CSSProperties, c: React.ReactNode) => <div style={{ display: "flex", ...s }}>{kids(c)}</div>;
const lines = (t: string, st: React.CSSProperties) => t.split("\n").slice(0, 3).map((l, i) => <div key={i} style={{ display: "flex", ...st }}>{l}</div>);
const qrBox = (src: string | undefined, border: string) => (src ? (
  <div style={{ display: "flex", background: "#fff", padding: 12, borderRadius: 20, border: `5px solid ${border}` }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={src} width={150} height={150} alt="" />
  </div>
) : null);
const fit = (s: string) => (s.length > 14 ? 40 : s.length > 9 ? 50 : 62);

/** One card, four looks: 1 Dark Fintech · 3 Neon Cyber · 4 Gold Premium · 7 Member Card */
export function cardJsx(style: CardStyle, d: CardData) {
  const base: React.CSSProperties = { display: "flex", position: "relative", width: CARD_W, height: CARD_H, overflow: "hidden", fontFamily: "sans-serif" };
  const pad: React.CSSProperties = { display: "flex", flexDirection: "column", justifyContent: "space-between", width: CARD_W, height: CARD_H, padding: "44px 56px", position: "relative" };
  const logo = (bg: string, fg: string, col: string, label = "TFUEL") => row({ alignItems: "center" }, <>
    <div style={{ display: "flex", width: 46, height: 46, borderRadius: 999, background: bg, color: fg, alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800 }}>T</div>
    <div style={{ display: "flex", marginLeft: 14, fontSize: 30, fontWeight: 800, letterSpacing: 4, color: col }}>{label}</div>
  </>);

  if (style === "3") {
    const c = "#22d3ee";
    return (
      <div style={{ ...base, background: "#0b0614", border: `4px solid ${c}`, boxShadow: `inset 0 0 70px ${c}55` }}>
        <div style={pad}>
          {row({ justifyContent: "space-between", alignItems: "center" }, <>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 800, letterSpacing: 5, color: c }}>TFUEL</div>
            <div style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#ff3d9a", letterSpacing: 2 }}>{d.tag || "// PLAYER INVITE"}</div>
          </>)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 26, color: "#ff3d9a", letterSpacing: 2 }}>{d.kicker}</div>
            {lines(d.h1, { fontSize: 70, fontWeight: 800, color: "#fff", lineHeight: 1.05, textShadow: `0 0 26px ${c}` })}
            {d.big && <div style={{ display: "flex", fontSize: 60, fontWeight: 800, color: "#c6ff3d", marginTop: 8, textShadow: "0 0 18px #c6ff3d" }}>{d.big}</div>}
          </div>
          {row({ justifyContent: "space-between", alignItems: "flex-end" }, <>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {d.code && <div style={{ display: "flex", fontSize: fit(d.code), fontWeight: 800, color: "#c6ff3d", letterSpacing: 4, textShadow: "0 0 12px #c6ff3d" }}>{d.code}</div>}
              {d.foot && <div style={{ display: "flex", fontSize: 24, color: "#9aa7c7", marginTop: 6 }}>{d.foot}</div>}
            </div>
            {qrBox(d.qr, c)}
          </>)}
        </div>
      </div>
    );
  }

  if (style === "4") {
    const g = "#f6dc8f", g2 = "#b88a2a";
    return (
      <div style={{ ...base, background: "linear-gradient(135deg,#1a1405,#000000 55%,#2a1f05)", border: `3px solid ${g2}` }}>
        <div style={pad}>
          {row({ justifyContent: "space-between", alignItems: "center" }, <>
            {logo(g, "#1a1405", "#e8c366", "TFUEL PRIVATE")}
            <div style={{ display: "flex", fontSize: 22, color: "#b9a56a", letterSpacing: 3 }}>{d.tag || "BY INVITATION"}</div>
          </>)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 26, color: "#b9a56a" }}>{d.kicker}</div>
            {lines(d.h1, { fontSize: 72, fontWeight: 800, color: g, lineHeight: 1.05 })}
            {d.big && <div style={{ display: "flex", fontSize: 58, fontWeight: 800, color: "#fff", marginTop: 8 }}>{d.big}</div>}
          </div>
          {row({ justifyContent: "space-between", alignItems: "flex-end" }, <>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {d.code && <div style={{ display: "flex", fontSize: fit(d.code), fontWeight: 800, color: g, letterSpacing: 4 }}>{d.code}</div>}
              {d.foot && <div style={{ display: "flex", fontSize: 24, color: "#b9a56a", marginTop: 6 }}>{d.foot}</div>}
            </div>
            {qrBox(d.qr, g2)}
          </>)}
        </div>
      </div>
    );
  }

  if (style === "7") {
    const spaced = d.code ? d.code.replace(/(.{4})/g, "$1 ").trim() : "";
    return (
      <div style={{ ...base, background: "linear-gradient(135deg,#111827,#1f2a5c 60%,#3b2a7a)" }}>
        <div style={pad}>
          {row({ justifyContent: "space-between", alignItems: "center" }, <>
            {logo("#f5a623", "#111827", "#ffffff")}
            <div style={{ display: "flex", fontSize: 22, color: "#aab4d4", letterSpacing: 3 }}>{d.tag || "MEMBER CARD"}</div>
          </>)}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", width: 76, height: 56, borderRadius: 10, background: "linear-gradient(135deg,#f6dc8f,#b88a2a)", marginBottom: 20 }} />
            {spaced ? <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: "#fff", letterSpacing: 6 }}>{spaced}</div> : lines(d.h1, { fontSize: 60, fontWeight: 800, color: "#fff", lineHeight: 1.05 })}
            {d.big && <div style={{ display: "flex", fontSize: 50, fontWeight: 800, color: "#f6dc8f", marginTop: 10 }}>{d.big}</div>}
          </div>
          {row({ justifyContent: "space-between", alignItems: "flex-end" }, <>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 18, color: "#aab4d4", letterSpacing: 2 }}>{spaced ? d.h1.replace(/\n/g, " ").toUpperCase().slice(0, 30) : d.kicker.toUpperCase().slice(0, 30)}</div>
              <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#fff", marginTop: 4 }}>{spaced ? d.kicker : d.foot || ""}</div>
            </div>
            {qrBox(d.qr, "#ffffff")}
          </>)}
        </div>
      </div>
    );
  }

  // 1 · Dark Fintech
  return (
    <div style={{ ...base, background: "#0a1020" }}>
      <div style={{ display: "flex", position: "absolute", right: -160, top: -200, width: 640, height: 640, borderRadius: 999, background: "radial-gradient(circle,#2b3a8a,#0a102000 70%)" }} />
      <div style={{ display: "flex", position: "absolute", left: -200, bottom: -260, width: 640, height: 640, borderRadius: 999, background: "radial-gradient(circle,#0e6b8f,#0a102000 70%)" }} />
      <div style={pad}>
        {row({ justifyContent: "space-between", alignItems: "center" }, <>
          {logo("#f5a623", "#0a1020", "#ffffff")}
          {d.tag && <div style={{ display: "flex", fontSize: 22, color: "#aab4d4", letterSpacing: 3 }}>{d.tag}</div>}
        </>)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 26, color: "#aab4d4" }}>{d.kicker}</div>
          {lines(d.h1, { fontSize: 72, fontWeight: 800, color: "#fff", lineHeight: 1.05 })}
          {d.big && <div style={{ display: "flex", fontSize: 60, fontWeight: 800, color: "#f5a623", marginTop: 8 }}>{d.big}</div>}
        </div>
        {row({ justifyContent: "space-between", alignItems: "flex-end" }, <>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {d.code && <div style={{ display: "flex", fontSize: 20, color: "#aab4d4" }}>Your code</div>}
            {d.code && <div style={{ display: "flex", fontSize: fit(d.code), fontWeight: 800, color: "#f5a623", letterSpacing: 4 }}>{d.code}</div>}
            {d.foot && <div style={{ display: "flex", fontSize: 24, color: "#aab4d4", marginTop: 6 }}>{d.foot}</div>}
          </div>
          {qrBox(d.qr, "#ffffff")}
        </>)}
      </div>
    </div>
  );
}

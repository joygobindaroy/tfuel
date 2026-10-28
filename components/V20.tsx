import { useState } from "react";
import Icon from "@/components/Icons";
import { api } from "@/lib/client";

/** "What's new" popup: shown once per version to people who have been here a day or more */
export function WhatsNew({ w, onDone }: { w: { version: string; text: string }; onDone: () => void }) {
  const go = async () => { try { await api("seen", {}); } catch {} onDone(); };
  return (
    <div className="sheet-bg" style={{ alignItems: "center" }} onClick={go}>
      <div className="sheet" style={{ borderRadius: 22, margin: 16, paddingBottom: 20 }} onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ fontSize: 20, textAlign: "center" }}><Icon name="sparkle" size={14} /> What&apos;s new in {w.version}</div>
        <div className="sub" style={{ margin: "10px 0 14px", textAlign: "center" }}>{w.text}</div>
        <button className="btn" style={{ width: "100%" }} onClick={go}>Got it</button>
      </div>
    </div>
  );
}

/** Running bonus event strip + today's community goal */
export function EventStrip({ ev, gq }: { ev?: { mult: number } | null; gq?: { title: string; target: number; bonus: number; n: number; done: boolean } | null }) {
  const [hide, setHide] = useState(false);
  if (hide || (!ev && !gq)) return null;
  const pct = gq ? Math.min(100, Math.floor((gq.n / Math.max(1, gq.target)) * 100)) : 0;
  return (
    <div className="card" style={{ position: "relative" }}>
      {ev && <div className="row"><div><div className="title"><Icon name="zap" size={14} /> ×{ev.mult} rewards are on!</div><div className="sub">Daily rewards, tasks and games pay more right now.</div></div></div>}
      {gq && (
        <div style={{ marginTop: ev ? 10 : 0 }}>
          <div className="row"><div className="b"><Icon name="target" size={14} /> {gq.title}</div><span className="xs muted">{gq.done ? "Reached!" : `${gq.n}/${gq.target}`}</span></div>
          <div className="xs muted" style={{ margin: "2px 0 6px" }}>{gq.done ? `Everyone who claimed today got +${gq.bonus} coins.` : `Claim your daily reward — if ${gq.target} people do it today, all of them get +${gq.bonus} coins.`}</div>
          <div className="bar"><div style={{ width: `${gq.done ? 100 : pct}%` }} /></div>
        </div>
      )}
      <button className="btn ghost sm" style={{ position: "absolute", right: 6, top: 6 }} aria-label="Hide" onClick={() => setHide(true)}>×</button>
    </div>
  );
}

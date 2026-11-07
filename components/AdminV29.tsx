import { useCallback, useEffect, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
const when = (t: number) => new Date(t).toLocaleString();

/** Admin → Team: shared notes, referral contest, exchange rate history */
export default function AdminV29({ call }: { call: Call }) {
  const [notes, setNotes] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [c, setC] = useState<any>(null);
  const [rt, setRt] = useState<any>(null);
  const [days, setDays] = useState("30");
  useEffect(() => { call<any>({ action: "v29Notes" }).then((r) => r && setNotes(r.list)); call<any>({ action: "v29Contest" }).then((r) => r && setC(r.c)); }, [call]);
  const loadRates = useCallback(async () => { const r = await call<any>({ action: "v29Rates", days: Number(days) || 30 }); if (r) setRt(r); }, [call, days]);
  useEffect(() => { loadRates(); }, [loadRates]);
  const nt = async (body: any, ok?: string) => { const r = await call<any>(body, ok); if (r) setNotes(r.list); };
  const pay = async () => { if (!window.confirm("Pay the contest prizes now? This cannot be repeated.")) return; const r = await call<any>({ action: "v29ContestPay" }, "Prizes paid"); if (r) setC(r.c); };
  return (
    <>
      <div className="mhead">Team notes</div>
      <div className="card">
        <div className="gap"><input style={{ flex: 1 }} maxLength={300} placeholder="Leave a note for the team…" value={text} onChange={(e) => setText(e.target.value)} /><button className="btn sm" disabled={text.trim().length < 3} onClick={async () => { await nt({ action: "v29NoteAdd", text }); setText(""); }}>Add</button></div>
        {!notes.length && <div className="sub" style={{ marginTop: 8 }}>No notes yet.</div>}
        {notes.map((n) => (
          <div key={n.id} className="row" style={{ marginTop: 8, opacity: n.done ? 0.55 : 1 }}>
            <div style={{ minWidth: 0 }}><div style={{ textDecoration: n.done ? "line-through" : "none" }}>{n.text}</div><div className="xs muted">{n.by} · {when(n.at)}</div></div>
            <div className="gap"><button className="btn sec sm" onClick={() => nt({ action: "v29NoteDone", id: n.id, done: !n.done })}>{n.done ? "Reopen" : "Done"}</button><button className="btn ghost sm" onClick={() => nt({ action: "v29NoteDel", id: n.id })}>Delete</button></div>
          </div>
        ))}
      </div>
      <div className="mhead">Referral contest</div>
      <div className="card">
        {!c && <div className="sub">No contest is set. Turn one on in Growth → Referral contest.</div>}
        {c && (
          <>
            <div className="row"><b>{c.title}</b><span className="pill info">{c.live ? "Live" : c.ended ? "Ended" : "Not started"}</span></div>
            <div className="xs muted">{when(c.start)} → {when(c.end)}</div>
            {c.board.map((r: any) => <div key={r.rank} className="sumrow"><span>#{r.rank} {r.name}</span><b className="num">{r.n}</b></div>)}
            {c.ended && !c.paid && <button className="btn block" style={{ marginTop: 8 }} onClick={pay}>Pay prizes</button>}
            {c.paid && <div className="xs muted" style={{ marginTop: 6 }}>Prizes already paid.</div>}
          </>
        )}
      </div>
      <div className="mhead">Exchange rate history</div>
      <div className="card">
        <select value={days} onChange={(e) => setDays(e.target.value)} style={{ width: "auto" }}><option value="14">14 days</option><option value="30">30 days</option><option value="90">90 days</option></select>
        {rt && rt.rates.length > 1 ? <RateChart rates={rt.rates} vol={rt.report} /> : <div className="sub" style={{ marginTop: 8 }}>Rates are saved once a day once Exchange is on. Check back tomorrow.</div>}
      </div>
    </>
  );
}

function RateChart({ rates, vol }: { rates: { day: string; buy: number; sell: number }[]; vol: any[] }) {
  const W = 320, H = 120, P = 6;
  const all = rates.flatMap((r) => [r.buy, r.sell]).filter((x) => x > 0);
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, rates.length - 1);
  const y = (v: number) => H - P - ((v - lo) / span) * (H - 2 * P);
  const path = (k: "buy" | "sell") => rates.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r[k]).toFixed(1)}`).join(" ");
  const vmax = Math.max(1, ...vol.map((v) => v.buy_usdt + v.sell_usdt));
  return (
    <div style={{ marginTop: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Exchange rates over time">
        {vol.map((v) => { const i = rates.findIndex((r) => r.day === v.day); if (i < 0) return null; const h = ((v.buy_usdt + v.sell_usdt) / vmax) * 30; return <rect key={v.day} x={x(i) - 3} y={H - P - h} width={6} height={h} fill="currentColor" opacity={0.12} />; })}
        <path d={path("buy")} fill="none" stroke="#e5484d" strokeWidth={2} />
        <path d={path("sell")} fill="none" stroke="#30a46c" strokeWidth={2} />
      </svg>
      <div className="xs muted"><span style={{ color: "#e5484d" }}>●</span> users buy at · <span style={{ color: "#30a46c" }}>●</span> users sell at · bars = daily volume · {lo}–{hi}</div>
    </div>
  );
}

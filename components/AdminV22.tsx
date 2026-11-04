import { useCallback, useEffect, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
const ago = (t: number) => new Date(t).toLocaleString();

/** Admin → Feedback & reports: ratings, user reports queue, poll results */
export default function AdminV22({ call }: { call: Call }) {
  const [d, setD] = useState<any>(null);
  const [view, setView] = useState("open");
  const [kyc, setKyc] = useState<any[]>([]);
  const [cal, setCal] = useState<any[]>([]);
  useEffect(() => { call<any>({ action: "v22Kyc" }).then((r) => r && setKyc(r.list)); call<any>({ action: "v22Calendar" }).then((r) => r && setCal(r.list)); }, [call]);
  const kycSet = async (uid: string, status: string) => { const note = status === "rejected" ? window.prompt("Reason (optional)") || "" : ""; const r = await call<any>({ action: "v22KycSet", uid, status, note }); if (r) setKyc(r.list); };
  const ledgerCsv = async () => { const r = await call<any>({ action: "v22Ledger", days: 90 }); if (!r) return; const rows = [Object.keys(r.rows[0] || { day: 1 }), ...r.rows.map((x: any) => Object.values(x))]; const blob = new Blob([rows.map((x) => x.join(",")).join("\n")], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ledger.csv"; a.click(); };
  const [act, setAct] = useState<any>(null);
  const [days, setDays] = useState("30");
  const loadAct = useCallback(async () => { const r = await call<any>({ action: "v22Activity", days: Number(days) || 30 }); if (r) setAct(r); }, [call, days]);
  useEffect(() => { loadAct(); }, [loadAct]);
  const load = useCallback(async () => { const r = await call<any>({ action: "v22Data", status: view }); if (r) setD(r); }, [call, view]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="empty">Loading…</div>;
  const resolve = async (id: string, status: string) => { const note = status === "dismissed" ? "" : window.prompt("Note (optional)") || ""; const r = await call<any>({ action: "v22ReportResolve", id, status, note, view }); if (r) setD({ ...d, reports: r.reports }); };
  const csv = () => {
    const rows = [["name", "kind", "stars", "text", "date"], ...d.feedback.list.map((f: any) => [f.name, f.kind, f.stars, String(f.text || "").replace(/"/g, "'"), new Date(f.at).toISOString()])];
    const blob = new Blob([rows.map((r) => r.map((c: any) => `"${c}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "feedback.csv"; a.click();
  };
  return (
    <>
      <div className="mhead">Identity checks</div>
      <div className="card">
        {!kyc.length && <div className="sub">Nothing waiting.</div>}
        {kyc.map((k) => (
          <div key={k.uid} style={{ marginTop: 8 }}>
            <div className="row"><b>{k.name}</b><span className="xs muted">{ago(k.at)}</span></div>
            <div className="xs" style={{ wordBreak: "break-all" }}><a href={k.link} target="_blank" rel="noreferrer">{k.link}</a></div>
            {k.note && <div className="xs muted">{k.note}</div>}
            <div className="gap" style={{ marginTop: 6 }}><button className="btn sm" onClick={() => kycSet(k.uid, "ok")}>Approve</button><button className="btn danger sm" onClick={() => kycSet(k.uid, "rejected")}>Reject</button></div>
          </div>
        ))}
      </div>
      <div className="mhead">Next 30 days</div>
      <div className="card">
        {!cal.length && <div className="sub">Nothing planned. Events, pop-ups, draws, tournaments and scheduled messages show here.</div>}
        {cal.map((c, i) => <div key={i} className="row xs" style={{ marginTop: 6 }}><span><b>{c.kind}</b> · {c.text}</span><span className="muted">{ago(c.at)}</span></div>)}
        <button className="btn sec sm" style={{ marginTop: 10 }} onClick={ledgerCsv}>Download daily ledger (90 days, CSV)</button>
      </div>
      <div className="mhead">Admin activity</div>
      {act && (
        <div className="card">
          <div className="chips">{["7", "30", "90"].map((x) => <button key={x} className={`chip ${days === x ? "on" : ""}`} onClick={() => setDays(x)}>{x} days</button>)}</div>
          {!act.admins.length && <div className="sub" style={{ marginTop: 8 }}>No admin activity.</div>}
          {act.admins.map((a: any) => <div key={a.name} style={{ marginTop: 10 }}><div className="row"><b>{a.name}</b><span className="pill info">{a.total} actions</span></div><div className="xs muted">{a.top.map((t: any) => `${t.action} ×${t.n}`).join(" · ")}</div></div>)}
          <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Money actions</div>
          {!act.money.length && <div className="xs muted">None.</div>}
          {act.money.slice(0, 40).map((m: any, i: number) => <div key={i} className="xs" style={{ marginTop: 6 }}><b>{m.action}</b> · {m.by} · {ago(m.at)}<div className="muted" style={{ wordBreak: "break-all" }}>{m.detail}</div></div>)}
        </div>
      )}
      {act?.heat && (
        <>
          <div className="mhead">When people are active</div>
          <div className="card">
            <div className="xs muted">Last 7 days · {act.heat.n} people · {act.heat.tz}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 90, marginTop: 8 }}>
              {act.heat.hours.map((n: number, h: number) => <div key={h} title={`${h}:00 · ${n}`} style={{ flex: 1, height: `${Math.max(3, (n / Math.max(1, ...act.heat.hours)) * 100)}%`, background: "var(--gold2, #f5a623)", borderRadius: 2 }} />)}
            </div>
            <div className="row xs muted" style={{ marginTop: 4 }}><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
            <div className="xs" style={{ marginTop: 6 }}>Best hour to send a message: <b>{act.heat.hours.indexOf(Math.max(...act.heat.hours))}:00</b></div>
          </div>
        </>
      )}
      <div className="mhead">User reports</div>
      <div className="card">
        <div className="chips">{["open", "done", "dismissed", "all"].map((s) => <button key={s} className={`chip ${view === s ? "on" : ""}`} onClick={() => setView(s)}>{s}</button>)}</div>
        {!d.reports.length && <div className="sub" style={{ marginTop: 8 }}>No reports.</div>}
        {d.reports.map((r: any) => (
          <div key={r.id} style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 10 }}>
            <div className="row"><b>{r.targetName} <span className="xs muted">({r.target})</span></b><span className={`pill ${r.count > 2 ? "warn" : "info"}`}>{r.count} report{r.count > 1 ? "s" : ""}</span></div>
            <div className="sm" style={{ marginTop: 4 }}>{r.reason}</div>
            <div className="xs muted">by {r.byName} · {ago(r.at)} · {r.status}{r.note ? ` · ${r.note}` : ""}</div>
            {r.status === "open" && <div className="gap" style={{ marginTop: 6 }}><button className="btn sm" onClick={() => resolve(r.id, "done")}>Mark handled</button><button className="btn sec sm" onClick={() => resolve(r.id, "dismissed")}>Dismiss</button></div>}
          </div>
        ))}
      </div>
      <div className="mhead">Ratings</div>
      <div className="card">
        <div className="grid2"><div><div className="xs muted">App</div><div className="num" style={{ fontWeight: 800, fontSize: 22 }}>{d.feedback.app.avg || "–"} <span className="xs muted">({d.feedback.app.n})</span></div></div><div><div className="xs muted">Support</div><div className="num" style={{ fontWeight: 800, fontSize: 22 }}>{d.feedback.support.avg || "–"} <span className="xs muted">({d.feedback.support.n})</span></div></div></div>
        {d.feedback.list.slice(0, 15).map((f: any) => <div key={f.id} style={{ marginTop: 8 }} className="sm"><b>{"★".repeat(f.stars)}</b> <span className="xs muted">{f.kind} · {f.name}</span>{f.text ? ` — ${f.text}` : ""}</div>)}
        {d.feedback.list.length > 0 && <button className="btn sec sm" style={{ marginTop: 10 }} onClick={csv}>Download CSV</button>}
      </div>
      <div className="mhead">Poll results</div>
      {d.cfg.polls.map((p: any) => {
        const t = d.polls.find((x: any) => x.id === p.id);
        return (
          <div className="card" key={p.id}>
            <div className="row"><div className="title">{p.title}</div><span className="pill info">{t?.n || 0} votes</span></div>
            {p.qs.map((q: any, qi: number) => <div key={qi} style={{ marginTop: 8 }}><b className="sm">{q.q}</b>{q.opts.map((o: string, oi: number) => <div key={oi} className="row xs"><span>{o}</span><span className="num">{t?.qs?.[qi]?.[oi] || 0}</span></div>)}</div>)}
          </div>
        );
      })}
      {!d.cfg.polls.length && <div className="sub">No polls yet. Create one in Growth & Games → Help center, polls, feedback.</div>}
    </>
  );
}

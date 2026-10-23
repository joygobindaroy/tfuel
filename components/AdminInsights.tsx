import { useCallback, useEffect, useMemo, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
interface Pt { day: string; active: number; joined: number; depositU: number; payoutU: number; withdraws: number }

const fmtDay = (d: string) => `${d.slice(6)}/${d.slice(4, 6)}`;
const nice = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(Math.round(n * 100) / 100));

/** Lightweight inline-SVG chart: bars or line, axis labels, <title> tooltips */
function Chart({ title, pts, get, unit = "", kind = "bar", color = "var(--gold2)" }: { title: string; pts: Pt[]; get: (p: Pt) => number; unit?: string; kind?: "bar" | "line"; color?: string }) {
  const W = 320, H = 130, L = 34, B = 18, T = 8, R = 6;
  const vals = pts.map(get);
  const max = Math.max(1, ...vals);
  const total = vals.reduce((a, v) => a + v, 0);
  const iw = W - L - R, ih = H - B - T;
  const step = iw / Math.max(1, pts.length);
  const x = (i: number) => L + step * i + step / 2;
  const y = (v: number) => T + ih - (v / max) * ih;
  const every = Math.max(1, Math.ceil(pts.length / 6));
  return (
    <div className="card">
      <div className="row"><div className="title">{title}</div><span className="pill info">{nice(total)}{unit}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block", marginTop: 6 }} role="img" aria-label={title}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={L} x2={W - R} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" strokeWidth="1" />
            <text x={L - 4} y={y(max * f) + 3} fontSize="9" textAnchor="end" fill="var(--muted)">{nice(max * f)}</text>
          </g>
        ))}
        {kind === "bar" ? pts.map((p, i) => {
          const v = get(p), bw = Math.max(1, step * 0.7);
          return (
            <rect key={p.day} x={x(i) - bw / 2} y={y(v)} width={bw} height={Math.max(0, T + ih - y(v))} rx="1.5" fill={color}>
              <title>{`${fmtDay(p.day)}: ${nice(v)}${unit}`}</title>
            </rect>
          );
        }) : (
          <>
            <polyline fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" points={pts.map((p, i) => `${x(i)},${y(get(p))}`).join(" ")} />
            {pts.map((p, i) => (
              <circle key={p.day} cx={x(i)} cy={y(get(p))} r={pts.length > 40 ? 2 : 3} fill={color}>
                <title>{`${fmtDay(p.day)}: ${nice(get(p))}${unit}`}</title>
              </circle>
            ))}
          </>
        )}
        {pts.map((p, i) => (i % every === 0 ? <text key={p.day} x={x(i)} y={H - 4} fontSize="9" textAnchor="middle" fill="var(--muted)">{fmtDay(p.day)}</text> : null))}
      </svg>
    </div>
  );
}

type SortKey = "done" | "pct" | "title";

/** Admin → Insights */
export default function InsightsPage({ call }: { call: Call }) {
  const [days, setDays] = useState(30);
  const [d, setD] = useState<any>(null);
  const [ts, setTs] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<SortKey>("done");
  const [asc, setAsc] = useState(false);

  const load = useCallback(async (refresh = false, n = days) => {
    setBusy(true);
    const [a, b] = await Promise.all([call({ action: "insightsData", days: n, refresh }), call({ action: "taskStats" })]);
    if (a) setD(a);
    if (b) setTs(b);
    setBusy(false);
  }, [call, days]);
  useEffect(() => { load(false, days); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const sorter = useCallback((rows: any[]) => [...rows].sort((a, c) => {
    const r = sort === "title" ? String(a.title || "").localeCompare(String(c.title || "")) : (a[sort] || 0) - (c[sort] || 0);
    return asc ? r : -r;
  }), [sort, asc]);
  const tasks = useMemo(() => sorter(ts?.tasks || []), [ts, sorter]);
  const sites = useMemo(() => sorter(ts?.sites || []), [ts, sorter]);
  const th = (k: SortKey, label: string) => (
    <th style={{ cursor: "pointer" }} onClick={() => { if (sort === k) setAsc(!asc); else { setSort(k); setAsc(false); } }}>{label}{sort === k ? (asc ? " ▲" : " ▼") : ""}</th>
  );

  const sendSummary = () => call({ action: "summaryNow", send: true }, "Summary sent to your Telegram");
  const toggleSite = async (s: any) => { if (await call({ action: "toggleSite", siteId: s.id, active: !s.active }, s.active ? "Site turned off" : "Site turned on")) load(false); };
  const removeTask = async (t: any) => {
    if (!window.confirm(`Delete task "${t.title}"? This cannot be undone.`)) return;
    if (await call({ action: "deleteTask", taskId: t.id }, "Task deleted")) load(false);
  };

  if (!d) return <div className="empty">Loading…</div>;
  const series: Pt[] = d.series || [];
  const low = (pct: number) => pct < 5;
  const sum = d.summary;

  return (
    <>
      <div className="toolbar">
        <h2 style={{ margin: 0, flex: 1 }}>Insights</h2>
        <div className="seg" style={{ margin: 0 }}>
          {[7, 30, 90].map((n) => <button key={n} className={days === n ? "on" : ""} onClick={() => setDays(n)}>{n} days</button>)}
        </div>
        <button className="btn sec sm" disabled={busy} onClick={() => load(true)}>{busy ? "Loading…" : "Refresh"}</button>
      </div>
      <div className="sub" style={{ marginBottom: 10 }}>Based on {d.scanned?.toLocaleString("en-US")} users. User data is cached for 10 minutes; press Refresh to rescan.</div>

      <div className="grid2">
        <Chart title="New users" pts={series} get={(p) => p.joined} />
        <Chart title="Active users" pts={series} get={(p) => p.active} kind="line" color="var(--info, #3b82f6)" />
        <Chart title="Earnings (approved deposits)" pts={series} get={(p) => p.depositU} unit=" USDT" color="var(--ok)" />
        <Chart title="Withdrawals (USDT paid out)" pts={series} get={(p) => p.payoutU} unit=" USDT" kind="line" color="var(--err)" />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="title">Retention</div>
          <div className="sub">Share of users seen again N days after joining (approximate, based on last seen).</div>
          <table className="tbl" style={{ marginTop: 6 }}>
            <thead><tr><th>Day</th><th>Users</th><th>Returned</th><th>Rate</th></tr></thead>
            <tbody>
              {(d.retention || []).map((r: any) => (
                <tr key={r.day}>
                  <td><b>D{r.day}</b></td><td>{r.users}</td><td>{r.kept}</td>
                  <td>
                    <div className="row" style={{ gap: 6 }}>
                      <b>{r.pct}%</b>
                      <div className="bar" style={{ flex: 1, minWidth: 40 }}><div style={{ width: `${Math.min(100, r.pct)}%` }} /></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="title">Funnel</div>
          <div className="sub">All users, from joining to withdrawing.</div>
          <div style={{ marginTop: 8 }}>
            {(d.funnel || []).map((f: any, i: number, arr: any[]) => {
              const prev = i ? arr[i - 1].n : 0;
              const step = i && prev ? Math.round((f.n / prev) * 1000) / 10 : null;
              return (
                <div key={f.step} style={{ marginBottom: 8 }}>
                  {step !== null && <div className="sub" style={{ textAlign: "center", margin: "0 0 4px" }}>↓ {step}% of previous step</div>}
                  <div className="row"><span>{f.step}</span><span><b>{f.n.toLocaleString("en-US")}</b> <span className="muted">({f.pct}%)</span></span></div>
                  <div className="bar"><div style={{ width: `${Math.max(1, Math.min(100, f.pct))}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <div className="title">Yesterday&apos;s summary</div>
          <button className="btn sm" onClick={sendSummary}>Send to my Telegram</button>
        </div>
        {sum && (
          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>{`Day ${sum.day.slice(0, 4)}-${sum.day.slice(4, 6)}-${sum.day.slice(6)} (UTC)
New users: ${sum.joined}
Active: ${sum.active}
Deposits: ${sum.depositU} USDT
Paid out: ${sum.payoutU} USDT (${sum.withdraws} requests)
Pending payouts: ${sum.pendingPayouts}
Open tickets: ${sum.openTickets}`}</pre>
        )}
      </div>

      <div className="card">
        <div className="title">Task performance</div>
        <div className="sub">Completion = share of all users who completed it. Under 5% is highlighted.</div>
        {!tasks.length ? <div className="empty">No tasks yet</div> : (
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr>{th("title", "Task")}<th>Type</th><th>Reward</th>{th("done", "Done")}{th("pct", "Completion")}<th /></tr></thead>
              <tbody>
                {tasks.map((t: any) => (
                  <tr key={t.id} style={low(t.pct) ? { background: "var(--warn-bg)" } : undefined}>
                    <td>{t.title}</td><td>{t.type}</td><td>{t.reward}</td><td>{t.done}</td>
                    <td><span className={`pill ${low(t.pct) ? "warn" : "ok"}`}>{t.pct}%</span></td>
                    <td><button className="btn danger sm" onClick={() => removeTask(t)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="title">Article site performance</div>
        {!sites.length ? <div className="empty">No article sites yet</div> : (
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr>{th("title", "Site")}<th>Reward</th>{th("done", "Done")}{th("pct", "Completion")}<th>Status</th><th /></tr></thead>
              <tbody>
                {sites.map((s: any) => (
                  <tr key={s.id} style={s.active && low(s.pct) ? { background: "var(--warn-bg)" } : undefined}>
                    <td>{s.title}</td><td>{s.reward}</td><td>{s.done}</td>
                    <td><span className={`pill ${low(s.pct) ? "warn" : "ok"}`}>{s.pct}%</span></td>
                    <td><span className={`pill ${s.active ? "ok" : ""}`}>{s.active ? "On" : "Off"}</span></td>
                    <td><button className="btn sec sm" onClick={() => toggleSite(s)}>{s.active ? "Turn off" : "Turn on"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

import { useCallback, useEffect, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
const when = (t: number) => (t ? new Date(t).toLocaleString() : "—");
const m2 = (n: number) => (Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Admin → Exchange: buy/sell queue + one-page user summary */
export default function AdminV27({ call }: { call: Call }) {
  const [view, setView] = useState("open");
  const [list, setList] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [sum, setSum] = useState<any>(null);
  const load = useCallback(async () => { const r = await call<any>({ action: "v27Orders", status: view }); if (r) setList(r.list); }, [call, view]);
  useEffect(() => { load(); }, [load]);
  const set = async (id: string, act: string) => {
    const note = act === "reject" ? window.prompt("Reason for the user (optional)") || "" : act === "done" ? window.prompt("Note (optional)") || "" : "";
    if (act === "done" && !window.confirm("Mark as done? For BUY orders this adds USDT to the user's balance. Only do it after you received the money.")) return;
    const r = await call<any>({ action: "v27OrderSet", id, act, note, view }, "Saved");
    if (r) setList(r.list);
  };
  const [rep, setRep] = useState<any>(null);
  const [rd, setRd] = useState("30");
  const [rt, setRt] = useState<any>(null);
  useEffect(() => { call<any>({ action: "v27Rates" }).then((r) => r && setRt(r)); }, [call]);
  const report = async () => { const r = await call<any>({ action: "v27Report", days: Number(rd) || 30 }); if (r) setRep(r.r); };
  const csv = () => {
    if (!rep) return;
    const rows = [["day", "buy_usdt", "sell_usdt", "buy_fiat", "sell_fiat", "orders"], ...rep.by_day.map((d: any) => [d.day, d.buy_usdt, d.sell_usdt, d.buy_fiat, d.sell_fiat, d.n])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" })); a.download = "exchange-report.csv"; a.click();
  };
  const find = async () => { const r = await call<any>({ action: "v27Summary", q: q.trim() }); if (r) setSum(r.s); };
  return (
    <>
      {rt && <div className="card"><div className="sub" style={{ margin: 0 }}>Rates users see now{rt.auto ? " (automatic)" : ""}: buy <b>{m2(rt.rate_buy)}</b> · sell <b>{m2(rt.rate_sell)}</b> {rt.cur}. Change them in Growth → Exchange.</div></div>}
      <div className="mhead">Exchange orders</div>
      <div className="chips" style={{ margin: "6px 0" }}>{["open", "done", "rejected", "all"].map((s) => <button key={s} className={`chip ${view === s ? "on" : ""}`} onClick={() => setView(s)}>{s}</button>)}</div>
      <div className="card">
        {!list.length && <div className="sub">No orders.</div>}
        {list.map((o) => (
          <div key={o.id} style={{ borderTop: "1px solid var(--line, #e5e7eb)", marginTop: 8, paddingTop: 8 }}>
            <div className="row"><b>{o.kind === "buy" ? "BUY" : "SELL"} {m2(o.usdt)} USDT ↔ {m2(o.fiat)} {o.cur}</b><span className="pill info">{o.st}</span></div>
            <div className="xs muted">{o.name} ({o.uid}){o.trusted ? " ⭐ trusted" : ""} · {o.mname} · rate {m2(o.rate)} · {when(o.at)}</div>
            {o.kind === "buy" && o.ref && <div className="xs">User payment ref: <b>{o.ref}</b></div>}
            {o.kind === "sell" && o.acct && <div className="xs">Pay to: <b>{o.acct}</b></div>}
            {o.kind === "buy" && o.st === "await" && <div className="xs muted">Waiting for the user to pay (until {when(o.lock_until)})</div>}
            <div className="gap" style={{ marginTop: 6 }}>
              {o.kind === "sell" && o.st === "pending" && <button className="btn sec sm" onClick={() => set(o.id, "paying")}>I am paying</button>}
              {(o.st === "pending" || o.st === "paying") && <button className="btn sm" onClick={() => set(o.id, "done")}>Mark done</button>}
              {["await", "pending", "paying"].includes(o.st) && <button className="btn danger sm" onClick={() => set(o.id, "reject")}>Reject</button>}
            </div>
          </div>
        ))}
      </div>
      <div className="mhead">Report</div>
      <div className="card">
        <div className="gap"><select value={rd} onChange={(e) => setRd(e.target.value)} style={{ width: "auto" }}><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option></select><button className="btn sm" onClick={report}>Show</button>{rep && <button className="btn sec sm" onClick={csv}>CSV</button>}</div>
        {rep && (
          <div style={{ marginTop: 10 }}>
            <div className="sumrow"><span className="muted">Completed orders</span><b>{rep.orders}</b></div>
            <div className="sumrow"><span className="muted">Bought by users</span><b className="num">{m2(rep.buy_usdt)} USDT · {m2(rep.buy_fiat)} {rep.cur}</b></div>
            <div className="sumrow"><span className="muted">Sold by users</span><b className="num">{m2(rep.sell_usdt)} USDT · {m2(rep.sell_fiat)} {rep.cur}</b></div>
            <div className="sumrow"><span className="muted">Fees collected</span><b className="num">{m2(rep.fees)} {rep.cur}</b></div>
            <div className="sumrow"><span className="muted">Average buy / sell rate</span><b className="num">{m2(rep.avg_buy_rate)} / {m2(rep.avg_sell_rate)}</b></div>
            <div className="sumrow"><span className="muted">Spread income (estimate)</span><b className="num">{m2(rep.spread_income)} {rep.cur}</b></div>
            {rep.by_method.map((x: any) => <div key={x.method} className="xs">{x.method}: {x.n} orders · {m2(x.usdt)} USDT</div>)}
          </div>
        )}
      </div>
      <div className="mhead">User summary</div>
      <div className="card">
        <div className="gap"><input style={{ flex: 1 }} placeholder="User ID or 10-letter code" value={q} onChange={(e) => setQ(e.target.value)} /><button className="btn sm" disabled={!q.trim()} onClick={find}>Open</button></div>
        {sum && (
          <div style={{ marginTop: 10 }}>
            <div className="row"><b>{sum.name} {sum.username ? `@${sum.username}` : ""}</b><span className="xs muted">{sum.id} · {sum.code}</span></div>
            <div className="xs muted">Joined {when(sum.created_at)} · last seen {when(sum.last_seen)} · invited {sum.refs}</div>
            {(sum.banned || sum.frozen) && <div className="pill warn" style={{ marginTop: 4 }}>{sum.banned ? "Banned" : "Frozen"}</div>}
            <div className="sumrow"><span className="muted">TFUEL (coins)</span><b className="num">{m2(sum.balance)}</b></div>
            <div className="sumrow"><span className="muted">USDT</span><b className="num">{m2(sum.usdt)}</b></div>
            <div className="sumrow"><span className="muted">Identity check</span><b>{sum.kyc?.status || "none"}</b></div>
            <div className="sumrow"><span className="muted">Exchange orders done / rejected</span><b>{sum.stats.done} / {sum.stats.rej}{sum.stats.trusted ? " ⭐" : ""}</b></div>
            <div className="sumrow"><span className="muted">Tickets open / all</span><b>{sum.tickets_open} / {sum.tickets}</b></div>
            <div className="title" style={{ fontSize: 14, marginTop: 8 }}>Last transfers</div>
            {sum.xfers.map((x: any, i: number) => <div key={i} className="xs">{x.d === "out" ? "→" : "←"} {x.peer} · {m2(x.amt)} {x.a === "usdt" ? "USDT" : "coins"} · {x.st} · {when(x.at)}</div>)}
            {!sum.xfers.length && <div className="xs muted">None</div>}
            <div className="title" style={{ fontSize: 14, marginTop: 8 }}>Exchange orders</div>
            {sum.xorders.map((x: any) => <div key={x.id} className="xs">{x.kind} {m2(x.usdt)} USDT · {m2(x.fiat)} {x.cur} · {x.st} · {when(x.at)}</div>)}
            {!sum.xorders.length && <div className="xs muted">None</div>}
          </div>
        )}
      </div>
    </>
  );
}

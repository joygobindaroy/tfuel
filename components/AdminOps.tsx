import { useCallback, useEffect, useMemo, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
const n2 = (v: any, d = 2) => (Number(v) || 0).toLocaleString("en-US", { maximumFractionDigits: d });
const usd = (v: any) => `$${n2(v)}`;
const when = (t?: number) => (t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const curMonth = () => new Date().toISOString().slice(0, 7);
const short = (s: string, n = 14) => (s && s.length > n + 3 ? `${s.slice(0, n)}…` : s || "—");

/** Month selector: last 18 months */
function MonthSel({ v, set }: { v: string; set: (m: string) => void }) {
  const opts = useMemo(() => {
    const o: string[] = [];
    const d = new Date();
    for (let i = 0; i < 18; i++) { o.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7)); }
    return o;
  }, []);
  return <select value={v} onChange={(e) => set(e.target.value)}>{opts.map((m) => <option key={m} value={m}>{m}</option>)}</select>;
}

function download(name: string, rows: (string | number)[][]) {
  const esc = (x: any) => { const s = String(x ?? ""); const safe = /^[=+\-@]/.test(s) && isNaN(Number(s)) ? "'" + s : s; return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe; };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function Liability({ call }: { call: Call }) {
  const [d, setD] = useState<any>(null);
  const [hold, setHold] = useState("");
  const [note, setNote] = useState("");
  const load = useCallback(async (refresh = false) => {
    const r: any = await call({ action: "opsLiability", refresh });
    if (r) { setD(r); setHold(String(r.holdings?.usdt || "")); setNote(r.holdings?.note || ""); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="card muted">Loading…</div>;
  const cov = d.coverage;
  const tone = cov == null ? "info" : cov >= 1 ? "ok" : cov >= 0.9 ? "warn" : "err";
  return (
    <>
      <div className="card">
        <div className="title">Coverage</div>
        <div className="sub">What users could claim today vs. the money you actually hold. TFUEL is valued at the current price ({d.price ? `$${d.price}` : "unknown"}{d.price_stale ? ", STALE" : ""}).</div>
        <div className="chips">
          <span className={`pill ${tone}`}>Coverage: {cov == null ? "enter holdings" : `${n2(cov * 100, 1)}%`}</span>
          {d.shortfall_usdt > 0 && <span className="pill err">Shortfall: {usd(d.shortfall_usdt)}</span>}
          {d.surplus_usdt > 0 && <span className="pill ok">Surplus: {usd(d.surplus_usdt)}</span>}
          <span className="pill info">Total liability: {usd(d.total_liability_usdt)}</span>
        </div>
        {!d.price && <div className="xs" style={{ color: "var(--err)", marginTop: 6 }}>TFUEL price is unavailable, so TFUEL amounts count as $0 and coverage is overstated.</div>}
        <div className="grid2" style={{ marginTop: 10 }}>
          <div>
            <div className="xs muted">Binance / wallet holdings (USDT value)</div>
            <input inputMode="decimal" placeholder="e.g. 12500" value={hold} onChange={(e) => setHold(e.target.value.replace(/[^\d.]/g, ""))} />
          </div>
          <div>
            <div className="xs muted">Note (optional)</div>
            <input placeholder="e.g. Binance spot + TFUEL wallet, 1 Oct" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn" onClick={async () => { const r: any = await call({ action: "opsSetHoldings", usdt: Number(hold) || 0, note }, "Holdings saved"); if (r) setD(r); }}>Save holdings</button>
          <button className="btn sec" onClick={() => load(true)}>Rescan now</button>
        </div>
        {d.holdings?.at > 0 && <div className="xs muted" style={{ marginTop: 6 }}>Last saved by {d.holdings.by || "admin"} on {when(d.holdings.at)}.</div>}
      </div>
      <div className="card">
        <div className="title">Breakdown</div>
        <table className="tbl">
          <thead><tr><th>Item</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>USDT value</th></tr></thead>
          <tbody>
            <tr><td>User USDT balances</td><td className="num" style={{ textAlign: "right" }}>{n2(d.usdt_balances)} USDT</td><td className="num b" style={{ textAlign: "right" }}>{usd(d.usdt_balances)}</td></tr>
            <tr><td>User TFUEL balances</td><td className="num" style={{ textAlign: "right" }}>{n2(d.tfuel_balances, 0)} TFUEL</td><td className="num b" style={{ textAlign: "right" }}>{usd(d.tfuel_balances_usdt)}</td></tr>
            <tr><td>Locked in stakes<div className="xs muted">Rewards still owed on them: {n2(d.stake_rewards_owed_tfuel, 0)} TFUEL (not counted)</div></td><td className="num" style={{ textAlign: "right" }}>{n2(d.locked_tfuel, 0)} TFUEL</td><td className="num b" style={{ textAlign: "right" }}>{usd(d.locked_usdt)}</td></tr>
            <tr><td>Pending USDT withdrawals ({d.pending_usdt.count})</td><td className="num" style={{ textAlign: "right" }}>{n2(d.pending_usdt.amount)} USDT</td><td className="num b" style={{ textAlign: "right" }}>{usd(d.pending_usdt.amount)}</td></tr>
            <tr><td>Pending TFUEL withdrawals ({d.pending_tfuel.count})</td><td className="num" style={{ textAlign: "right" }}>{n2(d.pending_tfuel.tfuel, 0)} TFUEL</td><td className="num b" style={{ textAlign: "right" }}>{usd(d.pending_tfuel.usdt)}</td></tr>
            <tr><td className="b">Total</td><td /><td className="num b" style={{ textAlign: "right" }}>{usd(d.total_liability_usdt)}</td></tr>
          </tbody>
        </table>
        <div className="xs muted" style={{ marginTop: 6 }}>{n2(d.users, 0)} users scanned at {when(d.scanned_at)} (cached up to 60 s). Pending withdrawals were already deducted from balances, so they are added on top.</div>
      </div>
    </>
  );
}

function Pnl({ call }: { call: Call }) {
  const [m, setM] = useState(curMonth());
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => { setD(null); setD(await call({ action: "opsPnl", month: m })); }, [call, m]);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <div className="card">
        <div className="title">Income &amp; expense</div>
        <div className="sub">All figures are <b>estimates</b> built from the counters we keep. Month figures: trading fees come from the trade log; rewards from the daily leaderboard counters (earnings only, TFUEL converted at today&apos;s price). Per-source reward, referral and prize figures are all-time because the database has no monthly split.</div>
        <div style={{ marginTop: 8 }}><MonthSel v={m} set={setM} /></div>
      </div>
      {!d ? <div className="card muted">Loading…</div> : (
        <>
          <div className="card">
            <div className="title">Profit / loss for {d.month} <span className="pill warn">estimate</span></div>
            <table className="tbl">
              <tbody>
                <tr><td>Trading fees earned ({d.income.trades} trades)</td><td className="num b" style={{ textAlign: "right", color: "var(--ok)" }}>+{usd(d.income.trading_fees_usdt)}</td></tr>
                <tr><td>Ad income<div className="xs muted">Not tracked in the database</div></td><td className="num muted" style={{ textAlign: "right" }}>n/a</td></tr>
                <tr><td>Rewards distributed ({n2(d.expense.rewards_tfuel, 0)} TFUEL, {d.expense.reward_days_found} days of data)<div className="xs muted">Includes tap, tasks, referral, prizes… A cost only once withdrawn or sold.</div></td><td className="num b" style={{ textAlign: "right", color: "var(--err)" }}>-{usd(d.expense.rewards_usdt)}</td></tr>
                <tr><td className="b">Net (estimate)</td><td className="num b" style={{ textAlign: "right", color: d.net_usdt_estimate >= 0 ? "var(--ok)" : "var(--err)" }}>{d.net_usdt_estimate >= 0 ? "+" : "-"}{usd(Math.abs(d.net_usdt_estimate))}</td></tr>
              </tbody>
            </table>
            {!d.price && <div className="xs" style={{ color: "var(--err)", marginTop: 6 }}>TFUEL price unavailable: reward value shows as $0.</div>}
          </div>
          <div className="card">
            <div className="title">All-time counters <span className="pill info">lifetime</span></div>
            <div className="chips">
              <span className="pill info">Trading fees: {usd(d.lifetime.trading_fees_usdt)}</span>
              <span className="pill info">Trade volume: {usd(d.lifetime.trade_volume_usdt)}</span>
              <span className="pill info">Send fees: {n2(d.lifetime.send_fees_tfuel, 0)} TFUEL ({usd(d.lifetime.send_fees_usdt)})</span>
              <span className="pill info">Referral paid: {n2(d.lifetime.referral_tfuel, 0)} TFUEL</span>
              <span className="pill info">Prizes: {n2(d.lifetime.prizes_tfuel, 0)} TFUEL</span>
              <span className="pill info">Deposited: {usd(d.lifetime.usdt_deposited)}</span>
              <span className="pill info">Withdrawn: {usd(d.lifetime.usdt_withdrawn)}</span>
            </div>
            <table className="tbl" style={{ marginTop: 8 }}>
              <thead><tr><th>Reward source</th><th style={{ textAlign: "right" }}>TFUEL</th><th style={{ textAlign: "right" }}>≈ USDT</th></tr></thead>
              <tbody>{d.lifetime.earn_by_source.map((r: any) => <tr key={r.source}><td>{r.source}</td><td className="num" style={{ textAlign: "right" }}>{n2(r.tfuel, 0)}</td><td className="num" style={{ textAlign: "right" }}>{usd(r.usdt)}</td></tr>)}</tbody>
            </table>
            <div className="xs muted" style={{ marginTop: 6 }}>Counters were scanned at {when(d.scanned_at)}.</div>
          </div>
        </>
      )}
    </>
  );
}

function Queue({ call }: { call: Call }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [big, setBig] = useState("500");
  const [reason, setReason] = useState("");
  const [res, setRes] = useState<any[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { const r: any = await call({ action: "opsQueue" }); if (r) { setItems(r.items); setSel({}); } }, [call]);
  useEffect(() => { load(); }, [load]);
  const key = (x: any) => `${x.kind}:${x.id}`;
  const thr = Number(big) || 0;
  const old = (x: any) => Date.now() - x.created_at > 86400000;
  const large = (x: any) => thr > 0 && x.usdt >= thr;
  const chosen = (items || []).filter((x) => sel[key(x)]);
  const total = chosen.reduce((s, x) => s + x.usdt, 0);
  const run = async (pay: boolean) => {
    if (!chosen.length) return;
    if (!pay && reason.trim().length < 3) { alert("Enter a reason for rejecting."); return; }
    if (!confirm(`${pay ? "PAY" : "REJECT"} ${chosen.length} withdrawal(s), about ${usd(total)}? ${pay ? "Make sure you have already sent the funds." : "Coins will be refunded to the users."}`)) return;
    setBusy(true);
    const r: any = await call({ action: pay ? "opsBulkPay" : "opsBulkReject", items: chosen.map((x) => ({ kind: x.kind, id: x.id })), reason }, undefined);
    setBusy(false);
    if (r) setRes(r.results);
    await load();
  };
  if (!items) return <div className="card muted">Loading…</div>;
  const selectable = items.filter((x) => !x.hold);
  return (
    <>
      <div className="card">
        <div className="title">Withdraw queue</div>
        <div className="sub">USDT and TFUEL requests together, oldest first. Orange = older than 24 h, red = on HOLD (release it in Withdrawals/USDT before paying), blue = large. Paying only marks the request paid: send the money yourself first.</div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div><div className="xs muted">Large amount from (USDT value)</div><input inputMode="decimal" value={big} onChange={(e) => setBig(e.target.value.replace(/[^\d.]/g, ""))} /></div>
          <div><div className="xs muted">Reason / note (required to reject)</div><input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Paid via Binance batch / Invalid address" /></div>
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn good sm" disabled={busy || !chosen.length} onClick={() => run(true)}>Pay selected ({chosen.length})</button>
          <button className="btn danger sm" disabled={busy || !chosen.length} onClick={() => run(false)}>Reject selected</button>
          <button className="btn ghost sm" onClick={() => setSel(Object.fromEntries(selectable.map((x) => [key(x), true])))}>Select all (no HOLD)</button>
          <button className="btn ghost sm" onClick={() => setSel({})}>Clear</button>
          <button className="btn sec sm" onClick={load}>Refresh</button>
          {chosen.length > 0 && <span className="pill info">≈ {usd(total)}</span>}
        </div>
      </div>
      {res && (
        <div className="card">
          <div className="title">Last bulk result: {res.filter((r) => r.ok).length} done, {res.filter((r) => !r.ok).length} failed</div>
          <table className="tbl"><tbody>{res.map((r, i) => <tr key={i}><td>{r.kind === "tf" ? "TFUEL" : "USDT"} · {short(r.id, 10)}</td><td>{r.ok ? <span className="pill ok">Done</span> : <span className="pill err">{r.error}</span>}</td></tr>)}</tbody></table>
        </div>
      )}
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr><th /><th>User</th><th>Network / address</th><th style={{ textAlign: "right" }}>Amount</th><th>Requested</th><th>Flags</th></tr></thead>
          <tbody>
            {items.map((x) => (
              <tr key={key(x)}>
                <td><input type="checkbox" disabled={!!x.hold} checked={!!sel[key(x)]} onChange={(e) => setSel({ ...sel, [key(x)]: e.target.checked })} /></td>
                <td>{x.name || x.uid}<div className="xs muted">ID {x.uid}</div></td>
                <td>{x.network}<div className="xs muted" style={{ wordBreak: "break-all" }}>{x.address}</div></td>
                <td className="num b" style={{ textAlign: "right" }}>{n2(x.amount, x.kind === "tf" ? 0 : 2)} {x.unit}{x.kind === "tf" && <div className="xs muted">≈ {usd(x.usdt)}</div>}{x.fee > 0 && <div className="xs muted">fee {x.fee}</div>}</td>
                <td className="xs">{when(x.created_at)}</td>
                <td>
                  {x.hold && <span className="pill err" title={x.hold}>HOLD</span>} {old(x) && <span className="pill warn">&gt; 24 h</span>} {large(x) && <span className="pill info">Large</span>}
                  {x.hold && <div className="xs muted">{x.hold}</div>}
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="muted">Nothing pending.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Recon({ call }: { call: Call }) {
  const [m, setM] = useState(curMonth());
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => { setD(null); setD(await call({ action: "opsRecon", month: m })); }, [call, m]);
  useEffect(() => { load(); }, [load]);
  const csv = () => {
    if (!d) return;
    const rows: (string | number)[][] = [["Withdrawals paid in " + d.month], ["id", "user", "network", "address", "amount", "unit", "fee", "receive", "paid_at", "txid_or_note"]];
    for (const w of d.withdrawals) rows.push([w.id, w.uid, w.network, w.address, w.amount, w.unit, w.fee, w.receive, new Date(w.paid_at).toISOString(), w.note]);
    rows.push([], ["Deposits credited in " + d.month], ["id", "user", "network", "txid", "claimed_usdt", "credited_usdt", "credited_at", "note"]);
    for (const x of d.deposits) rows.push([x.id, x.uid, x.network, x.txid, x.claimed, x.credited, new Date(x.at).toISOString(), x.note]);
    rows.push([], ["Totals"], ["USDT withdrawn (gross)", d.totals.usdt_amount], ["USDT fees", d.totals.usdt_fee], ["USDT sent to users", d.totals.usdt_receive], ["TFUEL withdrawn", d.totals.tfuel_amount], ["Deposits credited (USDT)", d.totals.deposits_credited]);
    download(`reconciliation-${d.month}.csv`, rows);
  };
  return (
    <>
      <div className="card">
        <div className="title">Month-end reconciliation</div>
        <div className="sub">Everything marked paid (by the date you pressed Pay) and every deposit credited in the month. Compare the totals with your Binance statement (UTC months).</div>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <MonthSel v={m} set={setM} />
          <button className="btn sm" disabled={!d} onClick={csv}>Download CSV</button>
        </div>
      </div>
      {!d ? <div className="card muted">Loading…</div> : (
        <>
          <div className="card">
            <div className="chips">
              <span className="pill info">USDT paid out: {n2(d.totals.usdt_receive, 4)} (gross {n2(d.totals.usdt_amount, 4)}, fees {n2(d.totals.usdt_fee, 4)})</span>
              <span className="pill info">TFUEL paid out: {n2(d.totals.tfuel_amount, 2)}</span>
              <span className="pill ok">Deposits credited: {n2(d.totals.deposits_credited, 4)} USDT</span>
            </div>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <div className="title">Paid withdrawals ({d.withdrawals.length})</div>
            <table className="tbl">
              <thead><tr><th>ID</th><th>User</th><th>Network</th><th>Address</th><th style={{ textAlign: "right" }}>Amount</th><th style={{ textAlign: "right" }}>Fee</th><th>Paid at</th><th>TxID / note</th></tr></thead>
              <tbody>
                {d.withdrawals.map((w: any) => <tr key={w.unit + w.id}><td className="xs">{short(w.id, 8)}</td><td>{w.uid}</td><td>{w.network}</td><td className="xs" title={w.address}>{short(w.address, 12)}</td><td className="num" style={{ textAlign: "right" }}>{n2(w.amount, 4)} {w.unit}</td><td className="num" style={{ textAlign: "right" }}>{w.fee ? n2(w.fee, 4) : "—"}</td><td className="xs">{when(w.paid_at)}</td><td className="xs">{w.note || "—"}</td></tr>)}
                {d.withdrawals.length === 0 && <tr><td colSpan={8} className="muted">No paid withdrawals this month.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <div className="title">Deposits credited ({d.deposits.length})</div>
            <table className="tbl">
              <thead><tr><th>ID</th><th>User</th><th>Network</th><th>TxID</th><th style={{ textAlign: "right" }}>Credited</th><th>Credited at</th></tr></thead>
              <tbody>
                {d.deposits.map((x: any) => <tr key={x.id}><td className="xs">{short(x.id, 8)}</td><td>{x.uid}</td><td>{x.network}</td><td className="xs" title={x.txid}>{short(x.txid, 14)}</td><td className="num" style={{ textAlign: "right" }}>{n2(x.credited, 4)} USDT{x.claimed !== x.credited && <div className="xs muted">claimed {n2(x.claimed, 4)}</div>}</td><td className="xs">{when(x.at)}</td></tr>)}
                {d.deposits.length === 0 && <tr><td colSpan={6} className="muted">No credited deposits this month.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

const TABS = [["liab", "Liability"], ["pnl", "Income & expense"], ["queue", "Withdraw queue"], ["recon", "Reconciliation"]] as const;

/** Admin → Money desk */
export default function OpsPage({ call }: { call: Call }) {
  const [tab, setTab] = useState<string>("liab");
  return (
    <>
      <div className="chips2">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === "liab" && <Liability call={call} />}
      {tab === "pnl" && <Pnl call={call} />}
      {tab === "queue" && <Queue call={call} />}
      {tab === "recon" && <Recon call={call} />}
    </>
  );
}

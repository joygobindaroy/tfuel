import { useEffect, useRef, useState } from "react";
import { api, errText, shareImage, loadShareFile } from "@/lib/client";
import { AmtInput, CopyBtn } from "@/components/Ui";
import { PageHead } from "@/components/Cashier";
import { xCalc, xUsdtFor } from "@/lib/xcalc";
import Icon from "@/components/Icons";
import { OrderChat } from "@/components/V31";
import { askConfirm, askText, askPin } from "@/components/Dialog";

type Say = (m: string, ok?: boolean) => void;
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/* local currency shown next to USDT (display only; set once from /api/me) */
let XL: { cur: string; rate: number } | null = null;
export const setXl = (x: any) => { XL = x && x.rate > 0 ? { cur: x.cur, rate: x.rate } : null; };
export function LocalAmt({ usdt }: { usdt: number }) {
  if (!XL || !(usdt > 0)) return null;
  return <div className="xs muted num">≈ {money(usdt * XL.rate)} {XL.cur}</div>;
}

/** One tap: share a picture to any app (preloaded so the tap works on phones) */
export function ShareImgBtn({ url, name, text, say, label = "Share", cls = "btn sec sm" }: { url: string; name: string; text?: string; say: Say; label?: string; cls?: string }) {
  const pre = useRef<File | null>(null);
  useEffect(() => { let on = true; loadShareFile(url, name).then((f) => { if (on) pre.current = f; }); return () => { on = false; }; }, [url, name]);
  return (
    <button className={cls} onClick={() => shareImage(url, name, text, pre.current).then((r) => { if (r === "saved") say("Picture saved — share it from your gallery", true); }).catch(() => say("Could not share the picture"))}>
      <Icon name="send" size={14} /> {label}
    </button>
  );
}

/** Send: last 3 different amounts */
export function AmtChips({ asset, cpt, onPick }: { asset: "tfuel" | "usdt"; cpt: number; onPick: (v: number) => void }) {
  const [a, setA] = useState<{ tfuel: number[]; usdt: number[] } | null>(null);
  useEffect(() => { api<any>("v27", { action: "amts" }).then((r) => setA(r)).catch(() => {}); }, []);
  const list = (a ? (asset === "usdt" ? a.usdt.map((x) => x / 1e6) : a.tfuel.map((x) => x / cpt)) : []).filter((x) => x > 0);
  if (!list.length) return null;
  return <div className="chips" style={{ marginTop: 6 }}><span className="xs muted" style={{ alignSelf: "center" }}>Again:</span>{list.map((v) => <button key={v} className="chip" onClick={() => onPick(v)}>{v}</button>)}</div>;
}

/** Everything still waiting, with the reason */
export function PendingPage({ say, onBack }: { say: Say; onBack: () => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api<any>("v27", { action: "hub" }).then(setD).catch((e) => say(errText(e))); }, [say]);
  return (
    <>
      <PageHead title="Pending items" onBack={onBack} />
      {!d && <div className="card"><div className="sub">Loading…</div></div>}
      {d?.blocks?.map((b: string, i: number) => <div key={i} className="banner warn"><Icon name="alert" size={18} /><span>{b}</span></div>)}
      {d && !d.items.length && !d.blocks.length && <div className="card"><div className="title">Nothing is waiting</div><div className="sub">Withdrawals, held transfers, requests, invoices and exchange orders show here while they are open.</div></div>}
      {d?.items?.map((x: any) => (
        <div key={x.k + x.id} className="card">
          <div className="row"><b>{x.title}</b><span className="xs muted">{new Date(x.at).toLocaleDateString()}</span></div>
          {x.sub && <div className="xs muted">{x.sub}</div>}
          {x.why && <div className="sub" style={{ marginTop: 6 }}><b>Why is it waiting?</b> {x.why}</div>}
        </div>
      ))}
    </>
  );
}

export function LowBalCard({ say }: { say: Say }) {
  const [l, setL] = useState<any>(null);
  const [t, setT] = useState(""), [u, setU] = useState(""), [ht, setHt] = useState(""), [hu, setHu] = useState("");
  useEffect(() => { api<any>("v27", { action: "low" }).then((r) => { setL(r.low); setT(r.low.t ? String(r.low.t) : ""); setU(r.low.u ? String(r.low.u) : ""); setHt(r.low.ht ? String(r.low.ht) : ""); setHu(r.low.hu ? String(r.low.hu) : ""); }).catch(() => {}); }, []);
  if (!l) return null;
  const save = async (on: boolean) => { try { const r = await api<any>("v27", { action: "lowSet", on, t: Number(t) || 0, u: Number(u) || 0, ht: Number(ht) || 0, hu: Number(hu) || 0 }); setL(r.low); say(on ? "Alert saved" : "Alert off", true); } catch (e) { say(errText(e)); } };
  return (
    <div className="card">
      <div className="row"><div className="title">Balance alerts</div><span className={`pill ${l.on ? "ok" : ""}`}>{l.on ? "On" : "Off"}</span></div>
      <div className="sub">Get a bot message (at most once a day) when a balance falls below — or rises above — your number.</div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <input inputMode="decimal" placeholder="TFUEL below" value={t} onChange={(e) => setT(e.target.value.replace(/[^\d.]/g, ""))} />
        <input inputMode="decimal" placeholder="USDT below" value={u} onChange={(e) => setU(e.target.value.replace(/[^\d.]/g, ""))} />
      </div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <input inputMode="decimal" placeholder="TFUEL above (withdraw reminder)" value={ht} onChange={(e) => setHt(e.target.value.replace(/[^\d.]/g, ""))} />
        <input inputMode="decimal" placeholder="USDT above" value={hu} onChange={(e) => setHu(e.target.value.replace(/[^\d.]/g, ""))} />
      </div>
      <div className="gap" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => save(true)}>Save & turn on</button>
        {l.on && <button className="btn sec sm" onClick={() => save(false)}>Turn off</button>}
      </div>
    </div>
  );
}

const Left = ({ at }: { at: number }) => {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(i); }, []);
  const s = Math.max(0, Math.floor((at - n) / 1000));
  return <b className="num">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</b>;
};

/** Exchange: calculator, buy, sell, my orders */
export function ExchangePage({ say, onBack, price, reload }: { say: Say; onBack: () => void; price: number; reload: () => void }) {
  const [v, setV] = useState<any>(null);
  const [tab, setTab] = useState<"calc" | "buy" | "sell" | "orders" | "top">("calc");
  const load = () => api<any>("v27", { action: "view" }).then(setV).catch((e) => say(errText(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line
  const c = v?.cfg;
  return (
    <>
      <PageHead title="Exchange" onBack={onBack} />
      {!v && <div className="card"><div className="sub">Loading…</div></div>}
      {c && !c.on && <div className="card"><div className="title">Exchange is off</div><div className="sub">Please check again later.</div></div>}
      {c?.on && (
        <>
          <div className="card">
            <div className="row"><div><div className="sub" style={{ margin: 0 }}>Buy 1 USDT</div><b className="num">{c.rate_buy > 0 ? `${money(c.rate_buy)} ${c.cur}` : "—"}</b></div><div style={{ textAlign: "right" }}><div className="sub" style={{ margin: 0 }}>Sell 1 USDT</div><b className="num">{c.rate_sell > 0 ? `${money(c.rate_sell)} ${c.cur}` : "—"}</b></div></div>
            {v.stats.trusted && <div className="pill ok" style={{ marginTop: 8, display: "inline-flex", gap: 4 }}><Icon name="star" size={12} /> Trusted trader</div>}
            {!v.stats.trusted && <div className="xs muted" style={{ marginTop: 6 }}>{v.stats.done} completed order{v.stats.done === 1 ? "" : "s"} — keep going to earn the Trusted badge.</div>}
            {v.daily_left !== null && <div className="xs muted">You can still exchange up to {money(v.daily_left)} USDT today{v.stats.trusted && v.daily_max > 0 ? ` (Trusted limit ${money(v.daily_max)})` : ""}.</div>}
            {v.tier?.on && <div className="xs muted" style={{ marginTop: 4 }}>{v.tier.off > 0 ? `Fee discount ${v.tier.off}% (volume ${money(v.tier.vol)} USDT). ` : `Volume ${money(v.tier.vol)} USDT. `}{v.tier.next ? `Trade ${money(Math.max(0, v.tier.next.vol - v.tier.vol))} USDT more for ${v.tier.next.off}% off.` : ""}</div>}
          </div>
          <div className="chips" style={{ margin: "8px 0" }}>
            {([["calc", "Calculator"], ["buy", "Buy"], ["sell", "Sell"], ["orders", `My orders${v.orders.length ? ` (${v.orders.length})` : ""}`], ["top", "Top traders"]] as const).map(([k, t]) => <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{t}</button>)}
          </div>
          {c.hours?.text && <div className={`banner ${c.hours.open ? "info" : "warn"}`}><Icon name="clock" size={18} /><span>{c.hours.open ? "" : "Closed right now. "}{c.hours.text}</span></div>}
          {tab === "calc" && <Calc c={c} price={price} say={say} />}
          {(tab === "buy" || tab === "sell") && <Trade key={tab} kind={tab} c={c} accts={v.accts || {}} say={say} done={() => { setTab("orders"); load(); reload(); }} />}
          {tab === "top" && <TopTab />}
          {tab === "orders" && <Orders v={v} say={say} reload={() => { load(); reload(); }} />}
          {c.terms && <div className="xs muted" style={{ marginTop: 8 }}>{c.terms}</div>}
        </>
      )}
    </>
  );
}

function Calc({ c, price, say }: { c: any; price: number; say: Say }) {
  const [kind, setKind] = useState<"buy" | "sell">("buy");
  const ms = c.methods.filter((m: any) => m.kind === "both" || m.kind === kind);
  const [mid, setMid] = useState("");
  const m = ms.find((x: any) => x.id === mid) || ms[0];
  const [usdt, setUsdt] = useState("100"), [loc, setLoc] = useState("");
  const rate = kind === "buy" ? c.rate_buy : c.rate_sell;
  const fee = m?.fee_pct || 0;
  const u = Number(usdt) || 0;
  const r = rate > 0 ? xCalc({ kind, usdt: u, rate, fee_pct: fee }) : null;
  return (
    <div className="card">
      <div className="chips"><button className={`chip ${kind === "buy" ? "on" : ""}`} onClick={() => setKind("buy")}>I want to buy</button><button className={`chip ${kind === "sell" ? "on" : ""}`} onClick={() => setKind("sell")}>I want to sell</button></div>
      {ms.length > 0 && <select style={{ marginTop: 8 }} value={m?.id} onChange={(e) => setMid(e.target.value)}>{ms.map((x: any) => <option key={x.id} value={x.id}>{x.name} · fee {x.fee_pct}%</option>)}</select>}
      <label>USDT</label>
      <AmtInput value={usdt} onChange={(x) => { setUsdt(x); setLoc(""); }} max={2} placeholder="USDT amount" />
      <label>or: {kind === "buy" ? "I will pay" : "I want to get"} ({c.cur})</label>
      <AmtInput value={loc} onChange={(x) => { setLoc(x); if (rate > 0) setUsdt(String(xUsdtFor(kind, Number(x) || 0, rate, fee) || "")); }} max={2} placeholder={c.cur} />
      {r ? (
        <div style={{ marginTop: 10 }}>
          <div className="sumrow"><span className="muted">Rate</span><b className="num">{money(rate)} {c.cur}</b></div>
          <div className="sumrow"><span className="muted">Fee ({fee}%)</span><b className="num">{money(r.fee)} {c.cur}</b></div>
          <div className="sumrow"><span className="muted">{kind === "buy" ? "You pay" : "You get"}</span><b className="num">{money(r.fiat)} {c.cur}</b></div>
          {price > 0 && u > 0 && <div className="sumrow"><span className="muted">Same value in TFUEL</span><b className="num">≈ {money(u / price)} TFUEL</b></div>}
        </div>
      ) : <div className="sub">The rate is not set yet.</div>}
      <RateAlerts kind={kind} cur={c.cur} rate={rate} say={say} />
    </div>
  );
}

/** "Tell me when the rate reaches…" */
function RateAlerts({ kind, cur, rate, say }: { kind: "buy" | "sell"; cur: string; rate: number; say: Say }) {
  const [list, setList] = useState<any[]>([]);
  const [t, setT] = useState("");
  useEffect(() => { api<any>("v30", { action: "alerts" }).then((r) => setList(r.list)).catch(() => {}); }, []);
  const add = async () => { try { const r = await api<any>("v30", { action: "alertAdd", kind, op: kind === "sell" ? "gte" : "lte", target: Number(t) }); setList(r.list); setT(""); say("Alert saved", true); } catch (e) { say(errText(e)); } };
  const del = async (id: string) => { try { setList((await api<any>("v30", { action: "alertDel", id })).list); } catch (e) { say(errText(e)); } };
  return (
    <div style={{ marginTop: 12 }}>
      <div className="b">Rate alert</div>
      <div className="xs muted">{kind === "sell" ? "Get a bot message when you can sell USDT for at least this much." : "Get a bot message when you can buy USDT for at most this much."} Now: {rate > 0 ? `${rate} ${cur}` : "—"}</div>
      <div className="gap" style={{ marginTop: 6 }}><input style={{ flex: 1 }} inputMode="decimal" placeholder={`${kind === "sell" ? "At least" : "At most"} (${cur})`} value={t} onChange={(e) => setT(e.target.value.replace(/[^\d.]/g, ""))} /><button className="btn sm" disabled={!(Number(t) > 0)} onClick={add}>Add</button></div>
      {list.map((a) => <div key={a.id} className="row xs" style={{ marginTop: 4 }}><span>{a.kind === "sell" ? "Sell" : "Buy"} {a.op === "gte" ? "≥" : "≤"} {a.target} {cur}</span><button className="btn ghost sm" onClick={() => del(a.id)}>Remove</button></div>)}
    </div>
  );
}

function TopTab() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api<any>("v30", { action: "top" }).then(setD).catch(() => {}); }, []);
  if (!d) return <div className="card"><div className="sub">Loading…</div></div>;
  return (
    <div className="card">
      <div className="title">Top traders this week</div>
      <div className="sub">By completed Exchange volume. Names are partly hidden.</div>
      {d.top.map((r: any) => <div key={r.rank} className="sumrow"><span style={{ fontWeight: r.me ? 700 : 400 }}>#{r.rank} {r.name}{r.me ? " (you)" : ""}</span><b className="num">{money(r.usdt)} USDT</b></div>)}
      {!d.top.length && <div className="xs muted">No completed orders yet this week.</div>}
      {d.me && <div className="xs" style={{ marginTop: 6 }}>Your rank: #{d.me.rank} · {money(d.me.usdt)} USDT</div>}
    </div>
  );
}

function Trade({ kind, c, accts, say, done }: { kind: "buy" | "sell"; c: any; accts: Record<string, string>; say: Say; done: () => void }) {
  const ms = c.methods.filter((m: any) => m.kind === "both" || m.kind === kind);
  const [mid, setMid] = useState(ms[0]?.id || "");
  const [usdt, setUsdt] = useState("");
  const [acct, setAcct] = useState(accts[ms[0]?.id || ""] || "");
  const [q, setQ] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const on = kind === "buy" ? c.buy_on : c.sell_on;
  const m = ms.find((x: any) => x.id === mid);
  if (!on) return <div className="card"><div className="sub">{kind === "buy" ? "Buying" : "Selling"} is paused right now.</div></div>;
  if (!ms.length) return <div className="card"><div className="sub">No payment method is available yet.</div></div>;
  const quote = async () => { setBusy(true); try { setQ((await api<any>("v27", { action: "quote", kind, method: mid, usdt: Number(usdt) })).q); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  const place = async () => { setBusy(true); try { await api<any>("v27", { action: "place", token: q.token, acct }); say("Order created", true); done(); } catch (e) { const t = errText(e); say(/quote_expired/.test(String((e as any)?.message)) ? "The locked price ended. Get a new price." : t); setQ(null); } finally { setBusy(false); } };
  return (
    <div className="card">
      <label>Payment method</label>
      <select value={mid} onChange={(e) => { setMid(e.target.value); setQ(null); if (kind === "sell") setAcct(accts[e.target.value] || ""); }}>{ms.map((x: any) => <option key={x.id} value={x.id}>{x.name} · {x.min}–{x.max} USDT · fee {x.fee_pct}%{x.open === false ? " · closed now" : ""}</option>)}</select>
      {m?.open === false && <div className="banner warn" style={{ marginTop: 6 }}><Icon name="clock" size={18} /><span>{m.h_text}</span></div>}
      <label>USDT amount</label>
      <AmtInput value={usdt} onChange={(x) => { setUsdt(x); setQ(null); }} max={2} placeholder={m ? `${m.min} – ${m.max}` : ""} />
      {kind === "sell" && <><label>Where should we pay you? (account / wallet)</label><input maxLength={120} value={acct} onChange={(e) => setAcct(e.target.value)} placeholder="e.g. bKash 01XXXXXXXXX" /></>}
      {!q && <button className="btn block" style={{ marginTop: 10 }} disabled={busy || !(Number(usdt) > 0)} onClick={quote}>Get locked price</button>}
      {q && (
        <div style={{ marginTop: 10 }}>
          <div className="sumrow"><span className="muted">Rate</span><b className="num">{money(q.rate)} {q.cur}</b></div>
          <div className="sumrow"><span className="muted">Fee{q.off > 0 ? ` (${q.off}% off)` : ""}</span><b className="num">{money(q.fee_fiat)} {q.cur}</b></div>
          <div className="sumrow"><span className="muted">{kind === "buy" ? "You pay" : "You get"}</span><b className="num">{money(q.fiat)} {q.cur}</b></div>
          <div className="xs muted" style={{ margin: "6px 0" }}>Price locked for <Left at={q.exp} />. {kind === "sell" ? "Your USDT is held when you place the order and returned if it is rejected or cancelled." : "After placing, you get the payment details and a short time to pay."}</div>
          <button className="btn block" disabled={busy || (kind === "sell" && acct.trim().length < 4)} onClick={place}>{kind === "buy" ? "Place buy order" : "Place sell order"}</button>
        </div>
      )}
    </div>
  );
}

function Orders({ v, say, reload }: { v: any; say: Say; reload: () => void }) {
  const [ref, setRef] = useState<Record<string, string>>({});
  const [qr, setQr] = useState("");
  const act = async (a: string, id: string) => { try { await api<any>("v27", { action: a, id, ref: ref[id] }); reload(); } catch (e) { say(errText(e)); } };
  if (!v.orders.length) return <div className="card"><div className="sub">No orders yet.</div></div>;
  return (
    <>
      {v.orders.map((o: any) => (
        <div key={o.id} className="card">
          <div className="row"><b>{o.kind === "buy" ? "Buy" : "Sell"} {o.usdt_u / 1e6} USDT</b><span className={`pill ${o.st === "done" ? "ok" : ["rejected", "cancelled", "expired"].includes(o.st) ? "" : "info"}`}>{o.label}</span></div>
          <div className="xs muted num">{o.kind === "buy" ? "Pay" : "Get"} {money(o.fiat)} {o.cur} · {o.mname} · rate {money(o.rate)}</div>
          <div style={{ marginTop: 8 }}>
            {o.tl.map((t: any, i: number) => <div key={i} className="xs" style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 2 }}><Icon name="check" size={12} /> <span>{t.s}</span><span className="muted">{new Date(t.at).toLocaleString()}</span></div>)}
          </div>
          {o.kind === "buy" && o.st === "await" && (
            <div style={{ marginTop: 8 }}>
              <div className="banner info"><Icon name="info" size={18} /><span style={{ whiteSpace: "pre-wrap" }}>Pay <b>{money(o.fiat)} {o.cur}</b> to:{"\n"}{o.pay || "(ask support)"}{"\n"}Time left: <Left at={o.lock_until} /></span></div>
              <div className="gap" style={{ marginTop: 6 }}>
                <CopyBtn text={o.pay || ""} label="Copy details" />
                <button className="btn sec sm" onClick={() => setQr(qr === o.id ? "" : o.id)}>{qr === o.id ? "Hide QR" : "Show QR"}</button>
              </div>
              {qr === o.id && o.pay && /* eslint-disable-next-line @next/next/no-img-element */ <img src={`/api/qr?d=${encodeURIComponent(String(o.pay).split(/\s/).find((w: string) => w.length >= 6) || o.pay)}`} alt="QR" width={200} height={200} style={{ display: "block", margin: "8px auto", borderRadius: 12 }} />}
              <input style={{ marginTop: 6 }} maxLength={80} placeholder="Your transaction ID" value={ref[o.id] || ""} onChange={(e) => setRef({ ...ref, [o.id]: e.target.value })} />
              <button className="btn block" style={{ marginTop: 6 }} disabled={(ref[o.id] || "").trim().length < 4} onClick={() => act("proof", o.id)}>I have paid</button>
            </div>
          )}
          <OrderChat id={o.id} say={say} />
          {o.st !== "await" && <button className="btn sec sm" style={{ marginTop: 8, marginRight: 8 }} onClick={async () => { const t = await askText("What is the problem?", { text: "Support will see this order too.", ok: "Send" }); if (t === null) return; try { await api<any>("v27", { action: "dispute", id: o.id, text: t }); say("Reported. Support will reply in your tickets.", true); reload(); } catch (e) { say(errText(e)); } }}>Report a problem</button>}
          {(o.st === "await" || o.st === "pending") && <button className="btn danger sm" style={{ marginTop: 8 }} onClick={() => act("cancel", o.id)}>Cancel order</button>}
          {o.st === "done" && o.img && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.img} alt="" loading="lazy" style={{ width: "100%", borderRadius: 14, marginTop: 8 }} />
              <div style={{ marginTop: 8 }}><ShareImgBtn url={o.img} name={`exchange-${o.id.slice(-6)}.png`} text="My TFUEL exchange" say={say} label="Share receipt" /></div>
            </>
          )}
        </div>
      ))}
    </>
  );
}

const NAMES: Record<string, string> = { send: "Sent to people", receive: "Received from people", deposit: "Deposits", withdraw: "Withdrawals", usdt_withdraw: "USDT withdrawals", shop: "Shop", buy: "Buy", sell: "Sell", adjust: "Adjustments", game: "Games", task: "Tasks", daily: "Daily", spin: "Spin", referral: "Referrals" };
/** Where the money went / came from in the last N days */
export function SpendingCard({ cpt }: { cpt: number }) {
  const [d, setD] = useState<any>(null);
  const [days, setDays] = useState(30);
  useEffect(() => { setD(null); api<any>("v27", { action: "spend", days }).then(setD).catch(() => {}); }, [days]);
  const max = d ? Math.max(1, ...d.list.map((x: any) => Math.max(x.tfuel_out, x.tfuel_in))) : 1;
  return (
    <div className="card">
      <div className="row"><div className="title">Money summary</div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: "auto" }}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></div>
      {!d && <div className="sub">Loading…</div>}
      {d && (
        <>
          <div className="grid2" style={{ marginTop: 6 }}>
            <div><div className="xs muted">TFUEL in / out</div><b className="num">+{money(d.total.tfuel_in)} / −{money(d.total.tfuel_out)}</b></div>
            <div><div className="xs muted">USDT in / out</div><b className="num">+{money(d.total.usdt_in)} / −{money(d.total.usdt_out)}</b></div>
          </div>
          {d.list.map((x: any) => (
            <div key={x.t} style={{ marginTop: 8 }}>
              <div className="row xs"><span>{NAMES[x.t] || x.t} · {x.n}×</span><span className="num">{x.tfuel_out ? `−${money(x.tfuel_out)} TFUEL ` : ""}{x.tfuel_in ? `+${money(x.tfuel_in)} TFUEL ` : ""}{x.usdt_out ? `−${money(x.usdt_out)} USDT ` : ""}{x.usdt_in ? `+${money(x.usdt_in)} USDT` : ""}</span></div>
              {(x.tfuel_out > 0 || x.tfuel_in > 0) && <div style={{ height: 6, borderRadius: 3, background: "var(--soft, #eee)", overflow: "hidden" }}><div style={{ width: `${Math.max(4, (Math.max(x.tfuel_out, x.tfuel_in) / max) * 100)}%`, height: "100%", background: x.tfuel_out >= x.tfuel_in ? "#e5484d" : "#30a46c" }} /></div>}
            </div>
          ))}
          {d.tags?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div className="b">By your tags</div>
              {d.tags.map((x: any) => <div key={x.tag} className="sumrow"><span>{x.tag} · {x.n}×</span><b className="num">{x.tfuel ? `${x.tfuel > 0 ? "+" : "−"}${money(Math.abs(x.tfuel))} TFUEL ` : ""}{x.usdt ? `${x.usdt > 0 ? "+" : "−"}${money(Math.abs(x.usdt))} USDT` : ""}</b></div>)}
            </div>
          )}
          {!d.list.length && <div className="sub">No activity in this time.</div>}
        </>
      )}
    </div>
  );
}

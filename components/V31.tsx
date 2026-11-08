import { useEffect, useState } from "react";
import { api, errText } from "@/lib/client";
import { PageHead } from "@/components/Cashier";
import { ShareImgBtn } from "@/components/V27";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Chat with support inside one exchange order */
export function OrderChat({ id, say }: { id: string; say: Say }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api<any>("v31", { action: "chat", id }).then((r) => setMsgs(r.msgs)).catch((e) => say(errText(e)));
  useEffect(() => { if (open) load(); }, [open]); // eslint-disable-line
  const send = async () => { setBusy(true); try { const r = await api<any>("v31", { action: "chatSend", id, text: t }); setMsgs(r.msgs); setT(""); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  if (!open) return <button className="btn sec sm" style={{ marginTop: 8, marginRight: 8 }} onClick={() => setOpen(true)}><Icon name="megaphone" size={14} /> Message support</button>;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="row"><b className="xs">Messages about this order</b><button className="btn sec sm" onClick={() => setOpen(false)}>Hide</button></div>
      {msgs.length === 0 && <div className="xs muted" style={{ margin: "6px 0" }}>No messages yet. Write here for a payment note, a screenshot link or a question.</div>}
      {msgs.map((m, i) => <div key={i} className="xs" style={{ margin: "6px 0", textAlign: m.f === "u" ? "right" : "left" }}><span className={`pill ${m.f === "a" ? "ok" : "info"}`} style={{ whiteSpace: "pre-wrap", display: "inline-block", maxWidth: "88%", textAlign: "left" }}>{m.t}</span><div className="muted" style={{ fontSize: 10 }}>{m.f === "a" ? "Support" : "You"} · {new Date(m.at).toLocaleString()}</div></div>)}
      <div style={{ display: "flex", gap: 8 }}>
        <input style={{ flex: 1 }} maxLength={300} placeholder="Write a message" value={t} onChange={(e) => setT(e.target.value)} />
        <button className="btn sm" disabled={busy || !t.trim()} onClick={send}>Send</button>
      </div>
    </div>
  );
}

/** Customer side of Shops: everything I paid to shops, with receipts */
export function PurchasesPage({ say, onBack }: { say: Say; onBack: () => void }) {
  const [r, setR] = useState<any>(null);
  useEffect(() => { api<any>("v31", { action: "purchases" }).then(setR).catch((e) => say(errText(e))); }, []); // eslint-disable-line
  return (
    <>
      <PageHead title="My purchases" onBack={onBack} />
      {!r && <div className="card"><div className="sub">Loading…</div></div>}
      {r && (
        <>
          <div className="card"><div className="sub" style={{ margin: 0 }}>Total paid to shops</div><b className="num">{money(r.total.tfuel)} TFUEL{r.total.usdt > 0 ? ` · ${money(r.total.usdt)} USDT` : ""}</b></div>
          {r.list.length === 0 && <div className="card"><div className="sub">Nothing yet. When you pay a shop with its link, it appears here.</div></div>}
          {r.list.map((p: any) => (
            <div key={p.id} className="card">
              <div className="row"><b>{p.shop}</b><b className="num">{p.a === "usdt" ? `${money(p.amt / 1e6)} USDT` : `${money(p.amt / (r.cpt || 1000))} TFUEL`}</b></div>
              <div className="xs muted">{new Date(p.at).toLocaleString()}{p.note ? ` · ${p.note}` : ""}</div>
              {p.url && <a className="btn sec sm" style={{ marginTop: 8, display: "inline-flex" }} href={p.url} target="_blank" rel="noreferrer"><Icon name="receipt" size={14} /> Receipt</a>}
            </div>
          ))}
        </>
      )}
    </>
  );
}

/** Send page: the people I pay most */
export function QuickSend({ onPick }: { onPick: (code: string) => void }) {
  const [l, setL] = useState<any[]>([]);
  useEffect(() => { api<any>("v31", { action: "quick" }).then((r) => setL(r.list || [])).catch(() => {}); }, []);
  if (!l.length) return null;
  return (
    <div style={{ margin: "4px 0 8px" }}>
      <div className="xs muted">Quick send</div>
      <div className="chips">{l.map((x) => <button key={x.code} type="button" className="chip" onClick={() => onPick(x.code)}>{x.name || x.code}</button>)}</div>
    </div>
  );
}

/** Settings: monthly recap picture + weekly digest switch */
export function RecapCard({ say }: { say: Say }) {
  const [which, setWhich] = useState<"cur" | "prev">("prev");
  const [r, setR] = useState<any>(null);
  const [dg, setDg] = useState(false);
  useEffect(() => { setR(null); api<any>("v31", { action: "recap", which }).then((x) => setR(x.r)).catch(() => {}); }, [which]);
  useEffect(() => { api<any>("v31", { action: "digest" }).then((x) => setDg(!!x.on)).catch(() => {}); }, []);
  const tog = async () => { try { const x = await api<any>("v31", { action: "digestSet", on: !dg }); setDg(!!x.on); say(x.on ? "Weekly digest is on" : "Weekly digest is off", true); } catch (e) { say(errText(e)); } };
  return (
    <div className="card">
      <div className="title">My month</div>
      <div className="chips" style={{ margin: "6px 0" }}>{([["prev", "Last month"], ["cur", "This month"]] as const).map(([k, t]) => <button key={k} className={`chip ${which === k ? "on" : ""}`} onClick={() => setWhich(k)}>{t}</button>)}</div>
      {!r && <div className="sub">Loading…</div>}
      {r && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.img} alt="" loading="lazy" style={{ width: "100%", borderRadius: 14 }} />
          <div className="xs muted" style={{ margin: "6px 0" }}>{r.label}: sent {r.out.n} · received {r.in.n}{r.top ? ` · most paid: ${r.top.name}` : ""}{r.ex.n ? ` · ${r.ex.n} exchanges` : ""}</div>
          <ShareImgBtn url={r.img} name={`my-month.png`} text="My month on TFUEL" say={say} label="Share my month" />
        </>
      )}
      <div className="row" style={{ marginTop: 10 }}><div><b>Weekly digest</b><div className="xs muted">One short bot message every Monday.</div></div><button className={`chip ${dg ? "on" : ""}`} onClick={tog}>{dg ? "On" : "Off"}</button></div>
    </div>
  );
}

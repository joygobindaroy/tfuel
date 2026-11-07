import { useEffect, useState } from "react";
import { api, errText, openTgLink } from "@/lib/client";
import { CopyBtn, confetti } from "@/components/Ui";
import { PageHead } from "@/components/Cashier";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;
const fmt = (asset: string, amt: number, cpt: number) => (asset === "usdt" ? `${(amt / 1e6).toFixed(2)} USDT` : `${(amt / cpt).toLocaleString("en-US", { maximumFractionDigits: 2 })} TFUEL`);

/** Red packet: create, share, list; and the page for someone who opens a link */
export function PacketPage({ say, onBack, cpt, reload }: { say: Say; onBack: () => void; cpt: number; reload: () => void }) {
  const [f, setF] = useState({ asset: "tfuel", amount: "", n: "5", mode: "random", note: "", hours: "24" });
  const [made, setMade] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>("v30", { action: "pkList" }).then((r) => setList(r.list)).catch(() => {}); }, []);
  const create = async () => {
    const pin = window.prompt("Enter your PIN to confirm (leave empty if you have no PIN)");
    if (pin === null) return;
    setBusy(true);
    try { const r = await api<any>("v30", { action: "pkNew", ...f, amount: Number(f.amount), n: Number(f.n), hours: Number(f.hours), pin }); setMade(r.p); setList(r.list); setF({ ...f, amount: "" }); reload(); } catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  const close = async (tok: string) => { if (!window.confirm("Close this red packet and get the unopened money back?")) return; try { const r = await api<any>("v30", { action: "pkClose", tok }); setList(r.list); say("Closed", true); reload(); } catch (e) { say(errText(e)); } };
  const share = (url: string) => openTgLink(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("🧧 I sent a red packet! Open it before it's gone")}`);
  return (
    <>
      <PageHead title="Red packet" onBack={onBack} />
      <div className="card">
        <div className="sub">Put one amount in a packet for several people. Each friend who opens it gets a share (random or equal). Unopened money comes back to you when it expires. A normal send fee applies.</div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <select value={f.asset} onChange={(e) => setF({ ...f, asset: e.target.value })}><option value="tfuel">TFUEL</option><option value="usdt">USDT</option></select>
          <input inputMode="decimal" placeholder="Total amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} />
          <input inputMode="numeric" placeholder="People" value={f.n} onChange={(e) => setF({ ...f, n: e.target.value.replace(/\D/g, "") })} />
          <select value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })}><option value="6">Open 6 h</option><option value="24">Open 24 h</option><option value="48">Open 48 h</option></select>
        </div>
        <div className="chips" style={{ marginTop: 8 }}><button className={`chip ${f.mode === "random" ? "on" : ""}`} onClick={() => setF({ ...f, mode: "random" })}>Random shares</button><button className={`chip ${f.mode === "equal" ? "on" : ""}`} onClick={() => setF({ ...f, mode: "equal" })}>Equal shares</button></div>
        <input maxLength={60} placeholder="Message (e.g. Eid Mubarak!)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} style={{ marginTop: 8 }} />
        <button className="btn block" style={{ marginTop: 8 }} disabled={busy || !(Number(f.amount) > 0) || !(Number(f.n) >= 2)} onClick={create}><Icon name="gift" size={15} /> Create red packet</button>
      </div>
      {made && (
        <div className="card">
          <div className="title">Your red packet is ready</div>
          <div className="sub">Share this link. It works until {new Date(made.exp).toLocaleString()}.</div>
          <div className="gap" style={{ marginTop: 8 }}><CopyBtn text={made.url} label="Copy link" /><button className="btn sm" onClick={() => share(made.url)}><Icon name="send" size={14} /> Share in Telegram</button></div>
        </div>
      )}
      {list.length > 0 && (
        <div className="card">
          <div className="title">Your packets</div>
          {list.map((r) => (
            <div key={r.tok} className="row" style={{ marginTop: 8 }}>
              <div><b>{fmt(r.asset, r.total, cpt)}</b> · {r.n} people<div className="xs muted">{r.note || "—"} · {r.st}</div></div>
              {r.st === "open" && <div className="gap"><button className="btn sec sm" onClick={() => share(`${made?.url?.split("?")[0] || ""}?startapp=rp_${r.tok}`)}>Share</button><button className="btn ghost sm" onClick={() => close(r.tok)}>Close</button></div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Opened from a link: see the packet and take your share */
export function PacketSheet({ tok, say, onClose, reload, cpt }: { tok: string; say: Say; onClose: () => void; reload: () => void; cpt: number }) {
  const [p, setP] = useState<any>(null);
  const [err, setErr] = useState("");
  const [got, setGot] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>("v30", { action: "pkPeek", tok }).then((r) => setP(r.p)).catch((e) => setErr(errText(e))); }, [tok]);
  const open = async () => { setBusy(true); try { const r = await api<any>("v30", { action: "pkClaim", tok }); setGot(r); setP(r.packet); confetti(40); reload(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); } };
  return (
    <div className="sheet-bg" onClick={() => !busy && onClose()}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {err && <div className="banner err"><Icon name="alert" size={18} /><span>{err}</span></div>}
        {p && (
          <>
            <div style={{ textAlign: "center" }}>
              <div className="ico gold" style={{ margin: "0 auto 8px", width: 52, height: 52 }}><Icon name="gift" size={26} /></div>
              <div className="title" style={{ fontSize: 18 }}>{p.from} sent a red packet</div>
              {p.note && <div className="sub">“{p.note}”</div>}
              {got ? <div className="num" style={{ fontSize: 30, fontWeight: 800, margin: "8px 0" }}>+{fmt(got.asset, got.amt, cpt)}</div> : <div className="sub" style={{ marginTop: 6 }}>{p.left} of {p.n} shares left</div>}
            </div>
            {p.claims.length > 0 && <div style={{ marginTop: 8 }}>{p.claims.map((c: any, i: number) => <div key={i} className="sumrow"><span>{c.who}</span><b className="num">{fmt(p.asset, c.amt, cpt)}</b></div>)}</div>}
            {!got && p.st === "open" && !p.mine && <button className="btn block" style={{ marginTop: 10 }} disabled={busy} onClick={open}>Open packet</button>}
            {!got && p.mine && <div className="sub" style={{ textAlign: "center" }}>You already took {fmt(p.asset, p.mine.amt, cpt)}.</div>}
            {!got && p.st !== "open" && <div className="sub" style={{ textAlign: "center" }}>This red packet is finished.</div>}
          </>
        )}
        <button className="btn sec block" style={{ marginTop: 10 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** Customer side in Send: shop items + coupon */
export function ShopPicker({ merchant, setAmt, setNote }: { merchant: string; setAmt: (v: string) => void; setNote: (v: string) => void }) {
  const [d, setD] = useState<any>(null);
  const [base, setBase] = useState(0);
  const [item, setItem] = useState("");
  const [code, setCode] = useState("");
  const [cp, setCp] = useState<{ code: string; pct: number } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { api<any>("v24", { action: "pub", code: merchant }).then((r) => { setD(r); if (r.amt) setBase(r.amt); }).catch(() => {}); }, [merchant]);
  const apply = (b: number, it: string, c: { code: string; pct: number } | null) => {
    if (b > 0) setAmt(String(Math.round(b * (1 - (c?.pct || 0) / 100) * 1e6) / 1e6));
    setNote([it, c ? `CPN:${c.code}` : ""].filter(Boolean).join(" ").slice(0, 60));
  };
  if (!d || (!d.items?.length && !d.coupons)) return null;
  return (
    <div className="card">
      {d.items?.length > 0 && (
        <>
          <div className="b">Pick what you buy</div>
          <div className="chips" style={{ marginTop: 6 }}>{d.items.map((x: any) => <button key={x.name} className={`chip ${item === x.name ? "on" : ""}`} onClick={() => { setItem(x.name); setBase(x.price); apply(x.price, x.name, cp); }}>{x.name} · {x.price}</button>)}</div>
        </>
      )}
      {d.coupons && (
        <div className="gap" style={{ marginTop: 8 }}>
          <input style={{ flex: 1 }} placeholder="Coupon code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <button className="btn sec sm" disabled={code.trim().length < 3} onClick={async () => { setErr(""); try { const r = await api<any>("v30", { action: "cpn", code: merchant, cpn: code }); setCp(r); apply(base, item, r); } catch (e) { setCp(null); setErr(errText(e)); } }}>Apply</button>
        </div>
      )}
      {cp && <div className="xs" style={{ marginTop: 4 }}>Coupon {cp.code}: {cp.pct}% off{base ? "" : " — pick an item or type the price first, then apply again"}</div>}
      {err && <div className="xs" style={{ color: "var(--danger, #e5484d)" }}>{err}</div>}
    </div>
  );
}

/** Shop owner: items and coupons */
export function CatalogEditor({ say }: { say: Say }) {
  const [d, setD] = useState<{ items: any[]; coupons: any[] } | null>(null);
  const [off, setOff] = useState(false);
  useEffect(() => { api<any>("v30", { action: "catGet" }).then((r) => setD({ items: r.items, coupons: r.coupons })).catch(() => setOff(true)); }, []);
  if (off || !d) return null;
  const save = async () => { try { const r = await api<any>("v30", { action: "catSet", items: d.items, coupons: d.coupons }); setD({ items: r.items, coupons: r.coupons }); say("Saved", true); } catch (e) { say(errText(e)); } };
  const up = (k: "items" | "coupons", i: number, p: any) => setD({ ...d, [k]: d[k].map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <div className="card">
      <div className="title">Shop items & coupons</div>
      <div className="sub">Customers can pick an item (price fills in) and enter a coupon. A used coupon is marked on the sale. Your shop must be saved first.</div>
      {d.items.map((x, i) => (
        <div key={i} className="gap" style={{ marginTop: 6 }}>
          <input style={{ flex: 2 }} maxLength={30} placeholder="Item" value={x.name} onChange={(e) => up("items", i, { name: e.target.value })} />
          <input style={{ flex: 1 }} inputMode="decimal" placeholder="Price" value={x.price || ""} onChange={(e) => up("items", i, { price: e.target.value.replace(/[^\d.]/g, "") })} />
          <button className="btn ghost sm" onClick={() => setD({ ...d, items: d.items.filter((_, j) => j !== i) })}>✕</button>
        </div>
      ))}
      {d.items.length < 12 && <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => setD({ ...d, items: [...d.items, { name: "", price: "" }] })}>+ Item</button>}
      <div className="b" style={{ marginTop: 12 }}>Coupons</div>
      {d.coupons.map((x, i) => (
        <div key={i} className="gap" style={{ marginTop: 6 }}>
          <input style={{ flex: 2 }} maxLength={10} placeholder="CODE" value={x.code} onChange={(e) => up("coupons", i, { code: e.target.value.toUpperCase() })} />
          <input style={{ flex: 1 }} inputMode="numeric" placeholder="% off" value={x.pct || ""} onChange={(e) => up("coupons", i, { pct: e.target.value.replace(/\D/g, "") })} />
          <input style={{ flex: 1 }} inputMode="numeric" placeholder="Uses (0=∞)" value={x.uses || ""} onChange={(e) => up("coupons", i, { uses: e.target.value.replace(/\D/g, "") })} />
          <button className="btn ghost sm" onClick={() => setD({ ...d, coupons: d.coupons.filter((_, j) => j !== i) })}>✕</button>
          {x.used > 0 && <span className="xs muted">{x.used} used</span>}
        </div>
      ))}
      {d.coupons.length < 8 && <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => setD({ ...d, coupons: [...d.coupons, { code: "", pct: "", uses: "" }] })}>+ Coupon</button>}
      <button className="btn block" style={{ marginTop: 10 }} onClick={save}>Save</button>
    </div>
  );
}

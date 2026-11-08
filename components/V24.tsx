import { useEffect, useState } from "react";
import { api, errText, saveImage, fmtTf } from "@/lib/client";
import { CopyBtn } from "@/components/Ui";
import { ShareImgBtn } from "@/components/V27";
import Icon from "@/components/Icons";
import { askConfirm, askText, askPin } from "@/components/Dialog";

type Say = (m: string, ok?: boolean) => void;

/** Settings: accept payments with a permanent QR */
export function MerchantCard({ say, cpt }: { say: Say; cpt: number }) {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ name: "", amt: "", asset: "tfuel", on: false });
  const [qr, setQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const fill = (r: any) => { setD(r); if (r.m) setF({ name: r.m.name, amt: r.m.amt ? String(r.m.amt) : "", asset: r.m.asset, on: r.m.on }); };
  useEffect(() => { api<any>("v24", { action: "me" }).then(fill).catch(() => setOff(true)); }, []);
  if (off || !d) return null;
  const save = async (patch: Partial<typeof f> = {}) => {
    const n = { ...f, ...patch };
    setBusy(true);
    try { const r = await api<any>("v24", { action: "set", name: n.name, amt: Number(n.amt) || 0, asset: n.asset, on: n.on }); fill(r); say("Saved", true); } catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  const live = d.m?.on && d.link;
  return (
    <div className="card">
      <div className="title">Accept payments (Merchant QR)</div>
      <div className="sub">Customers scan your QR, pay in the app, and you get a sales list. Normal send fees apply.</div>
      <input maxLength={30} placeholder="Shop name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} style={{ marginTop: 8 }} />
      <div className="grid2" style={{ marginTop: 8 }}>
        <div><label>Fixed price (optional)</label><input inputMode="decimal" placeholder="Customer types it" value={f.amt} onChange={(e) => setF({ ...f, amt: e.target.value })} /></div>
        <div><label>Coin</label><select value={f.asset} onChange={(e) => setF({ ...f, asset: e.target.value })}><option value="tfuel">TFUEL</option><option value="usdt">USDT</option></select></div>
      </div>
      <div className="row" style={{ marginTop: 10 }}><div className="b">Open for payments</div><button type="button" aria-label="Open for payments" className={`switch ${f.on ? "on" : ""}`} disabled={busy || f.name.trim().length < 2} onClick={() => { const on = !f.on; setF({ ...f, on }); save({ on }); }} /></div>
      <button className="btn sec block" style={{ marginTop: 10 }} disabled={busy || f.name.trim().length < 2} onClick={() => save()}>Save</button>
      {live && (
        <>
          <div className="grid2" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => setQr(true)}><Icon name="image" size={16} /> Show QR poster</button>
            <button className="btn sec" onClick={() => saveImage(d.poster ? `${d.poster}&t=dark` : `/api/qr?d=${encodeURIComponent(d.link)}`, "shop-qr.png").then(() => say("Saving your QR poster…", true)).catch(() => say("Could not save. Open the QR poster and long-press the picture."))}><Icon name="download" size={16} /> Save QR</button>
          </div>
          <div className="row" style={{ marginTop: 8, gap: 8 }}><span className="xs" style={{ wordBreak: "break-all", flex: 1 }}>{d.link}</span><CopyBtn text={d.link} /></div>
        </>
      )}
      {d.m && (
        <div style={{ marginTop: 12 }}>
          <div className="b">Sales</div>
          <div className="xs muted">Today: {d.sales.today.n} · {fmtTf(d.sales.today.tfuel, cpt)} TFUEL · {(d.sales.today.usdt / 1e6).toFixed(2)} USDT</div>
          <div className="xs muted">All time: {d.sales.all.n} · {fmtTf(d.sales.all.tfuel, cpt)} TFUEL · {(d.sales.all.usdt / 1e6).toFixed(2)} USDT</div>
          {d.sales.list.map((s: any, i: number) => (
            <div key={s.id || i} className="row xs" style={{ marginTop: 6 }}>
              <span>{s.who} · {new Date(s.at).toLocaleString()}{s.n ? ` · ${s.n}` : ""}{s.rf ? " · refunded" : ""}{s.cpn ? ` · coupon ${s.cpn}` : ""}</span>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <b className="num">{s.a === "usdt" ? (s.amt / 1e6).toFixed(2) + " USDT" : fmtTf(s.amt, cpt) + " TFUEL"}</b>
                {s.refundable && <button className="btn sec sm" onClick={async () => {
                  if (!(await askConfirm("Send this payment back?", { text: "A normal send fee applies to you.", ok: "Refund" }))) return;
                  const pin = await askPin("Enter your PIN to confirm");
                  if (pin === null) return;
                  try { await api<any>("v27", { action: "refund", id: s.id, pin }); say("Refunded", true); const r = await api<any>("v24", { action: "me" }); fill(r); } catch (e) { say(errText(e)); }
                }}>Refund</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {qr && d.link && <PosterSheet d={d} say={say} onClose={() => setQr(false)} />}
    </div>
  );
}

const LOOKS: [string, string][] = [["dark", "Dark"], ["light", "Light"], ["neon", "Neon"], ["gold", "Gold"]];
/** Styled payment poster: pick a look, save or share the picture */
function PosterSheet({ d, say, onClose }: { d: any; say: Say; onClose: () => void }) {
  const [look, setLook] = useState("dark");
  const url = d.poster ? `${d.poster}&t=${look}` : `/api/qr?d=${encodeURIComponent(d.link)}`;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", maxHeight: "92vh", overflowY: "auto" }}>
        <div className="title" style={{ fontSize: 18 }}>Your payment QR</div>
        <div className="chips" style={{ justifyContent: "center", margin: "8px 0" }}>{LOOKS.map(([k, t]) => <button key={k} type="button" className={`chip ${look === k ? "on" : ""}`} onClick={() => setLook(k)}>{t}</button>)}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={url} src={url} alt="Shop payment QR" style={{ width: "100%", maxWidth: 300, borderRadius: 14, display: "block", margin: "0 auto" }} />
        <div className="grid2" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => saveImage(url, `shop-qr-${look}.png`).then(() => say("Saving…", true)).catch(() => say("Could not save. Long-press the picture to save it."))}><Icon name="download" size={16} /> Save</button>
          <ShareImgBtn url={url} name={`shop-qr-${look}.png`} text="Pay me with TFUEL" say={say} label="Share" cls="btn sec" />
        </div>
        <button className="btn sec block" style={{ marginTop: 8 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

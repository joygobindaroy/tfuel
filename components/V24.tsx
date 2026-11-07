import { useEffect, useState } from "react";
import { api, errText, saveImage, fmtTf } from "@/lib/client";
import { CopyBtn } from "@/components/Ui";
import { QrSheet } from "@/components/V22";
import Icon from "@/components/Icons";

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
            <button className="btn" onClick={() => setQr(true)}><Icon name="image" size={16} /> Show QR</button>
            <button className="btn sec" onClick={() => saveImage(`/api/qr?d=${encodeURIComponent(d.link)}`, "shop-qr.png")}><Icon name="download" size={16} /> Save QR</button>
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
                  if (!window.confirm("Send this payment back to the customer? A normal send fee applies to you.")) return;
                  const pin = window.prompt("Enter your PIN to confirm (leave empty if you have no PIN)");
                  if (pin === null) return;
                  try { await api<any>("v27", { action: "refund", id: s.id, pin }); say("Refunded", true); const r = await api<any>("v24", { action: "me" }); fill(r); } catch (e) { say(errText(e)); }
                }}>Refund</button>}
              </span>
            </div>
          ))}
        </div>
      )}
      {qr && d.link && <QrSheet link={d.link} onClose={() => setQr(false)} />}
    </div>
  );
}

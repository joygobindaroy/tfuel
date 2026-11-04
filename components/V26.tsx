import { useEffect, useState } from "react";
import { api, errText, fmtTf } from "@/lib/client";
import { CopyBtn } from "@/components/Ui";
import { QrSheet } from "@/components/V22";
import { applyTheme } from "@/lib/theme";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;

/** Settings: make a payment link for something (invoice) and see if it was paid */
export function InvoicesCard({ say, cpt }: { say: Say; cpt: number }) {
  const [list, setList] = useState<any[]>([]);
  const [f, setF] = useState({ title: "", amt: "", asset: "tfuel", days: "14" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState("");
  useEffect(() => { api<any>("v26", { action: "invList" }).then((r) => setList(r.list || [])).catch(() => {}); }, []);
  const make = async () => { setBusy(true); try { const r = await api<any>("v26", { action: "invNew", title: f.title, amt: Number(f.amt), asset: f.asset, days: Number(f.days) }); setList(r.list); setOpen(false); setF({ ...f, title: "", amt: "" }); say("Invoice link ready", true); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  const cancel = async (id: string) => { try { const r = await api<any>("v26", { action: "invCancel", id }); setList(r.list); } catch (e) { say(errText(e)); } };
  const pill = (s: string) => <span className={`pill ${s === "paid" ? "ok" : s === "open" ? "info" : ""}`}>{s}</span>;
  return (
    <div className="card">
      <div className="row"><div className="title">Invoices</div><button className="btn sec sm" onClick={() => setOpen(!open)}>{open ? "Close" : "New invoice"}</button></div>
      <div className="sub">Ask for a payment with a reason. The link opens Send with everything filled in; when it is paid you get a message.</div>
      {open && (
        <div style={{ marginTop: 8 }}>
          <input maxLength={60} placeholder="What is it for? (e.g. Logo design)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="grid2" style={{ marginTop: 8 }}>
            <input inputMode="decimal" placeholder="Amount" value={f.amt} onChange={(e) => setF({ ...f, amt: e.target.value })} />
            <select value={f.asset} onChange={(e) => setF({ ...f, asset: e.target.value })}><option value="tfuel">TFUEL</option><option value="usdt">USDT</option></select>
          </div>
          <label style={{ marginTop: 8 }}>Valid for (days)</label>
          <input inputMode="numeric" value={f.days} onChange={(e) => setF({ ...f, days: e.target.value.replace(/\D/g, "") })} />
          <button className="btn block" style={{ marginTop: 8 }} disabled={busy || f.title.trim().length < 2 || !(Number(f.amt) > 0)} onClick={make}>Create link</button>
        </div>
      )}
      {list.map((x) => (
        <div key={x.id} style={{ borderTop: "1px solid var(--line, #e5e7eb)", marginTop: 10, paddingTop: 8 }}>
          <div className="row"><b>{x.title}</b>{pill(x.st)}</div>
          <div className="xs muted">{x.asset === "usdt" ? `${x.amt} USDT` : `${x.amt} TFUEL`} · {new Date(x.at).toLocaleDateString()}{x.paid ? ` · paid by ${x.paid.by}` : ""}</div>
          {x.st === "open" && x.link && (
            <div className="gap" style={{ marginTop: 6 }}>
              <CopyBtn text={x.link} label="Copy link" />
              <button className="btn sec sm" onClick={() => setQr(x.link)}>QR</button>
              <button className="btn danger sm" onClick={() => cancel(x.id)}>Cancel</button>
            </div>
          )}
        </div>
      ))}
      {qr && <QrSheet link={qr} onClose={() => setQr("")} />}
    </div>
  );
}

/** Settings: a small "support me" page with a goal */
export function TipPageCard({ say }: { say: Say }) {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState({ title: "", goal: "", on: false });
  const fill = (r: any) => { setD(r); setF({ title: r.t.title, goal: r.t.goal ? String(r.t.goal) : "", on: r.t.on }); };
  useEffect(() => { api<any>("v26", { action: "tipp" }).then(fill).catch(() => {}); }, []);
  if (!d) return null;
  const save = async (patch: any = {}) => { const n = { ...f, ...patch }; try { fill(await api<any>("v26", { action: "tippSet", ...n, goal: Number(n.goal) || 0 })); say("Saved", true); } catch (e) { say(errText(e)); } };
  return (
    <div className="card">
      <div className="title">Support page</div>
      <div className="sub">A link where people can send you tips. Shows your goal and the latest supporters.</div>
      <input maxLength={60} placeholder="Title (e.g. Support my channel)" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ marginTop: 8 }} />
      <input inputMode="numeric" placeholder="Goal in TFUEL (optional)" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value.replace(/\D/g, "") })} style={{ marginTop: 8 }} />
      <div className="row" style={{ marginTop: 10 }}><div className="b">Page is open</div><button type="button" aria-label="Page is open" className={`switch ${f.on ? "on" : ""}`} onClick={() => { const on = !f.on; setF({ ...f, on }); save({ on }); }} /></div>
      <button className="btn sec block" style={{ marginTop: 8 }} onClick={() => save()}>Save</button>
      {d.t.on && d.link && <div className="row" style={{ marginTop: 8, gap: 8 }}><span className="xs" style={{ wordBreak: "break-all", flex: 1 }}>{d.link}</span><CopyBtn text={d.link} /></div>}
    </div>
  );
}

/** What a supporter sees in Send (banner above the form) */
export function TipPageBanner({ info }: { info: any }) {
  if (!info) return null;
  const pct = info.goal ? Math.min(100, (info.raised / info.goal) * 100) : 0;
  return (
    <div className="card" style={{ marginTop: 0 }}>
      <div className="title">{info.title}</div>
      <div className="xs muted">by {info.name}</div>
      {info.goal > 0 && <><div style={{ height: 8, borderRadius: 6, background: "var(--soft, #eef0f5)", margin: "10px 0 4px" }}><div style={{ width: `${pct}%`, height: 8, borderRadius: 6, background: "var(--accent, #f5a623)" }} /></div><div className="xs muted">{Math.floor(info.raised).toLocaleString("en-US")} / {info.goal.toLocaleString("en-US")} TFUEL</div></>}
      {info.recent.length > 0 && <div className="xs" style={{ marginTop: 6 }}>Latest: {info.recent.map((r: any) => `${r.who} ${r.a === "usdt" ? r.amt.toFixed(2) + " USDT" : Math.floor(r.amt) + " TFUEL"}`).join(" · ")}</div>}
    </div>
  );
}

/** Tasks tab: short lessons with a reward */
export function LearnCard({ say, reload, cpt }: { say: Say; reload: () => void; cpt: number }) {
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [wait, setWait] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>("v26", { action: "learn" }).then((r) => setList(r.list || [])).catch(() => {}); }, []);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  if (!list.length) return null;
  const start = (l: any) => { setOpen(l); if (!l.done) { setWait(Math.min(30, Math.ceil(4 + l.body.length * 0.008) + 1)); api("v26", { action: "learnOpen", id: l.id }).catch(() => {}); } };
  const done = async () => { setBusy(true); try { const r = await api<any>("v26", { action: "learnDone", id: open.id }); setList(r.list); if (r.reward) say(`+${fmtTf(r.reward, cpt)} TFUEL`, true); reload(); setOpen(null); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  return (
    <div className="card">
      <div className="title">Learn</div>
      {list.map((l) => (
        <button key={l.id} className="row" style={{ width: "100%", background: "none", border: 0, textAlign: "left", padding: "10px 0", borderTop: "1px solid var(--line, #e5e7eb)", marginTop: 6 }} onClick={() => start(l)}>
          <span className="b">{l.title}</span>
          <span className={`pill ${l.done ? "ok" : "info"}`}>{l.done ? "done" : l.reward ? `+${fmtTf(l.reward, cpt)}` : "read"}</span>
        </button>
      ))}
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="title" style={{ fontSize: 18 }}>{open.title}</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55, maxHeight: "55vh", overflowY: "auto", marginTop: 8 }}>{open.body}</div>
            {!open.done ? <button className="btn block" style={{ marginTop: 12 }} disabled={busy || wait > 0} onClick={done}>{wait > 0 ? `Keep reading… ${wait}s` : "I finished reading"}</button> : <button className="btn block" style={{ marginTop: 12 }} onClick={() => setOpen(null)}>Close</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Settings: one-time codes to switch the PIN off if you ever forget it */
export function RecoveryCard({ say }: { say: Say }) {
  const [left, setLeft] = useState<number | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pin, setPin] = useState("");
  const [use, setUse] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>("v26", { action: "recLeft" }).then((r) => setLeft(r.left)).catch(() => {}); }, []);
  const make = async () => { setBusy(true); try { const r = await api<any>("v26", { action: "recNew", pin }); setCodes(r.codes); setLeft(r.codes.length); setPin(""); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  const redeem = async () => { setBusy(true); try { await api("v26", { action: "recUse", code: use }); say("PIN switched off. Money out is paused for 24 hours.", true); setUse(""); api<any>("v26", { action: "recLeft" }).then((r) => setLeft(r.left)); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  return (
    <div className="card">
      <div className="title">Recovery codes</div>
      <div className="sub">8 one-time codes. Keep them somewhere safe. If you forget your PIN, one code switches it off (money out is paused for 24 hours). {left ? `${left} left.` : ""}</div>
      {codes ? (
        <div style={{ marginTop: 8 }}>
          <div className="banner warn"><Icon name="alert" size={18} /><span>Write these down now. They are shown only once.</span></div>
          <div style={{ fontFamily: "monospace", fontSize: 15, lineHeight: 1.9, userSelect: "text" }}>{codes.map((c) => <div key={c}>{c}</div>)}</div>
          <CopyBtn text={codes.join("\n")} label="Copy all" />
          <button className="btn block" style={{ marginTop: 8 }} onClick={() => setCodes(null)}>I saved them</button>
        </div>
      ) : (
        <>
          <input inputMode="numeric" type="password" maxLength={6} placeholder="Withdraw PIN (if you have one)" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={{ marginTop: 8 }} />
          <button className="btn sec block" style={{ marginTop: 8 }} disabled={busy} onClick={make}>{left ? "Make new codes (old ones stop working)" : "Make recovery codes"}</button>
          <div className="row" style={{ gap: 8, marginTop: 10 }}><input placeholder="Use a code" value={use} onChange={(e) => setUse(e.target.value)} /><button className="btn sm" disabled={busy || use.trim().length < 6} onClick={redeem}>Use</button></div>
        </>
      )}
    </div>
  );
}

/** Settings: identity check, only if the admin asks for it above a certain amount */
export function KycCard({ say }: { say: Say }) {
  const [d, setD] = useState<any>(null);
  const [l, setL] = useState("");
  const [n, setN] = useState("");
  useEffect(() => { api<any>("v26", { action: "kyc" }).then(setD).catch(() => {}); }, []);
  if (!d || !d.on) return null;
  const send = async () => { try { setD(await api<any>("v26", { action: "kycSubmit", link: l, note: n })); say("Sent for review", true); } catch (e) { say(errText(e)); } };
  return (
    <div className="card">
      <div className="title">Identity check</div>
      <div className="sub">Withdrawals of {d.usd} USDT or more need this once.</div>
      {d.st === "ok" && <div className="banner success"><Icon name="check" size={18} /><span>You are verified.</span></div>}
      {d.st === "pending" && <div className="banner"><Icon name="clock" size={18} /><span>Waiting for review.</span></div>}
      {(d.st === "none" || d.st === "rejected") && (
        <>
          {d.st === "rejected" && <div className="banner err"><Icon name="alert" size={18} /><span>Not approved.{d.note ? " " + d.note : ""} You can send it again.</span></div>}
          <input placeholder="Link to your ID photo (https, set to private link)" value={l} onChange={(e) => setL(e.target.value)} style={{ marginTop: 8 }} />
          <input maxLength={200} placeholder="Note (optional)" value={n} onChange={(e) => setN(e.target.value)} style={{ marginTop: 8 }} />
          <button className="btn block" style={{ marginTop: 8 }} disabled={!/^https:\/\//.test(l)} onClick={send}>Send for review</button>
        </>
      )}
    </div>
  );
}

/** Dark mode between two hours (stored on this phone) */
const SKEY = "tfuel_dsch";
const readS = () => { try { const j = JSON.parse(localStorage.getItem(SKEY) || ""); return { on: !!j.on, from: Number(j.from) || 19, to: Number(j.to) || 6 }; } catch { return { on: false, from: 19, to: 6 }; } };
const inWin = (h: number, a: number, b: number) => (a <= b ? h >= a && h < b : h >= a || h < b);
export function ThemeSchedule() {
  useEffect(() => {
    const run = () => { const s = readS(); if (!s.on) return; document.documentElement.dataset.theme = inWin(new Date().getHours(), s.from, s.to) ? "dark" : "light"; };
    run();
    const t = setInterval(run, 60000);
    return () => clearInterval(t);
  }, []);
  return null;
}
export function ScheduleCard() {
  const [s, setS] = useState({ on: false, from: 19, to: 6 });
  useEffect(() => setS(readS()), []);
  const save = (n: typeof s) => { setS(n); try { localStorage.setItem(SKEY, JSON.stringify(n)); } catch {} if (n.on) document.documentElement.dataset.theme = inWin(new Date().getHours(), n.from, n.to) ? "dark" : "light"; else applyTheme(); };
  const hrs = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div className="card">
      <div className="row"><div><div className="title">Dark mode schedule</div><div className="xs muted">Switches by itself between two hours, on this phone.</div></div><button type="button" aria-label="Dark mode schedule" className={`switch ${s.on ? "on" : ""}`} onClick={() => save({ ...s, on: !s.on })} /></div>
      {s.on && <div className="grid2" style={{ marginTop: 8 }}><div><label>Dark from</label><select value={s.from} onChange={(e) => save({ ...s, from: Number(e.target.value) })}>{hrs.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></div><div><label>Light from</label><select value={s.to} onChange={(e) => save({ ...s, to: Number(e.target.value) })}>{hrs.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</select></div></div>}
    </div>
  );
}

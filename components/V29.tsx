import { useEffect, useState } from "react";
import { api, errText } from "@/lib/client";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const day = (t: number) => new Date(t).toLocaleDateString();

/** Savings vault: park money until a date. No interest, no risk. */
export function VaultCard({ say, reload }: { say: Say; reload: () => void }) {
  const [v, setV] = useState<any>(null);
  const [f, setF] = useState({ name: "", asset: "tfuel", amount: "", days: "30" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>("v29", { action: "vault" }).then((r) => setV(r.v)).catch(() => {}); }, []);
  if (!v || !v.on) return null;
  const lock = async () => {
    const pin = window.prompt("Enter your PIN to lock this money (leave empty if you have no PIN)");
    if (pin === null) return;
    setBusy(true);
    try { const r = await api<any>("v29", { action: "vaultLock", ...f, amount: Number(f.amount), days: Number(f.days), pin }); setV(r.v); setF({ ...f, amount: "" }); say("Locked", true); reload(); } catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  const open = async (id: string) => { try { const r = await api<any>("v29", { action: "vaultOpen", id }); setV(r.v); say("Money is back in your balance", true); reload(); } catch (e) { say(errText(e)); } };
  const show = v.list.filter((x: any) => x.st !== "open").concat(v.list.filter((x: any) => x.st === "open").slice(0, 3));
  return (
    <div className="card">
      <div className="title">Savings vault</div>
      <div className="sub">Lock money until a date you choose, so you can't spend it by mistake. It stays yours — no interest, no risk. You can't open it early.</div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <input maxLength={30} placeholder="Name (e.g. Eid)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select value={f.asset} onChange={(e) => setF({ ...f, asset: e.target.value })}><option value="tfuel">TFUEL</option><option value="usdt">USDT</option></select>
        <input inputMode="decimal" placeholder="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^\d.]/g, "") })} />
        <input inputMode="numeric" placeholder={`Days (${v.min_days}–${v.max_days})`} value={f.days} onChange={(e) => setF({ ...f, days: e.target.value.replace(/\D/g, "") })} />
      </div>
      <button className="btn block" style={{ marginTop: 8 }} disabled={busy || !(Number(f.amount) > 0)} onClick={lock}><Icon name="lock" size={15} /> Lock it</button>
      {show.map((x: any) => {
        const ready = x.st === "locked" && x.unlock_at <= Date.now();
        return (
          <div key={x.id} className="row" style={{ marginTop: 10 }}>
            <div><b>{x.name}</b><div className="xs muted">{x.st === "open" ? `Opened ${day(x.opened_at || x.unlock_at)}` : ready ? "Ready to open" : `Locked until ${day(x.unlock_at)}`}</div></div>
            <div style={{ textAlign: "right" }}><b className="num">{x.asset === "usdt" ? `${money(x.amt / 1e6)} USDT` : `${money(x.amt / 1000)} TFUEL`}</b>{ready && <div><button className="btn sm" onClick={() => open(x.id)}>Open</button></div>}</div>
          </div>
        );
      })}
    </div>
  );
}

/** Panic button + emergency contact + requests to confirm */
export function PanicCard({ say, reload }: { say: Say; reload: () => void }) {
  const [p, setP] = useState<any>(null);
  const [req, setReq] = useState<any[]>([]);
  const [code, setCode] = useState(""), [ec, setEc] = useState("");
  const load = () => { api<any>("v29", { action: "panic" }).then((r) => setP(r.p)).catch(() => {}); api<any>("v29", { action: "emgPending" }).then((r) => setReq(r.list)).catch(() => {}); };
  useEffect(load, []);
  const run = async (body: any, ok: string) => { try { const r = await api<any>("v29", body); if (r.p) setP(r.p); if (r.list) setReq(r.list); say(ok, true); reload(); } catch (e) { say(errText(e)); } };
  if (!p) return null;
  return (
    <div className="card">
      <div className="row"><div className="title">Emergency & panic</div><span className={`pill ${p.frozen ? "warn" : "ok"}`}>{p.frozen ? "Frozen" : "Normal"}</span></div>
      {!p.frozen && (
        <>
          <div className="sub">Lost your phone or think someone has access? Freeze your account in one tap. Nothing can leave until you unfreeze it.</div>
          <button className="btn danger block" style={{ marginTop: 8 }} onClick={() => { if (window.confirm("Freeze your account now? You will need a recovery code (or your emergency contact / support) to unfreeze.")) run({ action: "panicOn" }, "Account frozen"); }}><Icon name="shield" size={15} /> Freeze my account now</button>
        </>
      )}
      {p.frozen && p.self && (
        <>
          <div className="sub">Your account is frozen. Unfreeze with one of your recovery codes (Settings → Recovery codes){p.emg ? " or ask your emergency contact." : "."}</div>
          <input placeholder="Recovery code" value={code} onChange={(e) => setCode(e.target.value)} style={{ marginTop: 8 }} />
          <button className="btn block" style={{ marginTop: 6 }} disabled={code.trim().length < 6} onClick={() => run({ action: "panicOff", code }, "Unfrozen — money out is paused for 24 hours")}>Unfreeze</button>
          {p.emg && <button className="btn sec block" style={{ marginTop: 6 }} disabled={!p.emg.ready || p.asked} onClick={() => run({ action: "emgAsk" }, "Request sent to your contact")}>{p.asked ? "Waiting for your contact" : p.emg.ready ? `Ask ${p.emg.name} to confirm` : "Contact works 24 h after adding"}</button>}
        </>
      )}
      {p.frozen && !p.self && <div className="sub">Support froze your account. Please open a support ticket.</div>}
      <div className="b" style={{ marginTop: 12 }}>Emergency contact</div>
      {p.emg ? (
        <div className="row"><span>{p.emg.name} ({p.emg.code})</span><button className="btn ghost sm" onClick={() => run({ action: "emgClear" }, "Removed")}>Remove</button></div>
      ) : (
        <div className="gap" style={{ marginTop: 4 }}>
          <input style={{ flex: 1 }} placeholder="Their 10-letter ID" value={ec} onChange={(e) => setEc(e.target.value)} />
          <button className="btn sm" disabled={ec.trim().length < 6} onClick={() => { const pin = window.prompt("Enter your PIN (leave empty if you have no PIN)"); if (pin !== null) run({ action: "emgSet", code: ec.trim(), pin }, "Saved"); }}>Save</button>
        </div>
      )}
      <div className="xs muted">They can only confirm your unfreeze (24 h after you add them). They can't move your money.</div>
      {req.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="b">Emergency requests</div>
          {req.map((r) => (
            <div key={r.uid} className="row" style={{ marginTop: 6 }}>
              <span>{r.name} asks you to confirm an unfreeze. Only confirm if you spoke to them yourself.</span>
              <button className="btn sm" onClick={() => run({ action: "emgApprove", uid: r.uid }, "Confirmed")}>Confirm</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Referral contest (Boost → Invite) */
export function ContestCard() {
  const [c, setC] = useState<any>(null);
  useEffect(() => { api<any>("v29", { action: "contest" }).then((r) => setC(r.c)).catch(() => {}); }, []);
  if (!c) return null;
  return (
    <div className="card">
      <div className="row"><div className="title">{c.title}</div><span className={`pill ${c.live ? "ok" : ""}`}>{c.live ? "Live" : c.ended ? "Ended" : "Soon"}</span></div>
      <div className="sub">{day(c.start)} – {day(c.end)} · invite the most friends. Prizes: {c.prizes.map((p: number, i: number) => `#${i + 1} ${p} TFUEL`).join(" · ")}</div>
      <div className="sumrow" style={{ marginTop: 6 }}><span className="muted">You</span><b>{c.me.n} friend{c.me.n === 1 ? "" : "s"}{c.me.rank ? ` · rank #${c.me.rank}` : ""}</b></div>
      {c.board.map((r: any) => <div key={r.rank} className="sumrow"><span style={{ fontWeight: r.me ? 700 : 400 }}>#{r.rank} {r.name}{r.me ? " (you)" : ""}</span><b className="num">{r.n}</b></div>)}
      {!c.board.length && <div className="xs muted">No one has joined yet — be the first.</div>}
      {c.ended && c.paid && <div className="xs muted" style={{ marginTop: 6 }}>Prizes were paid.</div>}
    </div>
  );
}

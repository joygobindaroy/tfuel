import { useEffect, useState } from "react";
import { api, errText, fmtTf } from "@/lib/client";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;

/** Savings goal: progress bar against the balance (nothing is locked) */
export function GoalCard({ say, balance, cpt, compact }: { say: Say; balance: number; cpt: number; compact?: boolean }) {
  const [g, setG] = useState<{ name: string; target: number } | null | undefined>(undefined);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [amt, setAmt] = useState("");
  useEffect(() => { api<any>("v23", { action: "goal" }).then((r) => setG(r.goal)).catch(() => setG(null)); }, []);
  if (g === undefined || (compact && !g)) return null;
  const save = async (clear?: boolean) => {
    try { const r = await api<any>("v23", { action: "goalSet", name, target: clear ? 0 : Math.round(Number(amt) * cpt) }); setG(r.goal); setEdit(false); say(clear ? "Goal removed" : "Goal saved", true); } catch (e) { say(errText(e)); }
  };
  const pct = g ? Math.min(100, (balance / g.target) * 100) : 0;
  return (
    <div className="card">
      <div className="row"><div className="title" style={{ fontSize: compact ? 15 : undefined }}>{g ? g.name : "Savings goal"}</div>{!compact && <button className="btn sec sm" onClick={() => { setEdit(!edit); setName(g?.name || ""); setAmt(g ? String(g.target / cpt) : ""); }}>{g ? "Edit" : "Set goal"}</button>}</div>
      {g && (
        <>
          <div style={{ height: 8, borderRadius: 6, background: "var(--soft, #eef0f5)", margin: "10px 0 4px" }}><div style={{ width: `${pct}%`, height: 8, borderRadius: 6, background: "var(--accent, #f5a623)", transition: "width .4s" }} /></div>
          <div className="xs muted">{fmtTf(Math.min(balance, g.target), cpt)} / {fmtTf(g.target, cpt)} TFUEL · {Math.floor(pct)}%{pct >= 100 ? " — reached!" : ""}</div>
        </>
      )}
      {!g && !edit && <div className="sub">Pick something to save for and watch your balance grow toward it.</div>}
      {edit && !compact && (
        <div style={{ marginTop: 10 }}>
          <input maxLength={30} placeholder="What for? (e.g. New phone)" value={name} onChange={(e) => setName(e.target.value)} />
          <input inputMode="decimal" placeholder="Target (TFUEL)" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ marginTop: 8 }} />
          <div className="grid2" style={{ marginTop: 8 }}>
            {g ? <button className="btn danger" onClick={() => save(true)}>Remove</button> : <button className="btn sec" onClick={() => setEdit(false)}>Cancel</button>}
            <button className="btn" disabled={!(Number(amt) > 0)} onClick={() => save()}>Save</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Short line others see when they send to you */
export function BioCard({ say }: { say: Say }) {
  const [b, setB] = useState("");
  useEffect(() => { api<any>("v23", { action: "bio" }).then((r) => setB(r.bio || "")).catch(() => {}); }, []);
  return (
    <div className="card">
      <div className="title">Short bio</div>
      <div className="sub">Shown to people who type your ID in Send.</div>
      <input maxLength={60} value={b} onChange={(e) => setB(e.target.value)} onBlur={() => api("v23", { action: "bioSet", text: b }).then(() => say("Saved", true)).catch((e) => say(errText(e)))} placeholder="e.g. Dhaka · crypto fan" style={{ marginTop: 8 }} />
    </div>
  );
}

/** Free lucky draw */
export function DrawCard({ say }: { say: Say }) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>("v23", { action: "draw" }).then((r) => setD(r.draw)).catch(() => {}); }, []);
  if (!d) return null;
  const join = async () => { setBusy(true); try { const r = await api<any>("v23", { action: "drawJoin" }); setD(r.draw); say("You are in!", true); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  const left = d.end ? Math.max(0, d.end - Date.now()) : 0;
  const t = left > 864e5 ? `${Math.floor(left / 864e5)} d ${Math.floor((left % 864e5) / 36e5)} h` : `${Math.floor(left / 36e5)} h ${Math.floor((left % 36e5) / 6e4)} m`;
  return (
    <div className="card">
      <div className="left"><div className="ico gold"><Icon name="gift" /></div><div><div className="title">{d.on ? d.title : "Lucky draw"}</div>{d.on && <div className="xs muted">Prize {Math.floor(d.prize).toLocaleString("en-US")} coins · ends in {t} · {d.entrants} joined</div>}</div></div>
      {d.on && !d.joined && <button className="btn block" style={{ marginTop: 10 }} disabled={busy} onClick={join}>Join free</button>}
      {d.on && d.joined && <div className="sub" style={{ marginTop: 8 }}>You have <b>{d.tickets}</b> ticket{d.tickets > 1 ? "s" : ""}. Each friend who joins this round adds {d.per_friend} more.</div>}
      {d.winner && <div className="xs muted" style={{ marginTop: 8 }}>Last winner: {d.winner.name}</div>}
    </div>
  );
}

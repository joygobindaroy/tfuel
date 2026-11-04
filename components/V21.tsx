import { useEffect, useState } from "react";
import { api, errText } from "@/lib/client";
import { CopyBtn } from "@/components/Ui";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;
const T = (n: number) => Math.floor(n).toLocaleString("en-US");

/** Invite tree: two levels + what the person earned */
export function TreeCard({ say, cpt }: { say: Say; cpt: number }) {
  const [d, setD] = useState<any>(null);
  const [off, setOff] = useState(false);
  useEffect(() => { api<any>("v21", { action: "tree" }).then(setD).catch((e) => { if (String(e?.message).startsWith("feature_off")) setOff(true); else say(errText(e)); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (off || !d || (!d.n1 && !d.n2)) return null;
  return (
    <div className="card">
      <div className="title">My invite tree</div>
      <div className="sub">Level 1: {d.n1} · Level 2: {d.n2} · You earned <b>{(d.earned / Math.max(1, cpt)).toFixed(2)} TFUEL</b> from level 1</div>
      {d.level1.slice(0, 15).map((r: any, i: number) => (
        <div key={i} style={{ marginTop: 8 }}>
          <div className="row"><b>{r.name}</b><span className="xs muted num">+{(((r.comm || 0) + (r.bonus || 0)) / Math.max(1, cpt)).toFixed(2)} TFUEL</span></div>
          {r.sub.length > 0 && <div className="xs muted" style={{ paddingLeft: 14, borderLeft: "2px solid var(--line, #e5e7eb)", marginTop: 2 }}>{r.sub.map((x: any) => x.name).join(", ")}</div>}
        </div>
      ))}
    </div>
  );
}

/** Ranking among only the people I invited / who invited me */
export function FriendsBoard({ say }: { say: Say }) {
  const [b, setB] = useState<"d" | "w" | "all">("w");
  const [list, setList] = useState<any[] | null>(null);
  const [off, setOff] = useState(false);
  useEffect(() => { setList(null); api<any>("v21", { action: "board", board: b }).then((r) => setList(r.list)).catch((e) => { if (String(e?.message).startsWith("feature_off")) setOff(true); else say(errText(e)); }); }, [b]); // eslint-disable-line react-hooks/exhaustive-deps
  if (off || (list && list.length < 2)) return null;
  return (
    <div className="card">
      <div className="title">Friends ranking</div>
      <div className="chips" style={{ marginTop: 6 }}>{([["d", "Today"], ["w", "This week"], ["all", "All time"]] as const).map(([k, t]) => <button key={k} className={`chip ${b === k ? "on" : ""}`} onClick={() => setB(k)}>{t}</button>)}</div>
      {!list ? <div className="sub" style={{ marginTop: 8 }}>…</div> : list.map((r) => (
        <div className="row" key={r.rank} style={{ marginTop: 8, fontWeight: r.me ? 800 : 500 }}><span>{r.rank}. {r.name}{r.me ? " (you)" : ""}</span><span className="num">{T(r.v)}</span></div>
      ))}
    </div>
  );
}

/** Settings: tip link, download my data, delete account */
export function AccountTools({ say }: { say: Say }) {
  const [tip, setTip] = useState("");
  const [del, setDel] = useState(false);
  const [pin, setPin] = useState("");
  const [word, setWord] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api<any>("v21", { action: "tiplink" }).then((r) => setTip(r.link || "")).catch(() => {}); }, []);
  const dl = async () => {
    setBusy(true);
    try {
      const r = await api<any>("v21", { action: "export" });
      const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-data.json"; document.body.appendChild(a); a.click(); a.remove();
      say("Your data was downloaded", true);
    } catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  const doDel = async () => {
    setBusy(true); setErr("");
    try { await api("v21", { action: "delete", pin, confirm: word, ack }); say("Account deleted", true); setTimeout(() => { try { (window as any).Telegram?.WebApp?.close(); } catch {} location.reload(); }, 900); }
    catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      {tip && (
        <div className="card">
          <div className="title">Tip me link</div>
          <div className="sub">Share this link. People who open it land on Send with your ID filled in.</div>
          <div className="row" style={{ marginTop: 8, gap: 8 }}><span className="xs" style={{ wordBreak: "break-all", flex: 1 }}>{tip}</span><CopyBtn text={tip} /></div>
        </div>
      )}
      <div className="card">
        <div className="title">Your data</div>
        <button className="btn sec block" style={{ marginTop: 8 }} disabled={busy} onClick={dl}><Icon name="download" size={16} /> Download my data</button>
        <button className="btn danger block" style={{ marginTop: 8 }} onClick={() => setDel(true)}>Delete my account</button>
      </div>
      {del && (
        <div className="sheet-bg" onClick={() => !busy && setDel(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="title" style={{ fontSize: 18 }}>Delete account</div>
            <div className="banner warn" style={{ marginTop: 8 }}><Icon name="alert" size={18} /><span>Your name, e-mail, PIN and contacts are erased and the account is locked forever. Any balance left is lost. This can&apos;t be undone.</span></div>
            <label style={{ marginTop: 8 }}>Withdraw PIN (if you set one)</label>
            <input inputMode="numeric" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            <label style={{ marginTop: 8 }}>Type DELETE</label>
            <input value={word} onChange={(e) => setWord(e.target.value)} />
            <label className="row" style={{ gap: 8, justifyContent: "flex-start", marginTop: 10 }}><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20 }} /><span className="sm">I understand my balance will be lost.</span></label>
            {err && <div className="banner err"><Icon name="alert" size={18} /><span>{err}</span></div>}
            <div className="grid2" style={{ marginTop: 12 }}>
              <button className="btn sec" disabled={busy} onClick={() => setDel(false)}>Cancel</button>
              <button className="btn danger" disabled={busy || word !== "DELETE" || !ack} onClick={doDel}>{busy ? "Please wait…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { PageHead } from "@/components/Cashier";
import { Empty, SkelList, confetti } from "@/components/Ui";
import { api, errText, fmtTf } from "@/lib/client";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;

/** Today's missions: 3 small tasks → bonus */
export function MissionsCard({ dm, say, cpt, reload }: { dm: any; say: Say; cpt: number; reload: () => void }) {
  const [d, setD] = useState<any>(dm);
  const [busy, setBusy] = useState(false);
  useEffect(() => setD(dm), [dm]);
  if (!d?.enabled || !d.items?.length) return null;
  const claim = async () => {
    setBusy(true);
    try { const r: any = await api("more", { action: "missionsClaim" }); setD(r.dm); confetti(24); say(`+${fmtTf(r.reward, cpt)} TFUEL mission bonus`, true); reload(); }
    catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <div className="row"><div className="title">Today&apos;s missions</div><span className="pill info">+{fmtTf(d.bonus, cpt)} TFUEL</span></div>
      {d.items.map((m: any) => (
        <div key={m.id} style={{ marginTop: 10 }}>
          <div className="row"><div className="sub" style={{ margin: 0 }}>{m.done && <Icon name="check" size={13} />} {m.title}</div><span className="xs muted num">{Math.min(m.have, m.goal)}/{m.goal}</span></div>
          <div className="bar" style={{ marginTop: 4 }}><div style={{ width: `${Math.min(100, Math.floor((m.have / Math.max(1, m.goal)) * 100))}%` }} /></div>
        </div>
      ))}
      {d.claimed ? <div className="xs muted" style={{ marginTop: 10 }}>Bonus claimed. New missions tomorrow.</div>
        : <button className="btn block" style={{ marginTop: 12 }} disabled={!d.all || busy} onClick={claim}>{d.all ? "Claim bonus" : "Finish all to claim"}</button>}
    </div>
  );
}

/** Home "today's to-do" strip */
export function TodoCard({ me, go }: { me: any; go: (t: string) => void }) {
  const items: { t: string; to: string }[] = [];
  const now = Date.now();
  if (me.dailyReady) items.push({ t: "Claim your daily reward", to: "boost" });
  if (me.dm?.enabled && !me.dm.claimed) items.push({ t: me.dm.all ? "Claim your mission bonus" : "Finish today's missions", to: "tap" });
  if ((me.tasks || []).some((x: any) => !x.done)) items.push({ t: "New tasks to complete", to: "tasks" });
  if ((me.sites || []).some((s: any) => !s.in_progress && (s.ready_at || 0) <= now)) items.push({ t: "An article site is ready", to: "tasks" });
  if (!items.length) return null;
  return (
    <div className="card">
      <div className="title" style={{ marginBottom: 4 }}>To do today</div>
      {items.slice(0, 4).map((x) => (
        <button key={x.t} className="hist" style={{ width: "100%", background: "none", border: 0, textAlign: "left", cursor: "pointer", padding: "8px 0" }} onClick={() => go(x.to)}>
          <div className="left"><Icon name="check" size={16} /><span style={{ marginLeft: 8 }}>{x.t}</span></div>
          <span className="muted">›</span>
        </button>
      ))}
    </div>
  );
}

/** Community activity feed (anonymous) */
export function FeedCard({ say }: { say: Say }) {
  const [f, setF] = useState<{ t: string; at: number }[] | null>(null);
  useEffect(() => { api<any>("more", { action: "feed" }).then((r) => setF(r.feed || [])).catch(() => setF([])); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  void say;
  if (!f || !f.length) return null;
  return (
    <div className="card">
      <div className="title" style={{ marginBottom: 4 }}>Community</div>
      {f.slice(0, 6).map((x, i) => <div key={i} className="sub" style={{ margin: "4px 0" }}>{x.t}</div>)}
    </div>
  );
}

/** Shown once per session when the user returns after a while and something is waiting */
export function AwayPopup({ away, cpt }: { away: any; cpt: number }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!away) return;
    const total = (away.commission || 0) + (away.mining || 0) + (away.rigs || 0);
    if (total <= 0) return;
    try { if (sessionStorage.getItem("away_seen")) return; sessionStorage.setItem("away_seen", "1"); } catch {}
    setOpen(true);
  }, [away]);
  if (!open || !away) return null;
  const rows: [string, number][] = [["Referral commission", away.commission], ["Mining", away.mining], ["Rigs", away.rigs]];
  return (
    <div className="sheet-bg" onClick={() => setOpen(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ fontSize: 17 }}>Welcome back</div>
        <div className="sub">You were away for {away.hours} h. Here is what you earned:</div>
        <div className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 10 }}>
          {rows.filter(([, v]) => v > 0).map(([k, v]) => <div className="sumrow" key={k}><span className="muted">{k}</span><b className="num">+{fmtTf(v, cpt)} TFUEL</b></div>)}
        </div>
        <button className="btn block" style={{ marginTop: 12 }} onClick={() => setOpen(false)}>Great!</button>
      </div>
    </div>
  );
}

/** Profile badges & frames (coin sink) */
export function CosmeticsPage({ say, onBack, cpt, reload }: { say: Say; onBack: () => void; cpt: number; reload: () => void }) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => { try { setD((await api<any>("more", { action: "cos" })).cos); } catch (e) { say(errText(e)); } }, [say]);
  useEffect(() => { load(); }, [load]);
  const run = async (action: string, id: string, kind = "") => {
    setBusy(id || kind);
    try { const r: any = await api("more", { action, id, kind }); setD(r.cos); if (action === "cosBuy") { confetti(18); say("Unlocked", true); } reload(); }
    catch (e) { say(errText(e)); } finally { setBusy(""); }
  };
  return (
    <>
      <PageHead title="Badges & frames" onBack={onBack} />
      {!d && <SkelList />}
      {d && !d.enabled && <div className="card empty">Not available right now.</div>}
      {d?.enabled && (["badge", "frame"] as const).map((k) => (
        <div className="card" key={k}>
          <div className="title" style={{ textTransform: "capitalize" }}>{k}s</div>
          <div className="sub">Shown next to your name on leaderboards.</div>
          {d.items.filter((i: any) => i.kind === k).length === 0 && <Empty icon="gift" title="Nothing here yet" hint="Check back soon." />}
          {d.items.filter((i: any) => i.kind === k).map((i: any) => (
            <div className="hist" key={i.id}>
              <div className="left"><span style={{ fontSize: 24, width: 34 }}>{i.emoji}</span><div><div className="title" style={{ fontSize: 14 }}>{i.name}</div><div className="sub" style={{ margin: 0 }}>{i.owned ? (i.on ? "Equipped" : "Owned") : `${fmtTf(i.price, cpt)} TFUEL`}</div></div></div>
              {!i.owned && <button className="btn sm" disabled={!!busy} onClick={() => run("cosBuy", i.id)}>Buy</button>}
              {i.owned && !i.on && <button className="btn sec sm" disabled={!!busy} onClick={() => run("cosEquip", i.id, k)}>Equip</button>}
              {i.owned && i.on && <button className="btn sec sm" disabled={!!busy} onClick={() => run("cosEquip", "", k)}>Remove</button>}
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

/** Referral boost pass block (paid, temporary extra commission %) */
export function PassCard({ pass, say, cpt, reload, onDone }: { pass: any; say: Say; cpt: number; reload: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  if (!pass?.enabled) return null;
  const buy = async () => {
    setBusy(true);
    try { await api("more", { action: "passBuy" }); confetti(18); say("Boost pass active", true); reload(); onDone(); }
    catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="card">
      <div className="row"><div className="title">Referral boost pass</div><span className="pill info">+{pass.bonus}%</span></div>
      <div className="sub" style={{ margin: "4px 0 8px" }}>Earn {pass.bonus}% extra commission on friends&apos; earnings for {pass.days} days.{pass.until ? ` Active until ${new Date(pass.until).toLocaleDateString()}.` : ""}</div>
      <button className="btn block" disabled={busy} onClick={buy}>{pass.until ? "Extend" : "Get"} for {fmtTf(pass.price, cpt)} TFUEL</button>
    </div>
  );
}

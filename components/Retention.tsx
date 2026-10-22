import { useCallback, useEffect, useState } from "react";
import { api, errText, fmtTf } from "@/lib/client";
import { confetti, SkelList } from "@/components/Ui";
import { PageHead } from "@/components/Cashier";

type Say = (m: string, ok?: boolean) => void;
const dur = (ms: number) => { const h = Math.max(0, Math.floor(ms / 3600000)); return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h`; };

/** Level badge shown next to the profile name */
export function LevelPill({ ret }: { ret?: any }) {
  if (!ret?.level) return null;
  return <span className="pill ok" title={`Level ${ret.level.level}`}>🏅 {ret.level.badge} · Lv {ret.level.level}</span>;
}

/** Profile → Rewards & progress: level, weekly challenge, event, comeback / anniversary, streak freeze, achievements */
export function RewardsPage({ say, onBack, cpt, reload }: { say: Say; onBack: () => void; cpt: number; reload: () => void }) {
  const [st, setSt] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => { try { setSt((await api<any>("retention", { action: "get" })).state); } catch (e) { say(errText(e)); } }, [say]);
  useEffect(() => { load(); }, [load]);
  const run = async (key: string, body: Record<string, any>, msg: (r: any) => string) => {
    setBusy(key);
    try { const r = await api<any>("retention", body); setSt(r.state); say(msg(r), true); confetti(); reload(); }
    catch (e) { say(errText(e)); }
    finally { setBusy(""); }
  };
  const T = (n: number) => fmtTf(n, cpt);
  if (!st) return (<><PageHead title="Rewards & progress" onBack={onBack} /><SkelList /></>);
  const lv = st.level;
  const claim = (kind: string, id = "") => run(kind + id, { action: "claim", kind, id }, (r) => `+${T(r.reward)} TFUEL`);
  return (
    <>
      <PageHead title="Rewards & progress" onBack={onBack} />
      <div className="card">
        <div className="row"><b>🏅 {lv.badge} · Level {lv.level}</b><span className="muted num">{lv.total.toLocaleString("en-US")} earned</span></div>
        <div className="progress"><div style={{ width: `${lv.pct}%` }} /></div>
        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{lv.level >= 100 ? "Max level" : `${lv.pct}% to level ${lv.level + 1}`}</div>
      </div>

      {st.comeback && (
        <div className="card"><div className="row"><div><b>👋 Welcome back!</b><div className="muted" style={{ fontSize: 12 }}>You were away {st.comeback.days} days. Here's a gift.</div></div>
          <button className="btn sm" disabled={busy === "comeback"} onClick={() => claim("comeback")}>Claim +{T(st.comeback.bonus)}</button></div></div>
      )}
      {st.anniv && (
        <div className="card"><div className="row"><div><b>🎉 Anniversary bonus</b><div className="muted" style={{ fontSize: 12 }}>Thanks for being with us ({st.anniv.key}).</div></div>
          <button className="btn sm" disabled={busy === "anniv"} onClick={() => claim("anniv")}>Claim +{T(st.anniv.bonus)}</button></div></div>
      )}
      {st.event && (
        <div className="card">
          <b>🎊 {st.event.name}</b> <span className="pill">ends in {dur(st.event.end - Date.now())}</span>
          <div className="muted" style={{ fontSize: 13, margin: "4px 0" }}>{st.event.text}{st.event.tap_mult > 1 ? ` · Tap ×${st.event.tap_mult}` : ""}{st.event.daily_mult > 1 ? ` · Daily ×${st.event.daily_mult}` : ""}</div>
          {st.event.bonus > 0 && <button className="btn sm" disabled={st.event.claimed || busy === "event" + st.event.id} onClick={() => claim("event", st.event.id)}>{st.event.claimed ? "Bonus claimed" : `Claim +${T(st.event.bonus)}`}</button>}
        </div>
      )}
      {st.weekly && (
        <div className="card">
          <div className="row"><b>📅 Weekly challenge</b><span className="muted" style={{ fontSize: 12 }}>resets in {dur(st.weekly.ends - Date.now())}</span></div>
          <div className="muted" style={{ fontSize: 13, margin: "4px 0" }}>Complete {st.weekly.target} tasks, articles or daily rewards this week.</div>
          <div className="progress"><div style={{ width: `${Math.min(100, (st.weekly.n / st.weekly.target) * 100)}%` }} /></div>
          <div className="row" style={{ marginTop: 8 }}><span className="num">{st.weekly.n} / {st.weekly.target}</span>
            <button className="btn sm" disabled={st.weekly.claimed || st.weekly.n < st.weekly.target || busy === "weekly"} onClick={() => claim("weekly")}>{st.weekly.claimed ? "Claimed" : `Claim +${T(st.weekly.reward)}`}</button></div>
        </div>
      )}
      {st.freeze.enabled && (
        <div className="card">
          <div className="row"><div><b>🧊 Streak freeze</b><div className="muted" style={{ fontSize: 12 }}>Protects your daily streak when you miss a day. You have {st.freeze.count} / {st.freeze.max}. Current streak: {st.streak}.</div></div>
            <button className="btn sm" disabled={st.freeze.count >= st.freeze.max || busy === "freeze"} onClick={() => run("freeze", { action: "buyFreeze" }, () => "Streak freeze added")}>Buy · {T(st.freeze.price)}</button></div>
          {st.recover && (
            <div className="row" style={{ marginTop: 10 }}><div className="muted" style={{ fontSize: 12 }}>You lost a {st.recover.streak}-day streak. Restore it within {dur(st.recover.until - Date.now())}.</div>
              <button className="btn sec sm" disabled={busy === "recover"} onClick={() => run("recover", { action: "recover" }, (r) => `Streak restored: ${r.streak} days`)}>Restore · {T(st.recover.price)}</button></div>
          )}
        </div>
      )}
      {st.ach.length > 0 && (
        <>
          <div className="mhead">Achievements</div>
          <div className="card">
            {st.ach.map((a: any) => (
              <div key={a.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <div className="row"><div><b>{a.done ? "🏆" : "🔒"} {a.title}</b><div className="muted" style={{ fontSize: 12 }}>{a.text}</div></div>
                  {a.claimed ? <span className="pill ok">Done</span> : <button className="btn sm" disabled={!a.done || busy === "ach" + a.id} onClick={() => claim("ach", a.id)}>+{T(a.reward)}</button>}</div>
                {!a.done && <div className="progress" style={{ marginTop: 6 }}><div style={{ width: `${(a.value / a.goal) * 100}%` }} /></div>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

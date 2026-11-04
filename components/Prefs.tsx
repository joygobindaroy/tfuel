import { useEffect, useRef, useState } from "react";
import { api, errText } from "@/lib/client";
import { usePv, setPvLocal } from "@/lib/pvclient";
import { QA_KEYS, pvClean, type Pv } from "@/lib/pvtypes";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;

/** Idle timers: hides the balance after a while and locks the app (asks the PIN, or just a tap, when it comes back). */
export function IdleGuard({ onHide }: { onHide: () => void }) {
  const p = usePv();
  const [locked, setLocked] = useState(false);
  const last = useRef(Date.now());
  useEffect(() => {
    const touch = () => { last.current = Date.now(); };
    const ev = ["pointerdown", "keydown", "scroll", "touchstart"];
    ev.forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const t = setInterval(() => {
      const idle = (Date.now() - last.current) / 1000;
      if (p.ah > 0 && idle >= p.ah) onHide();
      if (p.to > 0 && idle >= p.to * 60) setLocked(true);
    }, 3000);
    const vis = () => { if (!document.hidden && p.to > 0 && (Date.now() - last.current) / 60000 >= p.to) setLocked(true); };
    document.addEventListener("visibilitychange", vis);
    return () => { ev.forEach((e) => window.removeEventListener(e, touch)); clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [p.ah, p.to, onHide]);
  if (!locked) return null;
  return <LockScreen onDone={() => { last.current = Date.now(); setLocked(false); }} />;
}

function LockScreen({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState("");
  const [needPin, setNeedPin] = useState<boolean | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>("pv", { action: "unlock", pin: "" }).then(() => setNeedPin(false)).catch((e) => setNeedPin(String(e?.message || e).includes("pin_required") || true)); }, []);
  const go = async () => {
    setBusy(true); setErr("");
    try { await api("pv", { action: "unlock", pin }); onDone(); } catch (e) { setErr(errText(e)); setPin(""); } finally { setBusy(false); }
  };
  useEffect(() => { if (pin.length >= 4 && pin.length <= 6 && needPin && /^\d{6}$/.test(pin)) go(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pin]);
  return (
    <div className="lockscr">
      <div className="ico gold" style={{ width: 60, height: 60 }}><Icon name="lock" size={30} /></div>
      <div className="title" style={{ fontSize: 20 }}>App locked</div>
      {needPin === null && <div className="sub">…</div>}
      {needPin === false && <button className="btn" onClick={onDone}>Tap to unlock</button>}
      {needPin && (
        <>
          <div className="sub">Enter your PIN</div>
          <input inputMode="numeric" type="password" autoFocus maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} style={{ textAlign: "center", fontSize: 24, letterSpacing: 8, maxWidth: 220 }} />
          {err && <div className="xs" style={{ color: "#dc2626" }}>{err}</div>}
          <button className="btn" disabled={busy || pin.length < 4} onClick={go}>Unlock</button>
        </>
      )}
    </div>
  );
}

const QA_LABEL: Record<string, string> = { send: "Send", deposit: "Deposit", withdraw: "Withdraw", daily: "Daily reward", spin: "Lucky spin", history: "History", invite: "Invite", shops: "Shops" };

/** Settings → Preferences: small personal switches */
export function PrefsCard({ say }: { say: Say }) {
  const p = usePv();
  const [busy, setBusy] = useState(false);
  const set = async (patch: Partial<Pv>) => {
    const next = pvClean(patch, p);
    setPvLocal(next); // instant on this phone
    setBusy(true);
    try { const r = await api<{ pv: Pv }>("pv", { action: "set", pv: next }); setPvLocal(pvClean(r.pv)); } catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  const Sel = ({ k, opts }: { k: keyof Pv; opts: [string, string][] }) => (
    <div className="chips" style={{ marginTop: 6 }}>{opts.map(([v, t]) => <button key={v} type="button" disabled={busy} className={`chip ${String(p[k] ?? "") === v ? "on" : ""}`} onClick={() => set({ [k]: v === "" && k === "tz" ? null : isNaN(Number(v)) || v === "" ? v : Number(v) } as Partial<Pv>)}>{t}</button>)}</div>
  );
  const Sw = ({ k, t, h }: { k: "ds" | "an" | "wk"; t: string; h?: string }) => (
    <div className="row" style={{ marginTop: 10 }}><div><div className="b">{t}</div>{h && <div className="xs muted">{h}</div>}</div><button type="button" className={`switch ${p[k] ? "on" : ""}`} aria-label={t} onClick={() => set({ [k]: !p[k] } as Partial<Pv>)} /></div>
  );
  const dev = typeof window !== "undefined" ? -new Date().getTimezoneOffset() : 0;
  const tzs: [string, string][] = [["", "This phone"], ["0", "UTC"], [String(dev), "Same as phone (fixed)"], ["330", "India +5:30"], ["360", "Bangladesh +6"], ["180", "Moscow +3"]];
  return (
    <div className="card">
      <div className="title">Preferences</div>
      <div className="sub">Small settings just for you.</div>

      <div className="b" style={{ marginTop: 12 }}>Who can send me money</div>
      <Sel k="rx" opts={[["all", "Anyone"], ["contacts", "Only my contacts"], ["none", "Nobody"]]} />
      <div className="b" style={{ marginTop: 12 }}>Whose payment requests I can pay</div>
      <Sel k="rq" opts={[["all", "Anyone"], ["contacts", "Only my contacts"], ["none", "Nobody"]]} />
      <div className="b" style={{ marginTop: 12 }}>How I appear to people I send to</div>
      <Sel k="sn" opts={[["nick", "Nickname"], ["name", "My name"], ["id", "My ID only"]]} />

      <div className="b" style={{ marginTop: 12 }}>Ask me once more before sending this much or more</div>
      <div className="grid2" style={{ marginTop: 6 }}>
        <div><label>TFUEL (0 = off)</label><input inputMode="numeric" defaultValue={p.cf_t || ""} onBlur={(e) => set({ cf_t: Number(e.target.value) || 0 })} placeholder="e.g. 500" /></div>
        <div><label>USDT (0 = off)</label><input inputMode="decimal" defaultValue={p.cf_u || ""} onBlur={(e) => set({ cf_u: Number(e.target.value) || 0 })} placeholder="e.g. 50" /></div>
      </div>
      <div className="b" style={{ marginTop: 12 }}>Default note for sends</div>
      <input maxLength={60} defaultValue={p.rn} onBlur={(e) => set({ rn: e.target.value })} placeholder="e.g. Thanks!" style={{ marginTop: 6 }} />

      <div className="b" style={{ marginTop: 12 }}>Hide balance after being idle</div>
      <Sel k="ah" opts={[["0", "Never"], ["15", "15 s"], ["30", "30 s"], ["60", "1 min"], ["120", "2 min"]]} />
      <div className="b" style={{ marginTop: 12 }}>Lock the app after being idle</div>
      <Sel k="to" opts={[["0", "Never"], ["1", "1 min"], ["5", "5 min"], ["15", "15 min"], ["30", "30 min"]]} />
      <div className="xs muted">The lock asks for your withdraw PIN if you set one.</div>

      <div className="b" style={{ marginTop: 12 }}>Default coin in Send & Withdraw</div>
      <Sel k="da" opts={[["", "Ask me"], ["tfuel", "TFUEL"], ["usdt", "USDT"]]} />
      <div className="b" style={{ marginTop: 12 }}>Text size</div>
      <Sel k="fs" opts={[["s", "Small"], ["m", "Normal"], ["l", "Large"]]} />
      <div className="b" style={{ marginTop: 12 }}>Time</div>
      <Sel k="tf" opts={[["24", "24-hour"], ["12", "12-hour"]]} />
      <Sel k="tz" opts={tzs} />
      <Sw k="ds" t="Data saver" h="Fewer pictures and previews on a slow connection." />
      <Sw k="an" t="No animations" h="Turns off motion and confetti." />
      <Sw k="wk" t="Weekly e-mail summary" h="Needs a verified e-mail. Sent once a week." />

      <div className="b" style={{ marginTop: 12 }}>Home quick buttons (up to 4)</div>
      <div className="chips" style={{ marginTop: 6 }}>
        {QA_KEYS.map((k) => {
          const on = p.qa.includes(k);
          return <button key={k} type="button" disabled={busy || (!on && p.qa.length >= 4)} className={`chip ${on ? "on" : ""}`} onClick={() => set({ qa: on ? p.qa.filter((x) => x !== k) : [...p.qa, k] })}>{QA_LABEL[k]}</button>;
        })}
      </div>
    </div>
  );
}

/** Row of the person's chosen quick buttons on the home screen */
export function QuickBar({ go }: { go: (k: string) => void }) {
  const p = usePv();
  if (!p.qa.length) return null;
  const ico: Record<string, any> = { send: "send", deposit: "download", withdraw: "wallet", daily: "gift", spin: "zap", history: "clock", invite: "users", shops: "grid" };
  return (
    <div className="grid2" style={{ gridTemplateColumns: `repeat(${p.qa.length}, 1fr)`, marginBottom: 12 }}>
      {p.qa.map((k) => <button key={k} className="btn sec sm" style={{ flexDirection: "column", gap: 4, padding: "10px 4px" }} onClick={() => go(k)}><Icon name={ico[k]} size={18} />{QA_LABEL[k]}</button>)}
    </div>
  );
}

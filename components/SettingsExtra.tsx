import { useEffect, useState } from "react";
import { api, errText, fmtUsd, getUi, setUi, hapticOn, setHapticOn } from "@/lib/client";
import Icon from "@/components/Icons";
import type { Account } from "@/components/Settings";

type Act = (body: any, ok: string) => Promise<boolean>;
type P = { a: Account; act: Act; busy: boolean; say: (t: string, ok?: boolean) => void };
const Sw = ({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) => (
  <button className={`switch ${on ? "on" : ""}`} disabled={disabled} aria-label={label} style={{ flexShrink: 0 }} onClick={onClick} />
);
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** App feel: sound, haptic, start screen, number format, balance estimate (saved on this device) */
export function AppFeelCard({ a }: { a: Account }) {
  const [, f] = useState(0);
  const re = () => f((n) => n + 1);
  const seg = (key: string, opts: [string, string][], def: string) => (
    <div className="seg" style={{ marginBottom: 0 }}>
      {opts.map(([v, l]) => <button key={v} className={getUi(key, def) === v ? "on" : ""} onClick={() => { setUi(key, v); re(); }}>{l}</button>)}
    </div>
  );
  return (
    <div className="card">
      <div className="row">
        <div><div className="title">Tap sound</div><div className="sub">A short click when you tap or claim.</div></div>
        <Sw on={getUi("sound") === "1"} label="Toggle sound" onClick={() => { setUi("sound", getUi("sound") === "1" ? "0" : "1"); re(); }} />
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div><div className="title">Vibration</div><div className="sub">Haptic feedback on taps and rewards.</div></div>
        <Sw on={hapticOn()} label="Toggle vibration" onClick={() => { setHapticOn(!hapticOn()); re(); }} />
      </div>
      <div className="title" style={{ marginTop: 14 }}>Start screen</div>
      <div className="sub" style={{ marginBottom: 6 }}>Which tab opens first.</div>
      {seg("start", [["tap", "Tap"], ["tasks", "Tasks"], ["boost", "Boost"], ["tfuel", "TFUEL"]], "tap")}
      <div className="title" style={{ marginTop: 14 }}>Number format</div>
      <div className="sub" style={{ marginBottom: 6 }}>Big amounts as 12,500 or 12.5K (from 10,000).</div>
      {seg("numfmt", [["full", "12,500"], ["compact", "12.5K"]], "full")}
      <div className="title" style={{ marginTop: 14 }}>Balance estimate</div>
      <div className="sub" style={{ marginBottom: 6 }}>The small value shown under your balance.</div>
      {seg("approx", [["usdt", "≈ USDT"], ...(a.bdt ? [["bdt", "≈ BDT"] as [string, string]] : []), ["off", "Off"]], "usdt")}
    </div>
  );
}

/** Security checkup: score + what to do next */
export function CheckupCard({ a }: { a: Account }) {
  const items: [boolean, string, string][] = [
    [!!a.email?.addr, "Email verified", "Verify your email so codes and alerts reach you."],
    [a.pin, "Withdraw PIN set", "Set a PIN so nobody else can withdraw."],
    [a.addrs.length > 0, "Saved address added", "Save your withdrawal address once and reuse it safely."],
    [!!a.prefs?.wl_only, "Trusted-address mode on", "Allow withdrawals only to saved addresses."],
    [a.login_alert, "Login alerts on", "Get a message when a new device opens your account."],
  ];
  const done = items.filter((x) => x[0]).length;
  const pct = Math.round((done / items.length) * 100);
  const col = pct >= 80 ? "#16a34a" : pct >= 40 ? "#f59e0b" : "#dc2626";
  return (
    <div className="card">
      <div className="row"><div className="title">Security checkup</div><span className="pill" style={{ color: col }}>{pct}% · {pct >= 80 ? "Strong" : pct >= 40 ? "Fair" : "Weak"}</span></div>
      <div className="bar" style={{ margin: "8px 0" }}><div style={{ width: `${pct}%`, background: col }} /></div>
      {items.map(([ok, t, h]) => (
        <div className="hist" key={t}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}><Icon name={ok ? "check" : "alert"} size={16} /><div><div className="title" style={{ fontSize: 14 }}>{t}</div>{!ok && <div className="sub">{h}</div>}</div></div>
        </div>
      ))}
    </div>
  );
}

/** Trusted-address toggle (own withdrawal whitelist) */
export function TrustedToggle({ a, act, busy }: P) {
  if (a.email?.whitelist) return <div className="xs muted" style={{ marginBottom: 8 }}>Withdrawals are limited to saved addresses on this app.</div>;
  return (
    <div className="row" style={{ marginBottom: 10 }}>
      <div><div className="title">Trusted-address mode</div><div className="sub">Allow withdrawals only to your saved addresses.</div></div>
      <Sw on={!!a.prefs?.wl_only} disabled={busy} label="Toggle trusted addresses" onClick={() => act({ action: "setPrefs", wl_only: !a.prefs?.wl_only }, a.prefs?.wl_only ? "Trusted mode off" : "Trusted mode on")} />
    </div>
  );
}

/** Nickname + leaderboard privacy */
export function PrivacyCard({ a, act, busy }: P) {
  const [nick, setNick] = useState(a.prefs?.nick || "");
  useEffect(() => setNick(a.prefs?.nick || ""), [a.prefs?.nick]);
  return (
    <div className="card">
      <label style={{ marginTop: 0 }}>Nickname (shown on the leaderboard)</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input maxLength={16} placeholder="Your Telegram name" value={nick} onChange={(e) => setNick(e.target.value)} />
        <button className="btn sm" disabled={busy || nick.trim() === (a.prefs?.nick || "")} onClick={() => act({ action: "setPrefs", nick }, nick.trim() ? "Nickname saved" : "Nickname removed")}>Save</button>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <div><div className="title">Hide me on the leaderboard</div><div className="sub">Show “Anonymous” instead of your name.</div></div>
        <Sw on={!!a.prefs?.lb_hide} disabled={busy} label="Toggle leaderboard privacy" onClick={() => act({ action: "setPrefs", lb_hide: !a.prefs?.lb_hide }, a.prefs?.lb_hide ? "You're visible again" : "You're hidden")} />
      </div>
    </div>
  );
}

/** Notification groups, quiet hours, daily summary, price-alert list */
export function NotifExtras({ a, act, busy, say }: P) {
  const n = a.prefs?.notif || {};
  const q = a.prefs?.quiet;
  const tz = -new Date().getTimezoneOffset();
  const [alerts, setAlerts] = useState<{ id: string; price: number; dir: string }[] | null>(null);
  const loadAlerts = () => api<any>("alerts", { action: "list" }).then((r) => setAlerts(r.alerts || [])).catch(() => setAlerts([]));
  useEffect(() => { loadAlerts(); }, []);
  const groups: [string, string, string][] = [["money", "Money", "Deposits, payouts, transfers, price alerts"], ["rewards", "Rewards", "Daily reward, energy, friends, prizes"], ["tasks", "Tasks", "New task alerts"], ["news", "News", "Announcements from us"]];
  const setQ = (o: any) => act({ action: "setPrefs", quiet: { on: true, from: q?.from ?? 23, to: q?.to ?? 8, tz, ...o } }, "Saved");
  return (
    <>
      <div className="title" style={{ marginTop: 14 }}>What to send me</div>
      <div className="sub">Security messages always arrive.</div>
      {groups.map(([k, t, h]) => (
        <div className="row" style={{ marginTop: 10 }} key={k}>
          <div><div className="title" style={{ fontSize: 14 }}>{t}</div><div className="sub">{h}</div></div>
          <Sw on={n[k] !== false} disabled={busy} label={`Toggle ${t}`} onClick={() => act({ action: "setPrefs", notif: { [k]: n[k] === false } }, "Saved")} />
        </div>
      ))}
      <div className="row" style={{ marginTop: 14 }}>
        <div><div className="title">Quiet hours</div><div className="sub">No bot messages at night (they still appear in the 🔔 inbox).</div></div>
        <Sw on={!!q} disabled={busy} label="Toggle quiet hours" onClick={() => (q ? act({ action: "setPrefs", quiet: { on: false } }, "Quiet hours off") : setQ({}))} />
      </div>
      {q && (
        <div className="grid2" style={{ marginTop: 8 }}>
          <div><label>From</label><select value={q.from} onChange={(e) => setQ({ from: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select></div>
          <div><label>To</label><select value={q.to} onChange={(e) => setQ({ to: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hh(h)}</option>)}</select></div>
        </div>
      )}
      <div className="row" style={{ marginTop: 14 }}>
        <div><div className="title">Daily summary</div><div className="sub">Every morning: what you earned yesterday.</div></div>
        <Sw on={!!a.prefs?.sum_daily} disabled={busy} label="Toggle daily summary" onClick={() => act({ action: "setPrefs", sum_daily: !a.prefs?.sum_daily }, a.prefs?.sum_daily ? "Summary off" : "Summary on")} />
      </div>
      <div className="title" style={{ marginTop: 14 }}>My price alerts</div>
      {alerts === null && <div className="sub">Loading…</div>}
      {alerts?.length === 0 && <div className="sub">None. Set one from the chart in the TFUEL tab.</div>}
      {alerts?.map((x) => (
        <div className="hist" key={x.id}>
          <div><div className="title" style={{ fontSize: 14 }}>{x.dir === "above" ? "≥" : "≤"} {fmtUsd(x.price)}</div><div className="sub">Notify when the price goes {x.dir === "above" ? "up to" : "down to"} this</div></div>
          <button className="btn sec sm" aria-label="Delete alert" onClick={async () => { try { await api("alerts", { action: "remove", id: x.id }); loadAlerts(); } catch (e) { say(errText(e)); } }}><Icon name="trash" size={14} /></button>
        </div>
      ))}
    </>
  );
}

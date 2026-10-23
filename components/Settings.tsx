import { useCallback, useEffect, useState } from "react";
import { api, errText, getUi, setUi, hapticOn, setHapticOn } from "@/lib/client";
import Icon from "@/components/Icons";
import { getTheme, setTheme, Theme } from "@/lib/theme";
import { CopyBtn, useCountdown } from "@/components/Ui";
import { AppFeelCard, CheckupCard, TrustedToggle, PrivacyCard, NotifExtras } from "@/components/SettingsExtra";

type Say = (t: string, ok?: boolean) => void;
export interface Account { email?: { enabled: boolean; required: boolean; addr: string; whitelist: boolean; cooldown_h: number; money?: boolean }; pin: boolean; pin_locked: boolean; bdt?: boolean; cur: "tfuel" | "usdt" | null; login_alert: boolean; mail_money?: boolean; remind_daily?: boolean; prefs?: { nick: string; lb_hide: boolean; wl_only: boolean; def_net: string; sum_daily: boolean; task_alert?: boolean; notif: Record<string, boolean>; quiet: { on: boolean; from: number; to: number; tz: number } | null }; devices: { label: string; last: number; first: number }[]; addrs: { id: string; label: string; address: string; added_at?: number; fav?: boolean }[] }

/** PIN ও Saved addresses — Settings ও withdraw ফর্ম দুই জায়গাই ব্যবহার করে */
export function useAccount() {
  const [a, setA] = useState<Account | null>(null);
  const load = useCallback(async () => {
    try { setA(await api<Account>("account", { action: "get" })); } catch {}
  }, []);
  useEffect(() => { load(); }, [load]);
  return { a, setA, load };
}

export interface MailDetails { amount?: number; asset?: string; network?: string; address?: string; label?: string }
/** Email code: verified email থাকলে দেখায় (admin "Require" চালু থাকলে বাধ্যতামূলক, নইলে ঐচ্ছিক); "Send code" চাপলে মেইলে ৬ ডিজিট কোড যায় */
export function EmailCodeField({ acc, purpose, value, onChange, say, details }: { acc: Account | null; purpose: "withdraw" | "send" | "pin" | "address" | "email"; value: string; onChange: (v: string) => void; say?: Say; details?: MailDetails }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [wait, setWait] = useCountdown();
  if (!acc?.email) return null;
  const req = acc.email.required;
  if (!acc.email.addr) return req ? <div className="banner warn"><Icon name="alert" size={18} /><span>Verify your email in Settings to continue.</span></div> : null;
  const ready = purpose === "withdraw" || purpose === "send" ? !!details?.address && !!details?.amount : purpose === "address" ? !!details?.address : true;
  const send = async () => {
    setBusy(true);
    try { await api("account", { action: "codeSend", purpose, details }); setSent(true); setWait(60); say?.("Code sent to your email", true); } catch (e: any) { say?.(errText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <label>{req ? "Email code" : "Email code (optional)"}</label>
      <div style={{ position: "relative" }}>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
        <button type="button" className="btn sec sm" style={{ position: "absolute", right: 6, top: 6 }} disabled={busy || !ready || wait > 0} onClick={send}>{wait > 0 ? `Resend in ${wait}s` : sent ? "Resend" : "Send code"}</button>
      </div>
      <div className="xs muted" style={{ marginTop: 4 }}>{ready ? `We email a code to ${acc.email.addr.replace(/^(.).*(@.*)$/, "$1•••$2")}.` : "Fill in the amount and address first."}</div>
    </>
  );
}

/** PIN সেট থাকলে ঘর দেখায় (withdraw ফর্মে); email code থাকলে সেটাও */
export function PinField({ acc, value, onChange, ecode, onEcode, say, details, purpose = "withdraw" }: { purpose?: "withdraw" | "send"; acc: Account | null; value: string; onChange: (v: string) => void; ecode?: string; onEcode?: (v: string) => void; say?: Say; details?: MailDetails }) {
  return (
    <>
      {acc?.pin && (
        <>
          <label>Withdraw PIN</label>
          <input type="password" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="4–6 digit PIN" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} />
        </>
      )}
      {onEcode && <EmailCodeField acc={acc} purpose={purpose} value={ecode || ""} onChange={onEcode} say={say} details={details} />}
    </>
  );
}

/** সেভ করা ঠিকানা বেছে নিলে ঘর ভরে যায় */
export function AddrPicker({ acc, onPick }: { acc: Account | null; onPick: (address: string) => void }) {
  if (!acc?.addrs.length) return null;
  return (
    <select defaultValue="" style={{ marginBottom: 6 }} onChange={(e) => { if (e.target.value) onPick(e.target.value); e.target.value = ""; }}>
      <option value="">Use a saved address…</option>
      {[...acc.addrs].sort((p, q) => Number(!!q.fav) - Number(!!p.fav)).map((x) => <option key={x.id} value={x.address}>{x.fav ? "★ " : ""}{x.label} · {x.address.slice(0, 6)}…{x.address.slice(-4)}</option>)}
    </select>
  );
}

export function SettingsPanel({ say, notify, account, onCur }: { say: Say; notify?: React.ReactNode; account?: React.ReactNode; onCur?: (c: "tfuel" | "usdt") => void }) {
  const { a, setA, load } = useAccount();
  const [theme, setT] = useState<Theme>("light");
  useEffect(() => setT(getTheme()), []);
  const [cur, setCur] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [addr, setAddr] = useState("");
    const [code, setCode] = useState("");
  const [ec, setEc] = useState(""); // email code for sensitive changes
  const [em, setEm] = useState("");
  const [emStep, setEmStep] = useState<"" | "old" | "new">("");
  const [pin2, setPin2] = useState("");
  const [pinMode, setPinMode] = useState<"" | "change" | "forgot">("");
  const [emCode, setEmCode] = useState("");

  const confirmEmail = async () => { if (await act({ action: "emailConfirm", email: em, code: emCode }, "Email verified")) { setEmStep(""); setEmCode(""); setEm(""); } };
  useEffect(() => { if (emStep === "new" && emCode.length === 6 && !busy) confirmEmail(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [emCode, emStep]);
  const act = async (body: any, ok: string) => {
    setBusy(true);
    try {
      setA(await api<Account>("account", body));
      say(ok, true);
      return true;
    } catch (e: any) {
      say(errText(e));
      load();
      return false;
    } finally { setBusy(false); }
  };
  if (!a) return <div className="small muted">Loading…</div>;

  return (
    <>
      <div className="mhead" style={{ marginTop: 4 }}>Appearance</div>
      <div className="card">
      <div className="sub" style={{ marginBottom: 8 }}>Choose how the app looks. Auto follows your phone.</div>
      <div className="seg" style={{ marginBottom: 0 }}>
        {(["light", "dark", "auto"] as Theme[]).map((t) => (
          <button key={t} className={theme === t ? "on" : ""} onClick={() => { setT(t); setTheme(t); }}>{t === "auto" ? "Auto" : t === "dark" ? "Dark" : "Light"}</button>
        ))}
      </div>
      </div>

      <div className="mhead">App feel</div>
      <AppFeelCard a={a} />

      <div className="mhead">Profile & privacy</div>
      <PrivacyCard a={a} act={act} busy={busy} say={say} />

      <div className="mhead">Preferences</div>
      <div className="card">
        <div className="title">Default currency</div>
        <div className="sub" style={{ marginBottom: 8 }}>Used to show your balance and as the default when you pay in a shop.</div>
        <div className="seg" style={{ marginBottom: 0 }}>
          {(["tfuel", "usdt"] as const).map((c) => (
            <button key={c} className={a.cur === c ? "on" : ""} disabled={busy} onClick={async () => { if (await act({ action: "setCur", cur: c }, "Currency saved")) onCur?.(c); }}>{c === "tfuel" ? "TFUEL" : "USDT"}</button>
          ))}
        </div>
      </div>

      <div className="mhead">Security</div>
      <CheckupCard a={a} />
      {a.email?.enabled && (
        <div className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div className="left">
              <div className="ico green"><Icon name="check" /></div>
              <div>
                <div className="title">{a.email.addr ? "Email verified" : "Email"}</div>
                <div className="sub">{a.email.addr ? a.email.addr : "Verify your email to protect withdrawals and account changes with a 6-digit code."}</div>
              </div>
            </div>
          </div>
          {a.email.addr && emStep === "" && (
            <button className="btn sec block" style={{ marginTop: 12 }} disabled={busy} onClick={async () => { if (await act({ action: "codeSend", purpose: "email" }, "We sent a code to your current email")) { setEmStep("old"); setEc(""); } }}>Change email</button>
          )}
          {a.email.addr && emStep === "old" && (
            <>
              <label>Code sent to {a.email.addr.replace(/^(.).*(@.*)$/, "$1•••$2")}</label>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6-digit code" value={ec} onChange={(e) => setEc(e.target.value.replace(/\D/g, ""))} />
              <label>New email</label>
              <input type="email" autoComplete="email" maxLength={254} placeholder="name@example.com" value={em} onChange={(e) => setEm(e.target.value)} />
              <div className="grid2" style={{ marginTop: 10 }}>
                <button className="btn" disabled={busy || ec.length !== 6 || !/^\S+@\S+\.\S+$/.test(em)} onClick={async () => { if (await act({ action: "emailSend", email: em, email_code: ec }, "We sent a code to your new email")) { setEmStep("new"); setEc(""); } }}>Continue</button>
                <button className="btn sec" disabled={busy} onClick={() => { setEmStep(""); setEc(""); setEm(""); }}>Cancel</button>
              </div>
            </>
          )}
          {!a.email.addr && emStep === "" && (
            <>
              <label>Your email</label>
              <input type="email" autoComplete="email" maxLength={254} placeholder="name@example.com" value={em} onChange={(e) => setEm(e.target.value)} />
              <button className="btn block" style={{ marginTop: 10 }} disabled={busy || !/^\S+@\S+\.\S+$/.test(em)} onClick={async () => { if (await act({ action: "emailSend", email: em }, "We sent a 6-digit code to your email")) setEmStep("new"); }}>Send verification code</button>
            </>
          )}
          {emStep === "new" && (
            <>
              <label>6-digit code sent to {em}</label>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emCode} onChange={(e) => setEmCode(e.target.value.replace(/\D/g, ""))} />
              <div className="grid2" style={{ marginTop: 10 }}>
                <button className="btn" disabled={busy || emCode.length !== 6} onClick={async () => { if (await act({ action: "emailConfirm", email: em, code: emCode }, "Email verified")) { setEmStep(""); setEmCode(""); setEm(""); } }}>Verify</button>
                <button className="btn sec" disabled={busy} onClick={() => { setEmStep(""); setEmCode(""); setEm(""); }}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="card">
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div className="left">
            <div className="ico green"><Icon name="lock" /></div>
            <div>
              <div className="title">Withdraw PIN</div>
              <div className="sub">{a.pin ? "On — needed for every withdrawal." : "Off. Add a PIN to protect your withdrawals."}</div>
            </div>
          </div>
        </div>
        {a.pin_locked && <div className="banner warn"><Icon name="alert" size={18} /><span>Too many wrong PINs. Locked for a few minutes.</span></div>}

        {!a.pin && (
          <>
            <label>Choose a PIN (4–6 digits)</label>
            <input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            <label>Retype PIN</label>
            <input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} />
            {pin2 && pin !== pin2 && <div className="xs" style={{ color: "#b91c1c", marginTop: 4 }}>PINs don&apos;t match.</div>}
            <EmailCodeField acc={a} purpose="pin" value={ec} onChange={setEc} say={say} />
            <button className="btn block" style={{ marginTop: 10 }} disabled={busy || pin.length < 4 || pin !== pin2} onClick={async () => { if (await act({ action: "setPin", pin, email_code: ec }, "PIN is on")) { setPin(""); setPin2(""); setEc(""); } }}>Turn on PIN</button>
          </>
        )}

        {a.pin && pinMode === "" && (
          <div className="grid2" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={() => { setPinMode("change"); setPin(""); setPin2(""); setCur(""); setEc(""); }}>Change PIN</button>
            <button className="btn sec" disabled={busy} onClick={async () => {
              if (!a.email?.addr) { say("Verify your email first — we send the reset code there.", false); return; }
              if (await act({ action: "pinResetRequest" }, "We sent a 6-digit code to your email")) { setPinMode("forgot"); setCode(""); setPin(""); setPin2(""); }
            }}>Forgot PIN?</button>
          </div>
        )}

        {a.pin && pinMode === "change" && (
          <>
            <label>Current PIN</label>
            <input type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={cur} onChange={(e) => setCur(e.target.value.replace(/\D/g, ""))} />
            <label>New PIN (4–6 digits)</label>
            <input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            <label>Retype new PIN</label>
            <input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} />
            {pin2 && pin !== pin2 && <div className="xs" style={{ color: "#b91c1c", marginTop: 4 }}>PINs don&apos;t match.</div>}
            <EmailCodeField acc={a} purpose="pin" value={ec} onChange={setEc} say={say} />
            <div className="grid2" style={{ marginTop: 10 }}>
              <button className="btn" disabled={busy || cur.length < 4 || pin.length < 4 || pin !== pin2} onClick={async () => { if (await act({ action: "setPin", pin, current: cur, email_code: ec }, "PIN changed")) { setPin(""); setPin2(""); setCur(""); setEc(""); setPinMode(""); } }}>Save new PIN</button>
              <button className="btn sec" disabled={busy} onClick={() => { setPinMode(""); setPin(""); setPin2(""); setCur(""); setEc(""); }}>Cancel</button>
            </div>
            <button className="btn ghost sm" style={{ marginTop: 8 }} disabled={busy || cur.length < 4} onClick={async () => { if (await act({ action: "removePin", current: cur, email_code: ec }, "PIN turned off")) { setCur(""); setEc(""); setPinMode(""); } }}>Turn off PIN</button>
          </>
        )}

        {a.pin && pinMode === "forgot" && (
          <>
            <label>6-digit code from your email</label>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
            <label>New PIN (4–6 digits)</label>
            <input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
            <label>Retype new PIN</label>
            <input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ""))} />
            {pin2 && pin !== pin2 && <div className="xs" style={{ color: "#b91c1c", marginTop: 4 }}>PINs don&apos;t match.</div>}
            <div className="grid2" style={{ marginTop: 10 }}>
              <button className="btn" disabled={busy || code.length !== 6 || pin.length < 4 || pin !== pin2} onClick={async () => { if (await act({ action: "pinResetConfirm", code, pin }, "PIN reset")) { setPinMode(""); setCode(""); setPin(""); setPin2(""); } }}>Reset PIN</button>
              <button className="btn sec" disabled={busy} onClick={() => { setPinMode(""); setCode(""); setPin(""); setPin2(""); }}>Cancel</button>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="row">
          <div><div className="title">Login alerts</div><div className="sub">Get a Telegram message when your account is opened on a new device.</div></div>
          <button className={`switch ${a.login_alert ? "on" : ""}`} disabled={busy} aria-label="Toggle login alerts" style={{ flexShrink: 0 }} onClick={() => act({ action: "setLoginAlert", on: !a.login_alert }, a.login_alert ? "Login alerts off" : "Login alerts on")} />
        </div>
        {a.devices.length > 0 && <div className="title" style={{ fontSize: 13, margin: "12px 0 4px" }}>Recent devices</div>}
        {a.devices.map((d, i) => (
          <div className="hist" key={i}><div><div className="title" style={{ fontSize: 14 }}>{d.label}</div><div className="sub">Last used {new Date(d.last).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div></div></div>
        ))}
      </div>

      <div className="mhead">Saved addresses</div>
      <div className="card">
      <TrustedToggle a={a} act={act} busy={busy} say={say} />
      {a.addrs.length === 0 && <div className="small muted">No saved addresses yet.</div>}
      {[...a.addrs].sort((p, q) => Number(!!q.fav) - Number(!!p.fav)).map((x) => (
        <div className="hist" key={x.id}>
          <div style={{ minWidth: 0 }}>
            <div className="title">{x.label}</div>
            <div className="sub" style={{ wordBreak: "break-all" }}>{x.address}</div>
          </div>
          <CopyBtn text={x.address} />
          <button className="btn ghost sm" aria-label="Favorite" disabled={busy} style={{ fontSize: 17, color: x.fav ? "#f59e0b" : undefined }} onClick={() => act({ action: "favAddr", id: x.id, on: !x.fav }, x.fav ? "Removed from favorites" : "Added to favorites")}>{x.fav ? "★" : "☆"}</button>
          <button className="btn sec sm" aria-label="Delete address" disabled={busy} onClick={() => act({ action: "delAddr", id: x.id }, "Removed")}><Icon name="trash" size={14} /></button>
        </div>
      ))}
      {a.addrs.length < 10 && (
        <>
          <label>Label</label>
          <input maxLength={20} placeholder="e.g. Binance TRC20" value={label} onChange={(e) => setLabel(e.target.value)} />
          <label>Address / account</label>
          <input maxLength={100} placeholder="Paste address" value={addr} onChange={(e) => setAddr(e.target.value)} />
          <EmailCodeField acc={a} purpose="address" value={ec} onChange={setEc} say={say} details={{ address: addr.replace(/\s/g, ""), label }} />
          {(a.email?.cooldown_h || 0) > 0 && <div className="xs muted" style={{ marginTop: 6 }}>New addresses can be used for withdrawals after {a.email!.cooldown_h} hour(s).</div>}
          <button className="btn block" style={{ marginTop: 10 }} disabled={busy || !label.trim() || addr.trim().length < 6} onClick={async () => { if (await act({ action: "addAddr", label, address: addr, email_code: ec }, "Address saved")) { setLabel(""); setAddr(""); setEc(""); } }}>Save address</button>
        </>
      )}
      </div>
      <div className="mhead">Notifications</div>
      <div className="card">
        {notify}
        {a.email?.addr && a.email.money !== false && (
          <div className="row" style={{ marginTop: 12 }}>
            <div><div className="title">Email on money movement</div><div className="sub">Deposits, trades, transfers, shop payments and payouts.</div></div>
            <button className={`switch ${a.mail_money !== false ? "on" : ""}`} disabled={busy} aria-label="Toggle money emails" style={{ flexShrink: 0 }} onClick={() => act({ action: "setMailMoney", on: a.mail_money === false }, a.mail_money === false ? "Money emails on" : "Money emails off")} />
          </div>
        )}
        <NotifExtras a={a} act={act} busy={busy} say={say} />
        <div className="row" style={{ marginTop: 12 }}>
          <div><div className="title">Daily reward reminder</div><div className="sub">A message in the bot if you haven&apos;t claimed today.</div></div>
          <button className={`switch ${a.remind_daily ? "on" : ""}`} disabled={busy} aria-label="Toggle daily reminder" style={{ flexShrink: 0 }} onClick={() => act({ action: "setRemind", on: !a.remind_daily }, a.remind_daily ? "Reminder off" : "Reminder on")} />
        </div>
      </div>
      {account && (<><div className="mhead">Account</div><div className="card">{account}</div></>)}
    </>
  );
}

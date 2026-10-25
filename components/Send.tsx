import { useEffect, useRef, useState } from "react";
import { api, errText, fmtTf } from "@/lib/client";
import { CopyBtn, AmtInput, Cta, SkelCard, confetti } from "@/components/Ui";
import { PageHead } from "@/components/Cashier";
import { useAccount, PinField } from "@/components/Settings";
import Icon from "@/components/Icons";

type Say = (t: string, ok?: boolean) => void;
interface Info { enabled: boolean; code: string; fee_pct: number; min: number; left: number | null; daily_limit: number; min_age_hours: number; balance: number }
interface Tx { id: string; txid: string; at: number; amount: number; fee: number; to: { name: string; code: string } }

/** Send TFUEL (internal transfer): receiver's unique ID → name shown → amount + PIN → confirm sheet → code emailed automatically → receipt with transaction hash */
export function SendPage({ say, onBack, cpt, reload, top }: { say: Say; onBack: () => void; cpt: number; reload: () => void; top?: React.ReactNode }) {
  const [info, setInfo] = useState<Info | null>(null);
  const { a: acct } = useAccount();
  const [code, setCode] = useState("");
  const [who, setWho] = useState("");
  const [looking, setLooking] = useState(false);
  const [lookErr, setLookErr] = useState("");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [stage, setStage] = useState<"" | "confirm" | "code" | "done">("");
  const [otp, setOtp] = useState("");
  const [mailTo, setMailTo] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [tx, setTx] = useState<Tx | null>(null);
  const sentRef = useRef(false);

  const load = () => api<Info>("send", { action: "info" }).then(setInfo).catch((e) => say(errText(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const c = code.trim();
  useEffect(() => {
    setWho(""); setLookErr("");
    if (!/^[A-Za-z0-9]{10}$/.test(c)) return;
    let live = true;
    setLooking(true);
    api<any>("send", { action: "lookup", code: c }).then((r) => live && setWho(r.name)).catch((e) => live && setLookErr(errText(e))).finally(() => live && setLooking(false));
    return () => { live = false; };
  }, [c]);

  const n = Math.round((Number(amt) || 0) * cpt) / cpt; // exactly what the server will use
  const fee = info ? Math.ceil(((n * cpt) * info.fee_pct) / 100) / cpt : 0;
  const total = n + fee;
  const bal = (info?.balance || 0) / cpt;
  const min = (info?.min || 0) / cpt;
  const valid = !!info?.enabled && !!who && n >= min && total <= bal && (!acct?.pin || pin.length >= 4);
  const T = (v: number) => fmtTf(Math.round(v * cpt), cpt);

  const close = () => { setStage(""); setOtp(""); setErr(""); sentRef.current = false; };
  const finish = (r: any) => {
    setTx(r.tx); setStage("done"); confetti(24);
    setInfo((i) => (i ? { ...i, balance: r.balance, left: i.left === null ? null : Math.max(0, i.left - Math.round(total * cpt)) } : i));
    setAmt(""); setNote(""); setPin(""); setCode(""); setWho(""); setOtp("");
    reload();
  };
  const doSend = async (emailCode: string) => {
    if (sentRef.current) return;
    sentRef.current = true; setBusy(true); setErr("");
    try { finish(await api("send", { action: "send", code: c, amount: n, note, pin, email_code: emailCode })); }
    catch (e: any) { setErr(errText(e)); sentRef.current = false; } finally { setBusy(false); }
  };
  const prepare = async () => {
    setBusy(true); setErr("");
    try {
      const r: any = await api("send", { action: "prepare", code: c, amount: n, note, pin });
      if (r.step === "code") { setMailTo(r.email); setStage("code"); setWait(60); setOtp(""); }
      else await doSend("");
    } catch (e: any) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setErr("");
    try { await api("send", { action: "prepare", code: c, amount: n, note, pin }); setWait(60); say("A new code was sent", true); }
    catch (e: any) { setErr(errText(e)); } finally { setBusy(false); }
  };
  useEffect(() => { if (stage === "code" && /^\d{6}$/.test(otp) && !busy) doSend(otp); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [otp, stage]);

  const rows: [string, string][] = [["Recipient", who], ["Recipient ID", c], ["Amount", `${T(n)} TFUEL`], ["Fee", `${T(fee)} TFUEL`], ["Total", `${T(total)} TFUEL`], ...(note.trim() ? [["Note", note.trim()] as [string, string]] : [])];
  const receipt = tx ? `Transfer completed\nTo: ${tx.to.name} (${tx.to.code})\nAmount: ${fmtTf(tx.amount, cpt)} TFUEL\nFee: ${fmtTf(tx.fee, cpt)} TFUEL\nTime: ${new Date(tx.at).toISOString().replace("T", " ").slice(0, 19)} UTC\nTransaction hash: ${tx.txid}` : "";

  return (
    <>
      <PageHead title={top ? "Withdraw" : "Send TFUEL"} onBack={onBack} />
      {top}
      {!info && <SkelCard rows={4} />}
      {info && !info.enabled && <div className="banner warn"><Icon name="alert" size={18} /><span>Sending TFUEL is turned off right now.</span></div>}
      {info && (
        <>
          <div className="card">
            <div className="sub">Your unique ID — share it to receive TFUEL</div>
            <div className="gap" style={{ background: "var(--soft)", borderRadius: 12, padding: "10px 12px", marginTop: 6 }}>
              <span className="num" style={{ flex: 1, fontWeight: 700, letterSpacing: 1, userSelect: "text" }}>{info.code || "—"}</span>
              {info.code && <CopyBtn text={info.code} />}
            </div>
          </div>
          {info.enabled && (
            <div className="card">
              <label style={{ marginTop: 0 }}>Receiver&apos;s unique ID</label>
              <input placeholder="10 letters / numbers" maxLength={10} autoCapitalize="off" autoCorrect="off" value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} />
              {looking && <div className="xs muted" style={{ marginTop: 6 }}>Checking…</div>}
              {who && (
                <div className="gap" style={{ marginTop: 8, background: "var(--soft)", borderRadius: 12, padding: "8px 12px", alignItems: "center" }}>
                  <span className="ico gold" style={{ width: 34, height: 34, flexShrink: 0 }}><Icon name="user" size={16} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><div className="title" style={{ fontSize: 15 }}>{who}</div><div className="xs muted">You are sending to this person</div></div>
                  <Icon name="check" size={18} />
                </div>
              )}
              {lookErr && <div className="xs" style={{ color: "#dc2626", marginTop: 6 }}>{lookErr}</div>}
              <label>Amount (TFUEL)</label>
              <div style={{ position: "relative" }}>
                <AmtInput placeholder={`Min ${fmtTf(info.min, cpt)}`} value={amt} onChange={setAmt} />
                <button className="btn sec sm" style={{ position: "absolute", right: 6, top: 6 }} onClick={() => { const m = Math.floor(((info.balance / cpt) / (1 + info.fee_pct / 100)) * cpt) / cpt; setAmt(String(Math.max(0, m))); }}>Max</button>
              </div>
              <div className="xs muted" style={{ marginTop: 4 }}>Fee {info.fee_pct}% · Available {fmtTf(info.balance, cpt)} TFUEL{info.left !== null ? ` · Left today ${fmtTf(info.left, cpt)}` : ""}</div>
              <label>Note (optional)</label>
              <input maxLength={60} placeholder="e.g. Thanks!" value={note} onChange={(e) => setNote(e.target.value)} />
              <PinField acc={acct} value={pin} onChange={setPin} say={say} purpose="send" />
              {n > 0 && (
                <div className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 14, marginBottom: 0 }}>
                  <div className="sumrow"><span className="muted">They receive</span><b className="num">{T(n)} TFUEL</b></div>
                  <div className="sumrow"><span className="muted">Fee</span><b className="num">{T(fee)} TFUEL</b></div>
                  <div className="sumrow"><span className="muted">Total</span><b className="num">{T(total)} TFUEL</b></div>
                </div>
              )}
              {n > 0 && total > bal && <div className="banner err"><Icon name="alert" size={18} /><span>Not enough TFUEL for the amount plus fee.</span></div>}
              <Cta><button className="btn block" disabled={busy || !valid} onClick={() => { setErr(""); setStage("confirm"); }}>Review &amp; send</button></Cta>
              <div className="banner warn" style={{ marginTop: 0 }}><Icon name="alert" size={18} /><span>Transfers can&apos;t be reversed. Only send to people you trust{info.min_age_hours > 0 ? `. New accounts (under ${info.min_age_hours}h) can't send` : ""}.</span></div>
            </div>
          )}
        </>
      )}

      {stage && (
        <div className="sheet-bg" onClick={() => { if (stage !== "done" && !busy) close(); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {stage === "confirm" && (
              <>
                <div className="title" style={{ fontSize: 17, marginBottom: 8 }}>Confirm transfer</div>
                <div className="card" style={{ background: "var(--soft)", boxShadow: "none" }}>
                  {rows.map(([k, v]) => <div className="sumrow" key={k}><span className="muted">{k}</span><b className="num" style={{ wordBreak: "break-all", textAlign: "right", marginLeft: 12 }}>{v}</b></div>)}
                </div>
                <div className="banner warn" style={{ marginTop: 0 }}><Icon name="alert" size={18} /><span>Check the name and ID. This can&apos;t be undone.</span></div>
                {err && <div className="banner err"><Icon name="alert" size={18} /><span>{err}</span></div>}
                <div className="grid2" style={{ marginTop: 12 }}>
                  <button className="btn sec" disabled={busy} onClick={close}>Cancel</button>
                  <button className="btn" disabled={busy} onClick={prepare}>{busy ? "Please wait…" : "Confirm"}</button>
                </div>
              </>
            )}
            {stage === "code" && (
              <>
                <div className="title" style={{ fontSize: 17, marginBottom: 4 }}>Enter the code</div>
                <div className="sub" style={{ marginBottom: 10 }}>We emailed a 6-digit code to <b>{mailTo}</b>. It&apos;s only valid for this transfer of {T(n)} TFUEL to {who}.</div>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} style={{ textAlign: "center", fontSize: 24, letterSpacing: 8 }} />
                {err && <div className="banner err"><Icon name="alert" size={18} /><span>{err}</span></div>}
                <div className="grid2" style={{ marginTop: 12 }}>
                  <button className="btn sec" disabled={busy || wait > 0} onClick={resend}>{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</button>
                  <button className="btn" disabled={busy || otp.length !== 6} onClick={() => doSend(otp)}>{busy ? "Sending…" : "Send now"}</button>
                </div>
                <button className="btn ghost" style={{ width: "100%", marginTop: 6 }} disabled={busy} onClick={close}>Cancel</button>
              </>
            )}
            {stage === "done" && tx && (
              <>
                <div style={{ textAlign: "center", marginBottom: 10 }}>
                  <div className="ico gold" style={{ margin: "0 auto 8px", width: 52, height: 52 }}><Icon name="check" size={26} /></div>
                  <div className="title" style={{ fontSize: 18 }}>Transfer completed</div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{fmtTf(tx.amount, cpt)} <span className="muted" style={{ fontSize: 14 }}>TFUEL</span></div>
                </div>
                <div className="card" style={{ background: "var(--soft)", boxShadow: "none" }}>
                  <div className="sumrow"><span className="muted">Status</span><b>Completed</b></div>
                  <div className="sumrow"><span className="muted">To</span><b style={{ textAlign: "right" }}>{tx.to.name}</b></div>
                  <div className="sumrow"><span className="muted">Recipient ID</span><b className="num">{tx.to.code}</b></div>
                  <div className="sumrow"><span className="muted">Fee</span><b className="num">{fmtTf(tx.fee, cpt)} TFUEL</b></div>
                  <div className="sumrow"><span className="muted">Time</span><b className="num">{new Date(tx.at).toLocaleString()}</b></div>
                  <div className="sumrow"><span className="muted">Transaction hash</span><b className="num" style={{ wordBreak: "break-all", textAlign: "right", marginLeft: 12, fontSize: 12 }}>{tx.txid}</b></div>
                </div>
                <div className="grid2" style={{ marginTop: 12 }}>
                  <CopyBtn text={tx.txid} label="Copy hash" />
                  <CopyBtn text={receipt} label="Copy receipt" />
                </div>
                <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => { setStage(""); setTx(null); sentRef.current = false; }}>Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

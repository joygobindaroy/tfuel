import { useEffect, useState } from "react";
import { api, errText, fmtTf } from "@/lib/client";
import { CopyBtn, ConfirmSheet, AmtInput, Cta, SkelCard, confetti } from "@/components/Ui";
import { PageHead } from "@/components/Cashier";
import { useAccount, PinField } from "@/components/Settings";
import Icon from "@/components/Icons";

type Say = (t: string, ok?: boolean) => void;
interface Info { enabled: boolean; code: string; fee_pct: number; min: number; left: number | null; daily_limit: number; min_age_hours: number; balance: number }

/** Send TFUEL: friend's transfer code → check name → amount → confirm (PIN / email code when needed) */
export function SendPage({ say, onBack, cpt, reload }: { say: Say; onBack: () => void; cpt: number; reload: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const { a: acct } = useAccount();
  const [code, setCode] = useState("");
  const [who, setWho] = useState("");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [pin, setPin] = useState("");
  const [ecode, setEcode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [done, setDone] = useState<string>("");

  const load = () => api<Info>("send", { action: "info" }).then(setInfo).catch((e) => say(errText(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const c = code.trim();
  useEffect(() => {
    setWho("");
    if (!/^[A-Za-z0-9]{10}$/.test(c)) return;
    let live = true;
    api<any>("send", { action: "lookup", code: c }).then((r) => live && setWho(r.name)).catch((e) => live && say(errText(e)));
    return () => { live = false; };
  }, [c]); // eslint-disable-line react-hooks/exhaustive-deps

  const n = Math.round((Number(amt) || 0) * cpt) / cpt; // exactly what the server will use
  const fee = info ? Math.ceil(((n * cpt) * info.fee_pct) / 100) / cpt : 0;
  const total = n + fee;
  const bal = (info?.balance || 0) / cpt;
  const min = (info?.min || 0) / cpt;
  const valid = !!info?.enabled && !!who && n >= min && total <= bal;

  const submit = async () => {
    setBusy(true);
    try {
      const r: any = await api("send", { action: "send", code: c, amount: n, note, pin, email_code: ecode });
      setDone(`Sent ${fmtTf(Math.round(n * cpt), cpt)} TFUEL to ${who}.`);
      confetti(24);
      say("Transfer sent", true);
      setAmt(""); setNote(""); setPin(""); setEcode(""); setCode(""); setWho("");
      setInfo((i) => (i ? { ...i, balance: r.balance, left: i.left === null ? null : Math.max(0, i.left - Math.round(total * cpt)) } : i));
      reload();
    } catch (e: any) {
      say(errText(e));
    } finally { setBusy(false); setAsk(false); }
  };

  return (
    <>
      <PageHead title="Send TFUEL" onBack={onBack} />
      {!info && <SkelCard rows={4} />}
      {info && !info.enabled && <div className="banner warn"><Icon name="alert" size={18} /><span>Sending TFUEL is turned off right now.</span></div>}
      {info && (
        <>
          <div className="card">
            <div className="sub">Your transfer code — share it to receive TFUEL</div>
            <div className="gap" style={{ background: "var(--soft)", borderRadius: 12, padding: "10px 12px", marginTop: 6 }}>
              <span className="num" style={{ flex: 1, fontWeight: 700, letterSpacing: 1, userSelect: "text" }}>{info.code || "—"}</span>
              {info.code && <CopyBtn text={info.code} />}
            </div>
          </div>
          {info.enabled && (
            <div className="card">
              <label style={{ marginTop: 0 }}>Friend&apos;s transfer code</label>
              <input placeholder="10 letters / numbers" maxLength={10} autoCapitalize="off" autoCorrect="off" value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} />
              {who && <div className="xs" style={{ color: "#15803d", marginTop: 4 }}>✓ {who}</div>}
              <label>Amount (TFUEL)</label>
              <div style={{ position: "relative" }}>
                <AmtInput placeholder={`Min ${fmtTf(info.min, cpt)}`} value={amt} onChange={setAmt} />
                <button className="btn sec sm" style={{ position: "absolute", right: 6, top: 6 }} onClick={() => { const m = Math.floor(((info.balance / cpt) / (1 + info.fee_pct / 100)) * cpt) / cpt; setAmt(String(Math.max(0, m))); }}>Max</button>
              </div>
              <div className="xs muted" style={{ marginTop: 4 }}>Fee {info.fee_pct}% · Available {fmtTf(info.balance, cpt)} TFUEL{info.left !== null ? ` · Left today ${fmtTf(info.left, cpt)}` : ""}</div>
              <label>Note (optional)</label>
              <input maxLength={60} placeholder="e.g. Thanks!" value={note} onChange={(e) => setNote(e.target.value)} />
              <PinField acc={acct} value={pin} onChange={setPin} ecode={ecode} onEcode={setEcode} say={say} purpose="send" details={{ amount: n, asset: "TFUEL", address: c, label: who }} />
              {n > 0 && (
                <div className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 14, marginBottom: 0 }}>
                  <div className="sumrow"><span className="muted">They receive</span><b className="num">{fmtTf(Math.round(n * cpt), cpt)} TFUEL</b></div>
                  <div className="sumrow"><span className="muted">Fee</span><b className="num">{fmtTf(Math.round(fee * cpt), cpt)} TFUEL</b></div>
                  <div className="sumrow"><span className="muted">Total</span><b className="num">{fmtTf(Math.round(total * cpt), cpt)} TFUEL</b></div>
                </div>
              )}
              {n > 0 && total > bal && <div className="banner err"><Icon name="alert" size={18} /><span>Not enough TFUEL for the amount plus fee.</span></div>}
              {done && <div className="banner success"><Icon name="check" size={18} /><span>{done}</span></div>}
              <Cta><button className="btn block" disabled={busy || !valid} onClick={() => setAsk(true)}>Review &amp; send</button></Cta>
              <div className="banner warn" style={{ marginTop: 0 }}><Icon name="alert" size={18} /><span>Transfers can&apos;t be reversed. Only send to people you trust{info.min_age_hours > 0 ? `. New accounts (under ${info.min_age_hours}h) can't send` : ""}.</span></div>
            </div>
          )}
        </>
      )}
      {ask && <ConfirmSheet title="Confirm transfer" busy={busy} confirmLabel="Send now" warn="This can't be undone." rows={[["To", who], ["Code", c], ["Amount", `${fmtTf(Math.round(n * cpt), cpt)} TFUEL`], ["Fee", `${fmtTf(Math.round(fee * cpt), cpt)} TFUEL`], ["Total", `${fmtTf(Math.round(total * cpt), cpt)} TFUEL`], ["Note", note]]} onConfirm={submit} onCancel={() => setAsk(false)} />}
    </>
  );
}

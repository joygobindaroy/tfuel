import { useEffect, useMemo, useRef, useState } from "react";
import { api, errText, fmtTf, tg } from "@/lib/client";
import { CopyBtn, AmtInput, Cta, SkelCard, confetti } from "@/components/Ui";
import { PageHead } from "@/components/Cashier";
import { useAccount, PinField } from "@/components/Settings";
import Icon from "@/components/Icons";
import { RequestTab, HistoryTab, ToolsTab, ReceiptActions, Contacts, shareLink, SaveContact, type Asset } from "@/components/SendExtra";

type Say = (t: string, ok?: boolean) => void;
interface AInfo { enabled: boolean; fee_pct: number; min: number; left: number | null; balance: number }
interface Info { enabled: boolean; code: string; cpt: number; assets: { tfuel: AInfo; usdt: AInfo }; links: { request: boolean; claim: boolean; days: number }; hold: { minutes: number; tfuel: number; usdt: number } | null; vip: { active: boolean; fee_off_pct: number }; safe_until?: number; sched?: boolean }
interface Tx { id: string; txid: string; at: number; amount: number; fee: number; to: { name: string; code: string }; asset: Asset; held: boolean; release_at: number }
interface LinkOut { url: string; exp: number; amount: number; fee: number; asset: Asset }

/** Send money: TFUEL or USDT → a person by unique ID, a money link anyone can claim, a payment request, history. Always: PIN + emailed code + confirm sheet + transaction hash. */
export function SendPage({ say, onBack, cpt, reload, top, reqId, fixedAsset }: { say: Say; onBack: () => void; cpt: number; reload: () => void; top?: React.ReactNode; reqId?: string; fixedAsset?: Asset }) {
  const [info, setInfo] = useState<Info | null>(null);
  const { a: acct } = useAccount();
  const [tab, setTab] = useState<"send" | "request" | "history" | "tools">("send");
  const [asset, setAsset] = useState<Asset>(fixedAsset || "tfuel");
  useEffect(() => { if (fixedAsset) { setAsset(fixedAsset); setAmt(""); } }, [fixedAsset]);
  const [mode, setMode] = useState<"person" | "link" | "sched">("person");
  const [pass, setPass] = useState("");
  const [hours, setHours] = useState("168");
  const [when, setWhen] = useState("");
  const [repeat, setRepeat] = useState("");
  const [rc, setRc] = useState<{ page: string; img: string } | null>(null);
  const [sch, setSch] = useState<any>(null);
  const [pr, setPr] = useState<any>(null); // payment request being paid
  const [code, setCode] = useState("");
  const [who, setWho] = useState("");
  const [first, setFirst] = useState(false);
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
  const [lk, setLk] = useState<LinkOut | null>(null);
  const [contactsKey, setContactsKey] = useState(0);
  const sentRef = useRef(false);

  const load = () => api<Info>("send", { action: "info" }).then(setInfo).catch((e) => say(errText(e)));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait((w) => w - 1), 1000); return () => clearTimeout(t); }, [wait]);
  useEffect(() => {
    if (!reqId) return;
    api<any>("send", { action: "req_info", req: reqId }).then((r) => { setPr(r.req); setAsset(r.req.asset); }).catch((e) => say(errText(e)));
  }, [reqId]); // eslint-disable-line react-hooks/exhaustive-deps

  const usdt = asset === "usdt";
  const unit = usdt ? 1e6 : cpt;
  const ai = info?.assets[asset];
  const c = code.trim();
  useEffect(() => {
    setWho(""); setFirst(false); setLookErr("");
    if (mode !== "person" || pr || !/^[A-Za-z0-9]{10}$/.test(c)) return;
    let live = true;
    setLooking(true);
    api<any>("send", { action: "lookup", code: c }).then((r) => { if (live) { setWho(r.name); setFirst(!!r.first); } }).catch((e) => live && setLookErr(errText(e))).finally(() => live && setLooking(false));
    return () => { live = false; };
  }, [c, mode, pr]);

  const paying = !!pr && pr.st === "open" && !pr.mine;
  const n = paying ? pr.amount / unit : Math.round((Number(amt) || 0) * unit) / unit; // exactly what the server will use
  const pct = ai?.fee_pct || 0;
  const fee = Math.ceil((n * unit * pct) / 100) / unit;
  const total = n + fee;
  const bal = (ai?.balance || 0) / unit;
  const min = (ai?.min || 0) / unit;
  const T = (v: number) => (usdt ? v.toFixed(2) : fmtTf(Math.round(v * cpt), cpt));
  const sym = usdt ? "USDT" : "TFUEL";
  const target = paying ? pr.name : mode === "link" ? "Anyone with the link" : who;
  const whenMs = when ? new Date(when).getTime() : 0;
  const valid = !!ai?.enabled && (paying || mode === "link" || !!who) && (mode !== "sched" || whenMs > Date.now() + 5 * 60000) && n >= min && n > 0 && total <= bal + 1e-9 && (!acct?.pin || pin.length >= 4);
  const body = (extra: object = {}) => ({ asset, amount: n, note, pin, ...(paying ? { req: pr.id } : mode === "link" ? { mode: "link", pass, hours: Number(hours) } : mode === "sched" ? { mode: "sched", code: c, when: whenMs, repeat } : { code: c }), ...extra });

  const close = () => { setStage(""); setOtp(""); setErr(""); sentRef.current = false; };
  const finish = (r: any) => {
    setRc(r.rc || null);
    if (r.link) setLk(r.link); else if (r.sched) setSch(r.sched); else setTx(r.tx);
    setStage("done"); confetti(24);
    setAmt(""); setNote(""); setPin(""); setOtp(""); setPass(""); setWhen("");
    setInfo((i) => i); load(); reload();
  };
  const doSend = async (emailCode: string) => {
    if (sentRef.current) return;
    sentRef.current = true; setBusy(true); setErr("");
    try { finish(await api("send", { action: "send", ...body({ email_code: emailCode }) })); }
    catch (e: any) { setErr(errText(e)); sentRef.current = false; } finally { setBusy(false); }
  };
  const prepare = async () => {
    setBusy(true); setErr("");
    try {
      const r: any = await api("send", { action: "prepare", ...body() });
      if (r.step === "code") { setMailTo(r.email); setStage("code"); setWait(60); setOtp(""); }
      else await doSend("");
    } catch (e: any) { setErr(errText(e)); } finally { setBusy(false); }
  };
  const resend = async () => {
    setBusy(true); setErr("");
    try { await api("send", { action: "prepare", ...body() }); setWait(60); say("A new code was sent", true); }
    catch (e: any) { setErr(errText(e)); } finally { setBusy(false); }
  };
  useEffect(() => { if (stage === "code" && /^\d{6}$/.test(otp) && !busy) doSend(otp); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [otp, stage]);

  const rows: [string, string][] = [[mode === "link" ? "Send as" : "Recipient", target], ...(mode === "sched" ? [["When", `${when.replace("T", " ")}${repeat ? " · " + repeat : ""}`] as [string, string]] : []), ...(mode === "person" || mode === "sched" ? [["Recipient ID", paying ? pr.code : c] as [string, string]] : []), ["Amount", `${T(n)} ${sym}`], ["Fee", `${T(fee)} ${sym}`], ["Total", `${T(total)} ${sym}`], ...((paying ? pr.note : note.trim()) ? [["Note", paying ? pr.note : note.trim()] as [string, string]] : [])];
  const receipt = tx ? `Transfer ${tx.held ? "scheduled" : "completed"}\nTo: ${tx.to.name} (${tx.to.code})\nAmount: ${T(tx.amount / unit)} ${sym}\nFee: ${T(tx.fee / unit)} ${sym}\nTime: ${new Date(tx.at).toISOString().replace("T", " ").slice(0, 19)} UTC\nTransaction hash: ${tx.txid}` : "";
  const holdsHere = !!info?.hold && !!ai && ((usdt ? info.hold.usdt : info.hold.tfuel) > 0) && n * unit >= (usdt ? info.hold.usdt : info.hold.tfuel);
  const showTabs = !top && !reqId && info && (info.links.request || true);

  return (
    <>
      <PageHead title={top ? "Withdraw" : reqId ? "Pay request" : "Send money"} onBack={onBack} />
      {top}
      {!info && <SkelCard rows={4} />}
      {info && !info.enabled && <div className="banner warn"><Icon name="alert" size={18} /><span>Sending is turned off right now.</span></div>}
      {info && showTabs && (
        <div className="chips" style={{ marginBottom: 10 }}>
          <button className={`chip ${tab === "send" ? "on" : ""}`} onClick={() => setTab("send")}>Send</button>
          {info.links.request && <button className={`chip ${tab === "request" ? "on" : ""}`} onClick={() => setTab("request")}>Request</button>}
          <button className={`chip ${tab === "history" ? "on" : ""}`} onClick={() => setTab("history")}>History</button>
          <button className={`chip ${tab === "tools" ? "on" : ""}`} onClick={() => setTab("tools")}>Tools</button>
        </div>
      )}
      {info && tab === "request" && showTabs && <RequestTab info={info} cpt={cpt} say={say} />}
      {info && tab === "history" && showTabs && <HistoryTab cpt={cpt} say={say} onCancelled={() => { load(); reload(); }} />}
      {info && tab === "tools" && showTabs && <ToolsTab cpt={cpt} say={say} safeUntil={info.safe_until || 0} onSafe={load} />}
      {info && (tab === "send" || !showTabs) && (
        <>
          {!reqId && (
            <div className="card">
              <div className="sub">Your unique ID — share it to receive money</div>
              <div className="gap" style={{ background: "var(--soft)", borderRadius: 12, padding: "10px 12px", marginTop: 6 }}>
                <span className="num" style={{ flex: 1, fontWeight: 700, letterSpacing: 1, userSelect: "text" }}>{info.code || "—"}</span>
                {info.code && <CopyBtn text={info.code} />}
              </div>
            </div>
          )}
          {reqId && !pr && <SkelCard rows={2} />}
          {pr && pr.st !== "open" && <div className="banner warn"><Icon name="alert" size={18} /><span>This request was already paid, cancelled or expired.</span></div>}
          {pr && pr.mine && <div className="banner warn"><Icon name="alert" size={18} /><span>This is your own request. Share the link with the person who should pay.</span></div>}
          {info.enabled && (!reqId || paying) && (
            <div className="card">
              {!paying && (
                <>
                  {!fixedAsset && (
                    <>
                      <label style={{ marginTop: 0 }}>Coin</label>
                      <div className="chips">
                        <button className={`chip ${asset === "tfuel" ? "on" : ""}`} onClick={() => { setAsset("tfuel"); setAmt(""); }}>TFUEL</button>
                        <button className={`chip ${asset === "usdt" ? "on" : ""}`} onClick={() => { setAsset("usdt"); setAmt(""); }}>USDT</button>
                      </div>
                    </>
                  )}
                  {info.links.claim && (
                    <>
                      <label>Send to</label>
                      <div className="chips">
                        <button className={`chip ${mode === "person" ? "on" : ""}`} onClick={() => setMode("person")}>A person (ID)</button>
                        <button className={`chip ${mode === "link" ? "on" : ""}`} onClick={() => setMode("link")}>Money link</button>
                        {info.sched && <button className={`chip ${mode === "sched" ? "on" : ""}`} onClick={() => setMode("sched")}>Schedule</button>}
                      </div>
                    </>
                  )}
                </>
              )}
              {paying && (
                <div className="gap" style={{ background: "var(--soft)", borderRadius: 12, padding: "10px 12px", alignItems: "center" }}>
                  <span className="ico gold" style={{ width: 34, height: 34, flexShrink: 0 }}><Icon name="user" size={16} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}><div className="title" style={{ fontSize: 15 }}>{pr.name} requests</div><div className="num" style={{ fontWeight: 800, fontSize: 20 }}>{T(n)} {sym}</div>{pr.note && <div className="xs muted">{pr.note}</div>}</div>
                </div>
              )}
              {!paying && (mode === "person" || mode === "sched") && (
                <>
                  <label>Receiver&apos;s unique ID</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input style={{ flex: 1 }} placeholder="10 letters / numbers" maxLength={10} autoCapitalize="off" autoCorrect="off" value={code} onChange={(e) => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} />
                    {typeof (tg() as any)?.showScanQrPopup === "function" && <button className="btn sec sm" type="button" onClick={() => scanQr((c) => setCode(c), say)}><Icon name="camera" size={14} /> Scan QR</button>}
                  </div>
                  <Contacts key={contactsKey} onPick={(cc, last) => { setCode(cc); if (last && !amt) { setAsset(last.a); setAmt(String(last.v)); } }} say={say} />
                  {looking && <div className="xs muted" style={{ marginTop: 6 }}>Checking…</div>}
                  {who && (
                    <div className="gap" style={{ marginTop: 8, background: "var(--soft)", borderRadius: 12, padding: "8px 12px", alignItems: "center" }}>
                      <span className="ico gold" style={{ width: 34, height: 34, flexShrink: 0 }}><Icon name="user" size={16} /></span>
                      <div style={{ flex: 1, minWidth: 0 }}><div className="title" style={{ fontSize: 15 }}>{who}</div><div className="xs muted">You are sending to this person</div></div>
                      <Icon name="check" size={18} />
                    </div>
                  )}
                  {who && first && <div className="banner warn" style={{ marginTop: 8 }}><Icon name="alert" size={18} /><span>First time sending to this person. Double-check the name and ID — transfers can&apos;t be reversed.</span></div>}
                  {lookErr && <div className="xs" style={{ color: "#dc2626", marginTop: 6 }}>{lookErr}</div>}
                </>
              )}
              {!paying && mode === "link" && (
                <>
                  <div className="xs muted" style={{ marginTop: 8 }}>You get a link. The first person who opens it claims the money. Unclaimed money returns to you when it expires. You can also cancel any time.</div>
                  <label>Valid for</label>
                  <div className="chips">{[["1", "1 hour"], ["24", "1 day"], ["168", "7 days"]].map(([h, t]) => <button key={h} className={`chip ${hours === h ? "on" : ""}`} onClick={() => setHours(h)}>{t}</button>)}</div>
                  <label>Passcode (optional)</label>
                  <input maxLength={12} autoCapitalize="off" autoCorrect="off" placeholder="3–12 letters / numbers — tell it to the receiver" value={pass} onChange={(e) => setPass(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} />
                </>
              )}
              {!paying && mode === "sched" && (
                <>
                  <label>Send on</label>
                  <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
                  <label>Repeat</label>
                  <div className="chips">{[["", "Once"], ["weekly", "Weekly"], ["monthly", "Monthly"]].map(([k, t]) => <button key={k} className={`chip ${repeat === k ? "on" : ""}`} onClick={() => setRepeat(k)}>{t}</button>)}</div>
                  <div className="xs muted" style={{ marginTop: 6 }}>The money is taken from your balance on that day. If you don&apos;t have enough, the transfer is skipped and you get a message.</div>
                </>
              )}
              {!paying && (
                <>
                  <label>Amount ({sym})</label>
                  <div style={{ position: "relative" }}>
                    <AmtInput placeholder={`Min ${T(min)}`} value={amt} onChange={setAmt} max={usdt ? 2 : 3} />
                    <button className="btn sec sm" style={{ position: "absolute", right: 6, top: 6 }} onClick={() => { const m = Math.floor((bal / (1 + pct / 100)) * unit) / unit; setAmt(String(Math.max(0, usdt ? Math.floor(m * 100) / 100 : m))); }}>Max</button>
                  </div>
                  <div className="chips" style={{ marginTop: 6 }}>{(usdt ? [1, 5, 10, 50] : [10, 50, 100, 500]).map((v) => <button key={v} className="chip" onClick={() => setAmt(String(v))}>{v}</button>)}</div>
                </>
              )}
              <div className="xs muted" style={{ marginTop: 4 }}>Fee {pct}%{info.vip.active ? " (VIP discount)" : ""} · Available {T(bal)} {sym}{ai?.left !== null && ai?.left !== undefined ? ` · Left today ${T(ai.left / unit)} ${sym}` : ""}</div>
              {!paying && (
                <>
                  <label>Note (optional)</label>
                  <input maxLength={60} placeholder="e.g. Thanks!" value={note} onChange={(e) => setNote(e.target.value)} />
                </>
              )}
              <PinField acc={acct} value={pin} onChange={setPin} say={say} purpose="send" />
              {n > 0 && (
                <div className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 14, marginBottom: 0 }}>
                  <div className="sumrow"><span className="muted">{mode === "link" ? "Link holds" : "They receive"}</span><b className="num">{T(n)} {sym}</b></div>
                  <div className="sumrow"><span className="muted">Fee</span><b className="num">{T(fee)} {sym}</b></div>
                  <div className="sumrow"><span className="muted">Total</span><b className="num">{T(total)} {sym}</b></div>
                </div>
              )}
              {n > 0 && total > bal + 1e-9 && <div className="banner err"><Icon name="alert" size={18} /><span>Not enough {sym} for the amount plus fee.</span></div>}
              {holdsHere && mode !== "link" && <div className="banner warn"><Icon name="clock" size={18} /><span>Large transfer: it is held for {info.hold!.minutes} min before arriving. You can cancel it in History until then.</span></div>}
              <Cta><button className="btn block" disabled={busy || !valid} onClick={() => { setErr(""); setStage("confirm"); }}>{mode === "link" ? "Review & create link" : mode === "sched" ? "Review & schedule" : "Review & send"}</button></Cta>
              <div className="banner warn" style={{ marginTop: 0 }}><Icon name="alert" size={18} /><span>Transfers can&apos;t be reversed once received. Only send to people you trust.</span></div>
            </div>
          )}
        </>
      )}

      {stage && (
        <div className="sheet-bg" onClick={() => { if (stage !== "done" && !busy) close(); }}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {stage === "confirm" && (
              <>
                <div className="title" style={{ fontSize: 17, marginBottom: 8 }}>{mode === "link" ? "Confirm money link" : mode === "sched" ? "Confirm schedule" : "Confirm transfer"}</div>
                <div className="card" style={{ background: "var(--soft)", boxShadow: "none" }}>
                  {rows.map(([k, v]) => <div className="sumrow" key={k}><span className="muted">{k}</span><b className="num" style={{ wordBreak: "break-all", textAlign: "right", marginLeft: 12 }}>{v}</b></div>)}
                </div>
                <div className="banner warn" style={{ marginTop: 0 }}><Icon name="alert" size={18} /><span>{mode === "link" ? "Anyone who opens the link can claim this money. Share it only with the person you mean." : "Check the name and ID. This can't be undone."}</span></div>
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
                <div className="sub" style={{ marginBottom: 10 }}>We emailed a 6-digit code to <b>{mailTo}</b>. It&apos;s only valid for this {mode === "link" ? "link" : "transfer"} of {T(n)} {sym}{mode === "link" ? "" : ` to ${target}`}.</div>
                <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus placeholder="6-digit code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} style={{ textAlign: "center", fontSize: 24, letterSpacing: 8 }} />
                {err && <div className="banner err"><Icon name="alert" size={18} /><span>{err}</span></div>}
                <div className="grid2" style={{ marginTop: 12 }}>
                  <button className="btn sec" disabled={busy || wait > 0} onClick={resend}>{wait > 0 ? `Resend in ${wait}s` : "Resend code"}</button>
                  <button className="btn" disabled={busy || otp.length !== 6} onClick={() => doSend(otp)}>{busy ? "Please wait…" : mode === "link" ? "Create link" : "Send now"}</button>
                </div>
                <button className="btn ghost" style={{ width: "100%", marginTop: 6 }} disabled={busy} onClick={close}>Cancel</button>
              </>
            )}
            {stage === "done" && lk && (
              <>
                <div style={{ textAlign: "center", marginBottom: 10 }}>
                  <div className="ico gold" style={{ margin: "0 auto 8px", width: 52, height: 52 }}><Icon name="check" size={26} /></div>
                  <div className="title" style={{ fontSize: 18 }}>Money link ready</div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{T(lk.amount / (lk.asset === "usdt" ? 1e6 : cpt))} <span className="muted" style={{ fontSize: 14 }}>{lk.asset === "usdt" ? "USDT" : "TFUEL"}</span></div>
                </div>
                <div className="addrbox"><span style={{ fontSize: 12, wordBreak: "break-all" }}>{lk.url || "Link unavailable — set the bot link in Admin → Settings"}</span></div>
                <div className="grid2" style={{ marginTop: 10 }}>
                  <CopyBtn text={lk.url} label="Copy link" />
                  <button className="btn" onClick={() => shareLink(lk.url, `I sent you ${T(lk.amount / (lk.asset === "usdt" ? 1e6 : cpt))} ${lk.asset === "usdt" ? "USDT" : "TFUEL"} on TFUEL Bot. Open this link to claim it:`)}><Icon name="send" size={15} /> Share</button>
                </div>
                <div className="xs muted" style={{ marginTop: 8 }}>Expires {new Date(lk.exp).toLocaleString()}. Manage it any time in History.</div>
                <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => { setStage(""); setLk(null); sentRef.current = false; }}>Done</button>
              </>
            )}
            {stage === "done" && sch && (
              <>
                <div style={{ textAlign: "center", marginBottom: 10 }}>
                  <div className="ico gold" style={{ margin: "0 auto 8px", width: 52, height: 52 }}><Icon name="clock" size={26} /></div>
                  <div className="title" style={{ fontSize: 18 }}>Transfer scheduled</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{T(sch.amount / unit)} {sym}</div>
                  <div className="sub">to {sch.to} · {new Date(sch.next).toLocaleString()}{sch.repeat ? ` · ${sch.repeat}` : ""}</div>
                </div>
                <div className="xs muted">Cancel it any time in Send → Tools → Scheduled.</div>
                <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => { setStage(""); setSch(null); setCode(""); setWho(""); sentRef.current = false; }}>Done</button>
              </>
            )}
            {stage === "done" && tx && (
              <>
                <div style={{ textAlign: "center", marginBottom: 10 }}>
                  <div className="ico gold" style={{ margin: "0 auto 8px", width: 52, height: 52 }}><Icon name={tx.held ? "clock" : "check"} size={26} /></div>
                  <div className="title" style={{ fontSize: 18 }}>{tx.held ? "Transfer scheduled" : "Transfer completed"}</div>
                  <div className="num" style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{T(tx.amount / unit)} <span className="muted" style={{ fontSize: 14 }}>{sym}</span></div>
                </div>
                <div className="card" style={{ background: "var(--soft)", boxShadow: "none" }}>
                  <div className="sumrow"><span className="muted">Status</span><b>{tx.held ? `On hold until ${new Date(tx.release_at).toLocaleTimeString()}` : "Completed"}</b></div>
                  <div className="sumrow"><span className="muted">To</span><b style={{ textAlign: "right" }}>{tx.to.name}</b></div>
                  <div className="sumrow"><span className="muted">Recipient ID</span><b className="num">{tx.to.code}</b></div>
                  <div className="sumrow"><span className="muted">Fee</span><b className="num">{T(tx.fee / unit)} {sym}</b></div>
                  <div className="sumrow"><span className="muted">Time</span><b className="num">{new Date(tx.at).toLocaleString()}</b></div>
                  <div className="sumrow"><span className="muted">Transaction hash</span><span style={{ display: "flex", alignItems: "flex-start", gap: 6, marginLeft: 12, minWidth: 0 }}><b className="num" style={{ wordBreak: "break-all", textAlign: "right", fontSize: 12 }}>{tx.txid}</b><CopyBtn text={tx.txid} className="btn ghost sm" size={14} /></span></div>
                </div>
                {tx.held && <div className="banner warn" style={{ marginTop: 0 }}><Icon name="clock" size={18} /><span>You can cancel this transfer from Send → History until it is released.</span></div>}
                <ReceiptActions txid={tx.txid} rc={rc} say={say} />
                <SaveContact code={tx.to.code} name={tx.to.name} say={say} onSaved={() => setContactsKey((k) => k + 1)} />
                <button className="btn" style={{ width: "100%", marginTop: 8 }} onClick={() => { setStage(""); setTx(null); setCode(""); setWho(""); sentRef.current = false; }}>Done</button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Scan someone's invite QR / link with Telegram's scanner and pull out their 10-character ID */
export function parseUserId(text: string): string {
  const t = String(text || "").trim();
  const m = /[?&]startapp=([A-Za-z0-9]{10})\b/.exec(t) || /^([A-Za-z0-9]{10})$/.exec(t);
  return m ? m[1] : "";
}
function scanQr(onCode: (c: string) => void, say: (m: string, ok?: boolean) => void) {
  const w: any = tg();
  try {
    w.showScanQrPopup({ text: "Scan the receiver's QR code" }, (data: string) => {
      const c = parseUserId(data);
      if (c) { onCode(c); try { w.closeScanQrPopup(); } catch {} return true; }
      say("That QR is not a TFUEL ID");
      try { w.closeScanQrPopup(); } catch {}
      return true;
    });
  } catch { say("Scanner not available here"); }
}

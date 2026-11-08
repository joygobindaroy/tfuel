import { useEffect, useState } from "react";
import { api, errText } from "@/lib/client";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;

const Stars = ({ v, set }: { v: number; set: (n: number) => void }) => (
  <div style={{ display: "flex", gap: 6 }}>{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`${n} stars`} onClick={() => set(n)} style={{ background: "none", border: 0, padding: 2, color: n <= v ? "#f5a623" : "#c4c9d4" }}><Icon name="star" size={30} /></button>)}</div>
);

/** Sheet to rate the app (or support) */
export function RateSheet({ kind, ticket, onClose, say }: { kind: "app" | "support"; ticket?: string; onClose: () => void; say: Say }) {
  const [s, setS] = useState(0);
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); try { await api("v22", { action: "fb", kind, stars: s, text: t, ticket }); say("Thank you for your feedback", true); onClose(); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  return (
    <div className="sheet-bg" onClick={() => !busy && onClose()}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ fontSize: 18 }}>{kind === "support" ? "How was our support?" : "How are we doing?"}</div>
        <div style={{ margin: "12px 0" }}><Stars v={s} set={setS} /></div>
        <textarea rows={3} maxLength={400} placeholder="Anything we can improve? (optional)" value={t} onChange={(e) => setT(e.target.value)} />
        <div className="grid2" style={{ marginTop: 12 }}>
          <button className="btn sec" disabled={busy} onClick={onClose}>Not now</button>
          <button className="btn" disabled={busy || !s} onClick={send}>Send</button>
        </div>
      </div>
    </div>
  );
}

/** Small home card asking for a rating (at most once a month) */
export function FeedbackAsk({ say }: { say: Say }) {
  const [ask, setAsk] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => { api<any>("v22", { action: "fbAsk" }).then((r) => setAsk(!!r.ask)).catch(() => {}); }, []);
  if (!ask) return null;
  return (
    <>
      <div className="card row" style={{ gap: 10 }}>
        <div><div className="title" style={{ fontSize: 15 }}>Enjoying the app?</div><div className="xs muted">Rate us in 10 seconds.</div></div>
        <div style={{ display: "flex", gap: 6 }}><button className="btn sm" onClick={() => setOpen(true)}>Rate</button><button className="btn sec sm" aria-label="Hide" onClick={() => setAsk(false)}><Icon name="x" size={14} /></button></div>
      </div>
      {open && <RateSheet kind="app" onClose={() => { setOpen(false); setAsk(false); }} say={say} />}
    </>
  );
}

/** Open polls / surveys. After voting the person sees the results. */
export function PollsCard({ say }: { say: Say }) {
  const [list, setList] = useState<any[]>([]);
  const [ans, setAns] = useState<Record<string, number[]>>({});
  const [busy, setBusy] = useState("");
  useEffect(() => { api<any>("v22", { action: "polls" }).then((r) => setList(r.list || [])).catch(() => {}); }, []);
  if (!list.length) return null;
  const vote = async (p: any) => {
    setBusy(p.id);
    try { const r = await api<any>("v22", { action: "vote", id: p.id, answers: ans[p.id] || [] }); setList(r.list || []); say("Thanks for voting", true); } catch (e) { say(errText(e)); } finally { setBusy(""); }
  };
  return (
    <>
      {list.map((p) => {
        const a = ans[p.id] || [];
        return (
          <div className="card" key={p.id}>
            <div className="title">{p.title}</div>
            {p.qs.map((q: any, qi: number) => (
              <div key={qi} style={{ marginTop: 10 }}>
                <div className="b">{q.q}</div>
                {q.opts.map((o: string, oi: number) => {
                  const n = p.results?.qs?.[qi]?.[oi] || 0, tot = p.results?.n || 0;
                  return p.mine ? (
                    <div key={oi} style={{ marginTop: 6 }}>
                      <div className="row xs"><span style={{ fontWeight: p.mine[qi] === oi ? 800 : 500 }}>{o}{p.mine[qi] === oi ? " ✓" : ""}</span><span className="num">{tot ? Math.round((n / tot) * 100) : 0}%</span></div>
                      <div style={{ height: 6, borderRadius: 4, background: "var(--soft, #eef0f5)" }}><div style={{ width: `${tot ? (n / tot) * 100 : 0}%`, height: 6, borderRadius: 4, background: "var(--accent, #f5a623)" }} /></div>
                    </div>
                  ) : (
                    <label key={oi} className="row" style={{ gap: 8, justifyContent: "flex-start", marginTop: 6 }}><input type="radio" name={`${p.id}-${qi}`} checked={a[qi] === oi} onChange={() => { const x = [...a]; x[qi] = oi; setAns({ ...ans, [p.id]: x }); }} style={{ width: 18, height: 18 }} /><span className="sm">{o}</span></label>
                  );
                })}
              </div>
            ))}
            {!p.mine && <button className="btn block" style={{ marginTop: 12 }} disabled={busy === p.id || a.filter((x) => x !== undefined).length < p.qs.length} onClick={() => vote(p)}>Vote</button>}
            {p.mine && <div className="xs muted" style={{ marginTop: 8 }}>{p.results?.n || 0} votes</div>}
          </div>
        );
      })}
    </>
  );
}

/** Help center with search */
export function HelpCenter({ onClose, say }: { onClose: () => void; say: Say }) {
  const [list, setList] = useState<any[] | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState("");
  const [rate, setRate] = useState(false);
  useEffect(() => { api<any>("v22", { action: "help" }).then((r) => setList(r.list || [])).catch((e) => say(errText(e))); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const f = (list || []).filter((h) => !q.trim() || (h.q + " " + h.a).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ fontSize: 18 }}>Help center</div>
        <input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 8 }} />
        <div style={{ maxHeight: "50vh", overflowY: "auto", marginTop: 8 }}>
          {!list && <div className="sub">…</div>}
          {list && !f.length && <div className="sub">Nothing found. Open a support ticket from Profile.</div>}
          {f.map((h) => (
            <div key={h.id} style={{ borderBottom: "1px solid var(--line, #e5e7eb)", padding: "10px 0" }}>
              <button className="row" style={{ width: "100%", background: "none", border: 0, textAlign: "left", padding: 0 }} onClick={() => setOpen(open === h.id ? "" : h.id)}><span className="b">{h.q}</span><Icon name="chevron" size={16} /></button>
              {open === h.id && <div className="sm" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{h.a}</div>}
            </div>
          ))}
        </div>
        <div className="grid2" style={{ marginTop: 12 }}>
          <button className="btn sec" onClick={() => setRate(true)}>Rate our support</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
        {rate && <RateSheet kind="support" onClose={() => setRate(false)} say={say} />}
      </div>
    </div>
  );
}

/** Settings: block list, report a user, note templates, quiet switches, help */
export function V22Settings({ say }: { say: Say }) {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [code, setCode] = useState("");
  const [tpl, setTpl] = useState<string[]>([]);
  const [nt, setNt] = useState("");
  const [mute, setMute] = useState({ promo: false, remind: false });
  const [help, setHelp] = useState(false);
  const [rep, setRep] = useState({ code: "", reason: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<any>("v22", { action: "blocks" }).then((r) => setBlocks(r.list || [])).catch(() => {});
    api<any>("v22", { action: "tpl" }).then((r) => setTpl(r.list || [])).catch(() => {});
    api<any>("v22", { action: "mute" }).then((r) => setMute({ promo: !!r.promo, remind: !!r.remind })).catch(() => {});
  }, []);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  const Sw = ({ k, t, h }: { k: "promo" | "remind"; t: string; h: string }) => (
    <div className="row" style={{ marginTop: 10 }}><div><div className="b">{t}</div><div className="xs muted">{h}</div></div><button type="button" aria-label={t} className={`switch ${mute[k] ? "" : "on"}`} onClick={() => run(async () => { const r = await api<any>("v22", { action: "muteSet", [k]: !mute[k] }); setMute({ promo: !!r.promo, remind: !!r.remind }); })} /></div>
  );
  return (
    <>
      <div className="card">
        <div className="title">Messages from the bot</div>
        <Sw k="promo" t="News & offers" h="Announcements sent to everyone." />
        <Sw k="remind" t="Reminders" h="Unpaid requests and unopened money links." />
        <div className="xs muted" style={{ marginTop: 8 }}>Money alerts and security messages always arrive.</div>
      </div>
      <div className="card">
        <div className="title">Note templates</div>
        <div className="sub">Quick notes you can tap in Send.</div>
        <div className="chips" style={{ marginTop: 8 }}>{tpl.map((t, i) => <button key={i} className="chip on" onClick={() => run(async () => { const r = await api<any>("v22", { action: "tplSet", list: tpl.filter((_, j) => j !== i) }); setTpl(r.list); })}>{t} ×</button>)}</div>
        {tpl.length < 8 && <div className="row" style={{ gap: 8, marginTop: 8 }}><input maxLength={40} value={nt} onChange={(e) => setNt(e.target.value)} placeholder="e.g. Rent" /><button className="btn sm" disabled={busy || !nt.trim()} onClick={() => run(async () => { const r = await api<any>("v22", { action: "tplSet", list: [...tpl, nt] }); setTpl(r.list); setNt(""); })}>Add</button></div>}
      </div>
      <div className="card">
        <div className="title">Blocked people</div>
        <div className="sub">They can&apos;t send you money or payment requests.</div>
        {blocks.map((b) => <div className="row" key={b.code} style={{ marginTop: 8 }}><span className="b">{b.name} <span className="xs muted">{b.code}</span></span><button className="btn sec sm" disabled={busy} onClick={() => run(async () => { const r = await api<any>("v22", { action: "block", code: b.code, on: false }); setBlocks(r.list); })}>Unblock</button></div>)}
        <div className="row" style={{ gap: 8, marginTop: 8 }}><input maxLength={10} value={code} onChange={(e) => setCode(e.target.value.trim())} placeholder="Their 10-character ID" /><button className="btn sm" disabled={busy || code.length !== 10} onClick={() => run(async () => { const r = await api<any>("v22", { action: "block", code }); setBlocks(r.list); setCode(""); say("Blocked", true); })}>Block</button></div>
      </div>
      <div className="card">
        <div className="title">Report a user</div>
        <div className="sub">Scam, abuse or a suspicious request. Our team reviews every report.</div>
        <input maxLength={10} value={rep.code} onChange={(e) => setRep({ ...rep, code: e.target.value.trim() })} placeholder="Their 10-character ID" style={{ marginTop: 8 }} />
        <textarea rows={2} maxLength={300} value={rep.reason} onChange={(e) => setRep({ ...rep, reason: e.target.value })} placeholder="What happened?" style={{ marginTop: 8 }} />
        <button className="btn block" style={{ marginTop: 8 }} disabled={busy || rep.code.length !== 10 || rep.reason.trim().length < 5} onClick={() => run(async () => { await api("v22", { action: "report", code: rep.code, reason: rep.reason }); setRep({ code: "", reason: "" }); say("Report sent. Thank you.", true); })}>Send report</button>
      </div>
      <button className="btn sec block" onClick={() => setHelp(true)}><Icon name="help" size={16} /> Help center</button>
      {help && <HelpCenter onClose={() => setHelp(false)} say={say} />}
    </>
  );
}

/** Note chips in Send */
export function NoteChips({ onPick }: { onPick: (t: string) => void }) {
  const [tpl, setTpl] = useState<string[]>([]);
  useEffect(() => { api<any>("v22", { action: "tpl" }).then((r) => setTpl(r.list || [])).catch(() => {}); }, []);
  if (!tpl.length) return null;
  return <div className="chips" style={{ marginTop: 6 }}>{tpl.map((t, i) => <button key={i} type="button" className="chip" onClick={() => onPick(t)}>{t}</button>)}</div>;
}

/** Invite QR sheet (picture is made on the phone; the site address is not shown) */
export function QrSheet({ link, onClose, title = "Scan to join" }: { link: string; onClose: () => void; title?: string }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
        <div className="title" style={{ fontSize: 18 }}>{title}</div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/qr?d=${encodeURIComponent(link)}`} alt="QR code" width={240} height={240} style={{ margin: "12px auto", borderRadius: 12, display: "block" }} />
        <button className="btn block" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

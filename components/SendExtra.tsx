import { useEffect, useMemo, useState } from "react";
import { api, errText, fmtTf } from "@/lib/client";
import { CopyBtn, AmtInput, SkelList, confetti } from "@/components/Ui";
import Icon from "@/components/Icons";

type Say = (t: string, ok?: boolean) => void;
export type Asset = "tfuel" | "usdt";

export function shareLink(url: string, text: string) {
  const w: any = typeof window !== "undefined" ? window : null;
  const u = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  try { w?.Telegram?.WebApp?.openTelegramLink ? w.Telegram.WebApp.openTelegramLink(u) : w?.open(u, "_blank"); } catch {}
}
const money = (a: Asset, v: number, cpt: number) => (a === "usdt" ? `${(v / 1e6).toFixed(2)} USDT` : `${fmtTf(v, cpt)} TFUEL`);
const when = (t: number) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Receipt buttons: open the printable page, get the picture, or have the bot send it to your chat */
export function ReceiptActions({ txid, rc, say }: { txid: string; rc?: { page: string; img: string } | null; say: Say }) {
  const [busy, setBusy] = useState("");
  const abs = (u: string) => (u.startsWith("/") ? window.location.origin + u : u);
  const openUrl = (u: string) => { const w: any = window; try { w.Telegram?.WebApp?.openLink ? w.Telegram.WebApp.openLink(abs(u)) : w.open(abs(u), "_blank"); } catch {} };
  const links = async () => rc || (await api<any>("send", { action: "receipt_link", txid }));
  const run = async (k: "page" | "img" | "bot") => {
    setBusy(k);
    try {
      if (k === "bot") { await api("send", { action: "receipt_bot", txid }); say("Receipt sent to your bot chat", true); }
      else { const l: any = await links(); openUrl(k === "page" ? l.page : l.img); }
    } catch (e) { say(errText(e)); } finally { setBusy(""); }
  };
  return (
    <div className="grid2" style={{ marginTop: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
      <button className="btn sec sm" disabled={!!busy} onClick={() => run("page")}>🧾 Open / print</button>
      <button className="btn sec sm" disabled={!!busy} onClick={() => run("img")}>⬇ Image</button>
      <button className="btn sec sm" disabled={!!busy} onClick={() => run("bot")}>🤖 To bot</button>
    </div>
  );
}

/** Saved people (trusted contacts): tap to fill the ID */
export function Contacts({ onPick, say }: { onPick: (code: string) => void; say: Say }) {
  const [items, setItems] = useState<{ code: string; name: string; label: string }[]>([]);
  const [edit, setEdit] = useState(false);
  const [recent, setRecent] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => { api<any>("send", { action: "contacts" }).then((r) => setItems(r.items)).catch(() => {}); api<any>("send", { action: "recent" }).then((r) => setRecent(r.items)).catch(() => {}); }, []);
  const rec = recent.filter((r) => !items.some((c) => c.code === r.code));
  if (!items.length && !rec.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {rec.length > 0 && (
        <>
          <div className="xs muted" style={{ marginBottom: 4 }}>Recent</div>
          <div className="chips" style={{ marginBottom: 6 }}>{rec.map((r) => <button key={r.code} className="chip" onClick={() => onPick(r.code)}>{r.name}</button>)}</div>
        </>
      )}
      {items.length > 0 && <>
      <div className="row" style={{ marginBottom: 4 }}><div className="xs muted">Saved people</div><button className="btn ghost sm" onClick={() => setEdit(!edit)}>{edit ? "Done" : "Edit"}</button></div>
      <div className="chips">
        {items.map((c) => (
          <span key={c.code} style={{ display: "inline-flex", gap: 4 }}>
            <button className="chip" onClick={() => onPick(c.code)}>{c.label || c.name}</button>
            {edit && <button className="chip" aria-label="Remove" onClick={async () => { try { const r: any = await api("send", { action: "contact_del", code: c.code }); setItems(r.items); } catch (e) { say(errText(e)); } }}>✕</button>}
          </span>
        ))}
      </div>
      </>}
    </div>
  );
}
export function SaveContact({ code, name, say, onSaved }: { code: string; name: string; say: Say; onSaved: () => void }) {
  const [label, setLabel] = useState(name);
  const [ok, setOk] = useState(false);
  if (ok) return <div className="xs muted" style={{ marginTop: 8, textAlign: "center" }}>Saved to your contacts ✓</div>;
  return (
    <div className="gap" style={{ marginTop: 10 }}>
      <input style={{ flex: 1 }} maxLength={24} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Save as…" />
      <button className="btn sec" onClick={async () => { try { await api("send", { action: "contact_save", code, label }); setOk(true); onSaved(); } catch (e) { say(errText(e)); } }}>Save contact</button>
    </div>
  );
}

/** Ask someone to pay you: creates a link / QR, lists open requests */
export function RequestTab({ info, cpt, say }: { info: any; cpt: number; say: Say }) {
  const [asset, setAsset] = useState<Asset>("tfuel");
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [split, setSplit] = useState("1");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState<any[] | null>(null);
  const [made, setMade] = useState<{ url: string; amount: number; asset: Asset } | null>(null);
  const load = () => api<any>("send", { action: "req_list" }).then((r) => setItems(r.items)).catch(() => setItems([]));
  useEffect(() => { load(); }, []);
  const sym = asset === "usdt" ? "USDT" : "TFUEL";
  const create = async () => {
    setBusy(true);
    try {
      const r: any = await api("send", { action: "req_create", asset, amount: Number(amt), note, split: Number(split) || 1 });
      setMade({ url: r.url, amount: Number(amt), asset }); setAmt(""); setNote(""); confetti(10); load();
    } catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="card">
        <div className="title">Request money</div>
        <div className="sub">Make a link. Whoever opens it sees your name and the amount, and pays in two taps.</div>
        <label>Coin</label>
        <div className="chips">
          <button className={`chip ${asset === "tfuel" ? "on" : ""}`} onClick={() => setAsset("tfuel")}>TFUEL</button>
          <button className={`chip ${asset === "usdt" ? "on" : ""}`} onClick={() => setAsset("usdt")}>USDT</button>
        </div>
        <label>Amount ({sym})</label>
        <AmtInput placeholder="0" value={amt} onChange={setAmt} max={asset === "usdt" ? 2 : 3} />
        <label>Split between how many people? (each pays this amount)</label>
        <div className="chips">{["1", "2", "3", "4", "5", "10"].map((k) => <button key={k} className={`chip ${split === k ? "on" : ""}`} onClick={() => setSplit(k)}>{k === "1" ? "Just one" : k}</button>)}</div>
        {Number(split) > 1 && Number(amt) > 0 && <div className="xs muted" style={{ marginTop: 4 }}>You will receive {(Number(amt) * Number(split)).toLocaleString("en-US", { maximumFractionDigits: 6 })} {sym} in total when all {split} have paid.</div>}
        <label>Note (optional)</label>
        <input maxLength={60} placeholder="e.g. Dinner" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn block" style={{ marginTop: 12 }} disabled={busy || !(Number(amt) > 0)} onClick={create}>{busy ? "Please wait…" : "Create request link"}</button>
      </div>
      {made && (
        <div className="card">
          <div className="title">Request ready</div>
          <div className="addrbox" style={{ marginTop: 6 }}><span style={{ fontSize: 12, wordBreak: "break-all" }}>{made.url || "Link unavailable — set the bot link in Admin → Settings"}</span></div>
          <div className="grid2" style={{ marginTop: 8 }}>
            <CopyBtn text={made.url} label="Copy link" />
            <button className="btn" onClick={() => shareLink(made.url, `Please pay me ${money(made.asset, Math.round(made.amount * (made.asset === "usdt" ? 1e6 : cpt)), cpt)} on TFUEL Bot:`)}><Icon name="send" size={15} /> Share</button>
          </div>
        </div>
      )}
      <div className="card">
        <div className="title" style={{ fontSize: 14 }}>My requests</div>
        {items === null && <SkelList n={2} />}
        {items && items.length === 0 && <div className="small muted">No requests yet.</div>}
        {items?.map((r) => (
          <div className="hist" key={r.id}>
            <div style={{ minWidth: 0 }}>
              <div className="title" style={{ fontSize: 14 }}>{money(r.asset, r.amount, cpt)} <span className={`tag ${r.st === "paid" ? "ok" : r.st === "open" ? "warn" : "err"}`}>{r.st}</span>{r.n > 1 && <span className="tag info">{r.paid || 0}/{r.n} paid</span>}</div>
              <div className="sub">{r.note || "—"} · {when(r.at)}</div>
            </div>
            {(r.st === "open" || r.st === "paying") && (
              <div className="gap">
                <CopyBtn text={r.url} label="Copy" />
                <button className="btn danger sm" onClick={async () => { try { const x: any = await api("send", { action: "req_cancel", id: r.id }); setItems(x.items); } catch (e) { say(errText(e)); } }}>Cancel</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/** All transfers (sent / received / links / held) with search, filters, CSV export, cancel */
export function HistoryTab({ cpt, say, onCancelled }: { cpt: number; say: Say; onCancelled: () => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [f, setF] = useState<"all" | "in" | "out">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const [rep, setRep] = useState<any>(null);
  const [off, setOff] = useState(0);
  const [opn, setOpn] = useState("");
  useEffect(() => { api<any>("send", { action: "report", offset: off }).then(setRep).catch(() => {}); }, [off]);
  const dispute = async (id: string) => {
    const reason = prompt("What is wrong with this transfer? (the support team will look into it)");
    if (!reason) return;
    try { await api("send", { action: "dispute", id, reason }); say("Reported. Support will contact you.", true); load(); } catch (e) { say(errText(e)); }
  };
  const load = () => {
    api<any>("send", { action: "history" }).then((r) => setItems(r.items)).catch((e) => { say(errText(e)); setItems([]); });
    api<any>("send", { action: "link_list" }).then((r) => setLinks(r.items)).catch(() => {});
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = useMemo(() => (items || []).filter((x) => (f === "all" || x.d === f) && (!q.trim() || `${x.tx} ${x.peer} ${x.pc} ${x.n}`.toLowerCase().includes(q.trim().toLowerCase()))), [items, f, q]);
  const exportCsv = () => {
    const esc = (v: unknown) => { const t = String(v ?? ""); return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const lines = [["Date (UTC)", "Direction", "Coin", "Amount", "Fee", "Person", "Person ID", "Status", "Note", "Transaction hash"].join(",")];
    for (const x of shown) lines.push([new Date(x.at).toISOString().replace("T", " ").slice(0, 19), x.d === "in" ? "Received" : "Sent", x.a === "usdt" ? "USDT" : "TFUEL", x.a === "usdt" ? x.amt / 1e6 : x.amt / cpt, x.a === "usdt" ? x.fee / 1e6 : x.fee / cpt, x.peer, x.pc, x.st, x.n, x.tx].map(esc).join(","));
    const el = document.createElement("a");
    el.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    el.download = `tfuel-transfers-${new Date().toISOString().slice(0, 10)}.csv`;
    el.click();
    setTimeout(() => URL.revokeObjectURL(el.href), 4000);
  };
  const cancelHold = async (id: string) => {
    if (!confirm("Cancel this transfer and get your money back?")) return;
    setBusy(id);
    try { await api("send", { action: "cancel", id }); say("Transfer cancelled", true); load(); onCancelled(); } catch (e) { say(errText(e)); } finally { setBusy(""); }
  };
  const openLinks = links.filter((l) => l.st === "open");
  return (
    <>
      {openLinks.length > 0 && (
        <div className="card">
          <div className="title" style={{ fontSize: 14 }}>My open money links</div>
          {openLinks.map((l) => (
            <div className="hist" key={l.id}>
              <div style={{ minWidth: 0 }}><div className="title" style={{ fontSize: 14 }}>{money(l.asset, l.amount, cpt)}</div><div className="sub">{l.note || "—"} · expires {new Date(l.exp).toLocaleDateString()}</div></div>
              <div className="gap">
                {l.url && <CopyBtn text={l.url} label="Copy" />}
                <button className="btn danger sm" disabled={busy === l.id} onClick={async () => { if (!confirm("Cancel this link and refund yourself?")) return; setBusy(l.id); try { await api("send", { action: "link_cancel", id: l.id }); say("Link cancelled — refunded", true); load(); onCancelled(); } catch (e) { say(errText(e)); } finally { setBusy(""); } }}>Cancel</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {rep && (rep.tfuel.n > 0 || rep.usdt.n > 0 || off > 0) && (
        <div className="card">
          <div className="row"><div className="title" style={{ fontSize: 14 }}>Spending report · {rep.month}</div><div className="gap"><button className="btn ghost sm" onClick={() => setOff(off + 1)}>‹</button><button className="btn ghost sm" disabled={off === 0} onClick={() => setOff(Math.max(0, off - 1))}>›</button></div></div>
          {(["tfuel", "usdt"] as const).filter((k) => rep[k].n > 0).map((k) => (
            <div key={k} style={{ marginTop: 6 }}>
              <div className="xs muted">{k === "usdt" ? "USDT" : "TFUEL"} · {rep[k].n} transfers</div>
              <div className="sumrow"><span className="muted">Sent</span><b className="num">{rep[k].sent.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
              <div className="sumrow"><span className="muted">Received</span><b className="num">{rep[k].recv.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
              <div className="sumrow"><span className="muted">Fees paid</span><b className="num">{rep[k].fee.toLocaleString("en-US", { maximumFractionDigits: 4 })}</b></div>
            </div>
          ))}
          {rep.top.length > 0 && <div className="xs muted" style={{ marginTop: 6 }}>Most active with: {rep.top.join(", ")}</div>}
          {rep.tfuel.n === 0 && rep.usdt.n === 0 && <div className="small muted">No transfers this month.</div>}
        </div>
      )}
      <div className="card">
        <input placeholder="Search name, ID or transaction hash" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="chips" style={{ marginTop: 8 }}>
          {(["all", "in", "out"] as const).map((k) => <button key={k} className={`chip ${f === k ? "on" : ""}`} onClick={() => setF(k)}>{k === "all" ? "All" : k === "in" ? "Received" : "Sent"}</button>)}
        </div>
        {items === null && <SkelList n={3} />}
        {items && shown.length === 0 && <div className="small muted" style={{ marginTop: 10 }}>No transfers found.</div>}
        {shown.map((x) => (
          <div className="hist" key={x.id}>
            <div style={{ minWidth: 0 }}>
              <div className="title" style={{ fontSize: 14, color: x.d === "in" ? "#15803d" : undefined }}>{x.d === "in" ? "+" : "−"}{money(x.a, x.amt, cpt)} {x.st === "held" && <span className="tag warn">on hold</span>}{x.st === "cancelled" && <span className="tag err">cancelled</span>}{x.st === "claimed" && <span className="tag ok">claimed</span>}</div>
              <div className="sub">{x.d === "in" ? "From" : "To"} {x.peer} · {when(x.at)}{x.n ? ` · ${x.n}` : ""}</div>
              <div className="xs muted" style={{ wordBreak: "break-all" }}>{x.tx}</div>
              {opn === x.id && (
                <>
                  <ReceiptActions txid={x.tx} say={say} />
                  <button className="btn ghost sm" style={{ marginTop: 4 }} disabled={!!x.dispute} onClick={() => dispute(x.id)}>{x.dispute ? "Reported ✓" : "⚠️ Report a problem"}</button>
                </>
              )}
            </div>
            <div className="gap" style={{ flexDirection: "column", alignItems: "flex-end" }}>
              <CopyBtn text={x.tx} label="Hash" />
              {(x.st === "done" || x.st === "claimed") && <button className="btn sec sm" onClick={() => setOpn(opn === x.id ? "" : x.id)}>Receipt</button>}
              {x.st === "held" && <button className="btn danger sm" disabled={busy === x.id} onClick={() => cancelHold(x.id)}>Cancel</button>}
            </div>
          </div>
        ))}
        {shown.length > 0 && <button className="btn sec block" style={{ marginTop: 10 }} onClick={exportCsv}><Icon name="download" size={15} /> Export CSV ({shown.length})</button>}
      </div>
    </>
  );
}

/** Opens from a money link (?startapp=claim_…): shows who sent what and lets the user claim it */
export function ClaimSheet({ token, say, onClose, reload }: { token: string; say: Say; onClose: () => void; reload: () => void }) {
  const [l, setL] = useState<any>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<any>(null);
  const [pass, setPass] = useState("");
  useEffect(() => { api<any>("send", { action: "claim_info", token }).then((r) => setL(r.link)).catch((e) => setErr(errText(e))); }, [token]);
  const claim = async () => {
    setBusy(true); setErr("");
    try { const r: any = await api("send", { action: "claim", token, pass }); setDone(r); confetti(30); reload(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return (
    <div className="sheet-bg" onClick={() => !busy && onClose()}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {!l && !err && <SkelList n={2} />}
        {err && !done && <div className="banner err"><Icon name="alert" size={18} /><span>{err}</span></div>}
        {l && !done && (
          <>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div className="ico gold" style={{ margin: "0 auto 8px", width: 52, height: 52 }}><Icon name="gift" size={26} /></div>
              <div className="title" style={{ fontSize: 18 }}>{l.from} sent you money</div>
              <div className="num" style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{money(l.asset, l.amount, 1000)}</div>
              {l.note && <div className="sub" style={{ marginTop: 4 }}>“{l.note}”</div>}
            </div>
            {l.st !== "open" && <div className="banner warn"><Icon name="alert" size={18} /><span>This link was already claimed, cancelled or expired.</span></div>}
            {l.pass && l.st === "open" && <><label>Passcode (ask the sender)</label><input autoCapitalize="off" autoCorrect="off" maxLength={12} value={pass} onChange={(e) => setPass(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} /></>}
            <button className="btn block" style={{ marginTop: 8 }} disabled={busy || l.st !== "open" || (l.pass && pass.length < 3)} onClick={claim}>{busy ? "Please wait…" : "Claim now"}</button>
          </>
        )}
        {done && (
          <>
            <div style={{ textAlign: "center", marginBottom: 10 }}>
              <div className="ico gold" style={{ margin: "0 auto 8px", width: 52, height: 52 }}><Icon name="check" size={26} /></div>
              <div className="title" style={{ fontSize: 18 }}>Claimed!</div>
              <div className="num" style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>{money(done.asset, done.amount, 1000)}</div>
              <div className="xs muted" style={{ marginTop: 6, wordBreak: "break-all" }}>Transaction hash: {done.txid}</div>
              <ReceiptActions txid={done.txid} say={say} />
            </div>
          </>
        )}
        <button className="btn sec block" style={{ marginTop: 8 }} disabled={busy} onClick={onClose}>{done ? "Done" : "Close"}</button>
      </div>
    </div>
  );
}

/** Tools: scheduled sends, monthly report, safe mode */
export function ToolsTab({ cpt, say, safeUntil, onSafe }: { cpt: number; say: Say; safeUntil: number; onSafe: () => void }) {
  const [off, setOff] = useState(0);
  const [rep, setRep] = useState<any>(null);
  const [sch, setSch] = useState<any[] | null>(null);
  useEffect(() => { api<any>("send", { action: "report", offset: off }).then(setRep).catch((e) => say(errText(e))); }, [off]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api<any>("send", { action: "sched_list" }).then((r) => setSch(r.items)).catch(() => setSch([])); }, []);
  const safeOn = safeUntil > Date.now();
  const setSafe = async (hours: number) => { try { await api("send", { action: "safe", hours }); say(hours ? "Safe mode is on" : "Safe mode is off", true); onSafe(); } catch (e) { say(errText(e)); } };
  const Row = ({ k, a, u }: { k: string; a: any; u: string }) => <div className="sumrow"><span className="muted">{k}</span><b className="num">{a.n ? `Sent ${a.sent.toLocaleString("en-US", { maximumFractionDigits: 2 })} · Got ${a.recv.toLocaleString("en-US", { maximumFractionDigits: 2 })} · Fee ${a.fee.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${u}` : "—"}</b></div>;
  return (
    <>
      <div className="card">
        <div className="title" style={{ fontSize: 14 }}>Safe mode</div>
        <div className="sub">Blocks every money-out (sends, withdrawals, links) while it is on. You can switch it off yourself any time.</div>
        {safeOn ? <><div className="banner warn" style={{ marginTop: 8 }}><Icon name="alert" size={18} /><span>On until {when(safeUntil)}</span></div><button className="btn sec" onClick={() => setSafe(0)}>Turn off</button></>
          : <div className="chips" style={{ marginTop: 8 }}>{[[24, "24 hours"], [72, "3 days"], [168, "7 days"]].map(([h, t]) => <button key={h} className="chip" onClick={() => setSafe(Number(h))}>{t}</button>)}</div>}
      </div>
      <div className="card">
        <div className="row"><div className="title" style={{ fontSize: 14 }}>Monthly report</div><div className="chips">{[0, 1, 2].map((o) => <button key={o} className={`chip ${off === o ? "on" : ""}`} onClick={() => setOff(o)}>{o === 0 ? "This month" : o === 1 ? "Last month" : "2 months ago"}</button>)}</div></div>
        {!rep ? <SkelList n={2} /> : (
          <>
            <div className="xs muted" style={{ margin: "6px 0" }}>{rep.month}</div>
            <Row k="TFUEL" a={rep.tfuel} u="TFUEL" />
            <Row k="USDT" a={rep.usdt} u="USDT" />
            {rep.top?.length > 0 && <div className="sumrow"><span className="muted">Top people</span><b>{rep.top.join(", ")}</b></div>}
          </>
        )}
      </div>
      <div className="card">
        <div className="title" style={{ fontSize: 14 }}>Scheduled</div>
        {sch === null && <SkelList n={2} />}
        {sch && sch.length === 0 && <div className="small muted">Nothing scheduled. Use Send → Schedule.</div>}
        {sch?.map((x) => (
          <div className="hist" key={x.id}>
            <div style={{ minWidth: 0 }}><div className="b">{money(x.asset, x.amount, cpt)} → {x.to}</div><div className="xs muted">{x.st === "active" ? `Next ${when(x.next)}` : x.st}{x.repeat ? ` · ${x.repeat}` : ""} · sent {x.n}×</div></div>
            {x.st === "active" && <button className="btn danger sm" onClick={async () => { try { const r: any = await api("send", { action: "sched_cancel", id: x.id }); setSch(r.items); } catch (e) { say(errText(e)); } }}>Cancel</button>}
          </div>
        ))}
      </div>
    </>
  );
}

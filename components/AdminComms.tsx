import { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/Icons";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
interface Tpl { title: string; text: string }
const TAGS = ["deposit", "withdraw", "bug", "other"];
const when = (t?: number) => (t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const audLabel = (a: any) => (!a ? "All" : a.kind === "active" ? `Active ${a.days}d` : a.kind === "tag" ? `Tag: ${a.tag}` : a.kind === "country" ? `Country: ${a.country}` : "All users");
const toMs = (v: string) => (v ? new Date(v).getTime() : 0);

const KIND_LABEL: Record<string, string> = { price: "Price update", top: "Top earners of the week", invite: "Invite card (join banner)", tour: "Live tournament", custom: "My own message (rotates)" };
const bdHour = (h: number) => (h + 6) % 24;
const utcHour = (h: number) => (h - 6 + 24) % 24;
/** Auto-post types: pick what the bot posts to your group / channel, when, and how often */
function AutoPostCard({ call }: { call: Call }) {
  const [rules, setRules] = useState<any[] | null>(null);
  const [errs, setErrs] = useState<Record<string, any>>({});
  const [wel, setWel] = useState<any>({ enabled: false, text: "" });
  const [winpost, setWinpost] = useState(true);
  const [log, setLog] = useState<any[]>([]);
  const load = useCallback(async () => { const r: any = await call({ action: "autopostGet" }); if (r) { setRules(r.rules); setErrs(r.errs || {}); setWel(r.welcome || { enabled: false, text: "" }); setWinpost(r.winpost !== false); setLog(r.log || []); } }, [call]);
  useEffect(() => { load(); }, [load]);
  if (!rules) return null;
  const up = (i: number, p: any) => setRules(rules.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const add = (kind: string) => setRules([...rules, { id: "r" + Date.now().toString(36), kind, on: true, hour: utcHour(20), every: kind === "top" ? 7 : 1, text: "", image: true, btn: "" }]);
  return (
    <div className="card">
      <div className="title">Auto-post types</div>
      <div className="sub">The bot posts these to your group / channel by itself. Turn on “Auto-post” in Channels &amp; groups above. Times are Bangladesh time.</div>
      {rules.length === 0 && <div className="xs muted" style={{ marginTop: 8 }}>No auto-posts yet. Add one below.</div>}
      {rules.map((r, i) => (
        <div key={r.id} style={{ border: "1px solid var(--line, #e5e7eb)", borderRadius: 12, padding: 12, marginTop: 10 }}>
          <div className="row"><div className="b">{KIND_LABEL[r.kind] || r.kind}</div><input type="checkbox" checked={!!r.on} onChange={(e) => up(i, { on: e.target.checked })} /></div>
          <div className="grid2" style={{ marginTop: 6 }}>
            <div><label>Post at (Bangladesh hour 0–23)</label><input inputMode="numeric" value={bdHour(Number(r.hour) || 0)} onChange={(e) => up(i, { hour: utcHour(Math.min(23, Math.max(0, Number(e.target.value) || 0))) })} /></div>
            <div><label>Every N days</label><input inputMode="numeric" value={r.every} onChange={(e) => up(i, { every: e.target.value })} /></div>
          </div>
          <div className="grid2" style={{ marginTop: 6 }}>
            <div><label>Button text (optional)</label><input maxLength={24} value={r.btn} onChange={(e) => up(i, { btn: e.target.value })} placeholder="Open app" /></div>
            {r.kind === "invite" && <div><label>Show the card picture</label><input type="checkbox" checked={r.image !== false} onChange={(e) => up(i, { image: e.target.checked })} /></div>}
          </div>
          {(r.kind === "custom" || r.kind === "invite") && <div style={{ marginTop: 6 }}><label>{r.kind === "custom" ? "Message — separate several messages with a line containing ===" : "Caption (optional)"}</label><textarea rows={r.kind === "custom" ? 5 : 2} maxLength={1500} value={r.text} onChange={(e) => up(i, { text: e.target.value })} /></div>}
          {errs[r.id] && <div className="xs" style={{ color: "#dc2626", marginTop: 6 }}>Last problem: {errs[r.id].err} · {when(errs[r.id].at)}</div>}
          <div className="gap" style={{ marginTop: 8 }}>
            <button className="btn sec sm" onClick={async () => { await call({ action: "autopostNow", rules: [r] }, "Posted"); load(); }}>Post now (test)</button>
            <button className="btn danger sm" onClick={() => setRules(rules.filter((_, j) => j !== i))}>Remove</button>
          </div>
        </div>
      ))}
      <div style={{ border: "1px solid var(--line, #e5e7eb)", borderRadius: 12, padding: 12, marginTop: 10 }}>
        <div className="row"><div><div className="b">Welcome new group members</div><div className="xs muted">Bot greets each new member of your group (add the bot to the group first).</div></div><input type="checkbox" checked={!!wel.enabled} onChange={(e) => setWel({ ...wel, enabled: e.target.checked })} /></div>
        <textarea rows={2} maxLength={300} style={{ marginTop: 6 }} value={wel.text} onChange={(e) => setWel({ ...wel, text: e.target.value })} placeholder="Glad you are here! Tap the button to start earning TFUEL." />
        <div className="row" style={{ marginTop: 8 }}><div><div className="b">Post winner cards</div><div className="xs muted">When a tournament ends, the #1 win card is posted to the channel.</div></div><input type="checkbox" checked={winpost} onChange={(e) => setWinpost(e.target.checked)} /></div>
      </div>
      <div className="chips" style={{ marginTop: 12 }}>{Object.entries(KIND_LABEL).map(([k, t]) => <button key={k} className="pill" onClick={() => add(k)}>+ {t}</button>)}</div>
      <button className="btn" style={{ marginTop: 12 }} onClick={async () => { const r: any = await call({ action: "autopostSave", rules, welcome: wel, winpost }, "Auto-posts saved"); if (r) { setRules(r.rules); setWel(r.welcome); setWinpost(r.winpost !== false); } }}>Save auto-posts</button>
      {log.length > 0 && <div style={{ marginTop: 14 }}><div className="b">Recent posts</div>{log.slice(0, 15).map((x: any) => <div key={x.id} className="xs" style={{ marginTop: 4, color: x.ok ? undefined : "#dc2626" }}>{when(x.at)} · {KIND_LABEL[x.kind] || x.kind}{x.pic ? " · with picture" : ""} · {x.ok ? "sent" : x.err}</div>)}</div>}
    </div>
  );
}

/** Admin → Communication */
function ChatsCard({ call, onSaved }: { call: Call; onSaved: () => void }) {
  const [d, setD] = useState<any>(null);
  const [f, setF] = useState<any>({ alert_chat: "", autopost_channel: "" });
  const load = useCallback(async () => { const r: any = await call({ action: "chatsList" }); if (r) { setD(r); setF({ alert_chat: r.alert_chat || "", autopost_channel: r.autopost_channel || "" }); } }, [call]);
  useEffect(() => { load(); }, [load]);
  if (!d) return null;
  const save = async (p: any, m = "Saved") => { const r: any = await call({ action: "chatsSave", ...p }, m); if (r) { load(); onSaved(); } };
  return (
    <div className="card">
      <div className="title">Channels & groups</div>
      <div className="sub">Where the bot posts and where admin alerts go. <b>1)</b> Create a Telegram channel or group. <b>2)</b> Add your bot to it — for a channel make the bot an <b>administrator</b> with permission to post. <b>3)</b> It appears below (press “Connect Telegram” in Settings once after updating). Tap what it should be used for.</div>
      {d.chats.length === 0 && <div className="xs muted" style={{ marginTop: 8 }}>No channel or group found yet. Add the bot to one, or type the ID/@name by hand below.</div>}
      {d.chats.map((c: any) => (
        <div className="row" key={c.id} style={{ marginTop: 8 }}>
          <div style={{ minWidth: 0 }}><div className="b">{c.title || c.username || c.id}</div><div className="xs muted">{c.type}{c.username ? " · " + c.username : ""} · ID {c.id} · bot is {c.status}</div></div>
          <div className="gap">
            <button className="btn sec sm" onClick={() => save({ alert_chat: c.id }, "Admin alerts will go here")}>Use for alerts</button>
            {c.type === "channel" || String(c.id).startsWith("-100") ? <button className="btn sec sm" onClick={() => save({ autopost_channel: c.username || c.id }, "Channel set")}>Use as channel</button> : null}
          </div>
        </div>
      ))}
      <div className="grid2" style={{ marginTop: 12 }}>
        <div><label>Admin alerts chat ID (your ID or a group ID)</label><input value={f.alert_chat} onChange={(e) => setF({ ...f, alert_chat: e.target.value })} placeholder="e.g. 123456789 or -1001234567890" /></div>
        <div><label>Channel for posts (@name or -100… ID)</label><input value={f.autopost_channel} onChange={(e) => setF({ ...f, autopost_channel: e.target.value })} placeholder="@mychannel" /></div>
      </div>
      <div className="row" style={{ marginTop: 10 }}><div><div className="title" style={{ fontSize: 14 }}>Auto-post to the channel</div><div className="sub">Scheduled / automatic posts (needs a channel above).</div></div><input type="checkbox" checked={!!d.autopost_enabled} onChange={(e) => save({ autopost_enabled: e.target.checked })} style={{ width: 22, height: 22 }} /></div>
      <div className="row" style={{ marginTop: 6 }}><div><div className="title" style={{ fontSize: 14 }}>Post weekly winners</div><div className="sub">Every week the top players are announced in the channel.</div></div><input type="checkbox" checked={!!d.autopost_winners} onChange={(e) => save({ autopost_winners: e.target.checked })} style={{ width: 22, height: 22 }} /></div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => save({ alert_chat: f.alert_chat, autopost_channel: f.autopost_channel })}>Save</button>
    </div>
  );
}

export default function CommsPage({ call }: { call: Call }) {
  const [d, setD] = useState<any>(null);
  // broadcast
  const [text, setText] = useState("");
  const [btn, setBtn] = useState("");
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState("all");
  const [adays, setAdays] = useState("7");
  const [tag, setTag] = useState("");
  const [country, setCountry] = useState("");
  const [at, setAt] = useState("");
  const [count, setCount] = useState<number | null>(null);
  // announcement + channel
  const [an, setAn] = useState({ text: "", kind: "info", at: "" });
  const [post, setPost] = useState("");
  // support
  const [tickets, setTickets] = useState<any[]>([]);
  const [tagFilter, setTagFilter] = useState("");
  const [open, setOpen] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [tpls, setTpls] = useState<Tpl[]>([]);
  const [editTpl, setEditTpl] = useState(false);
  const replyRef = useRef<HTMLTextAreaElement>(null);

  const aud = useCallback(() => ({ kind, days: Number(adays) || 7, tag: tag.trim(), country: country.trim().toUpperCase() }), [kind, adays, tag, country]);

  const loadMain = useCallback(async () => { const r = await call({ action: "commsData" }); if (r) setD(r); }, [call]);
  const loadTickets = useCallback(async () => { const r = await call<any>({ action: "commsTickets" }); if (r) setTickets(r.items || []); }, [call]);
  const loadTpls = useCallback(async () => { const r = await call<any>({ action: "templateList" }); if (r) setTpls(r.items || []); }, [call]);
  useEffect(() => { loadMain(); loadTickets(); loadTpls(); }, [loadMain, loadTickets, loadTpls]);

  // poll while a broadcast is running
  const running = (d?.broadcasts || []).some((b: any) => b.status !== "done");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(loadMain, 10000);
    return () => clearInterval(t);
  }, [running, loadMain]);

  // live recipient count (debounced, silent on invalid audience)
  useEffect(() => {
    setCount(null);
    if ((kind === "tag" && !tag.trim()) || (kind === "country" && !/^[A-Za-z]{2}$/.test(country.trim()))) return;
    let dead = false;
    const t = setTimeout(async () => {
      const r = await call<any>({ action: "broadcastCount", aud: aud() });
      if (!dead && r) setCount(r.count);
    }, 500);
    return () => { dead = true; clearTimeout(t); };
  }, [kind, adays, tag, country, call, aud]);

  if (!d) return <div className="empty">Loading…</div>;

  const send = async () => {
    const when_ = toMs(at);
    const msg = when_ > Date.now() ? `Schedule this message for ${new Date(when_).toLocaleString()}?` : `Send this message to ${count ?? "all matching"} users now?`;
    if (!window.confirm(msg)) return;
    const r = await call({ action: "broadcastSend", text, btn, url, aud: aud(), at: when_ || 0 }, when_ > Date.now() ? "Broadcast scheduled" : "Broadcast queued. Sending runs in batches.");
    if (r) { setText(""); setBtn(""); setUrl(""); setAt(""); loadMain(); }
  };
  const addAnn = async () => {
    const r = await call({ action: "scheduleAnnouncement", text: an.text, kind: an.kind, at: toMs(an.at) }, "Announcement scheduled");
    if (r) { setAn({ text: "", kind: "info", at: "" }); loadMain(); }
  };
  const delSched = async (id: string) => { if (window.confirm("Delete this scheduled item?") && (await call({ action: "scheduleDelete", id }, "Deleted"))) loadMain(); };
  const sendPost = async () => { if (window.confirm("Post to the channel now?") && (await call({ action: "postChannel", text: post }, "Posted to channel"))) setPost(""); };

  const openTicket = async (id: string) => {
    const r = await call<any>({ action: "supportGet", id });
    if (r) { setOpen(r.ticket); setReply(""); }
  };
  const setTicketTag = async (id: string, t: string) => {
    if (await call({ action: "ticketTag", id, tag: t })) setTickets(tickets.map((x) => (x.id === id ? { ...x, tag: t } : x)));
  };
  const sendReply = async () => {
    if (!open) return;
    if (await call({ action: "supportReply", id: open.id, message: reply }, "Reply sent")) { setReply(""); openTicket(open.id); loadTickets(); }
  };
  const closeTicket = async () => { if (open && (await call({ action: "supportClose", id: open.id }, "Ticket closed"))) { setOpen(null); loadTickets(); } };
  const insert = (t: string) => {
    const el = replyRef.current;
    const s = el?.selectionStart ?? reply.length, e = el?.selectionEnd ?? reply.length;
    setReply(reply.slice(0, s) + t + reply.slice(e));
    el?.focus();
  };
  const saveTpls = async () => { const r = await call<any>({ action: "templateSave", items: tpls }, "Templates saved"); if (r) { setTpls(r.items || []); setEditTpl(false); } };

  const shown = tickets.filter((t) => !tagFilter || (tagFilter === "none" ? !t.tag : t.tag === tagFilter));
  const st = d.settings || {};

  return (
    <>
      <div className="toolbar"><h2 style={{ margin: 0, flex: 1 }}>Communication</h2></div>

      <div className="card">
        <div className="title">Broadcast message</div>
        <div className="sub">Sent through the bot and the in-app inbox. Delivery runs in batches via the cron job.</div>
        <label style={{ marginTop: 8 }}>Message ({text.length}/3500)</label>
        <textarea rows={4} maxLength={3500} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write your message…" />
        <div className="grid2" style={{ marginTop: 6 }}>
          <div><label>Button label (optional)</label><input maxLength={30} value={btn} onChange={(e) => setBtn(e.target.value)} placeholder="Open" /></div>
          <div><label>Button link (https)</label><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" /></div>
        </div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <div>
            <label>Audience</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="all">All users</option><option value="active">Active in last N days</option><option value="tag">Users with a tag</option><option value="country">Country</option>
            </select>
          </div>
          <div>
            {kind === "active" && (<><label>Days</label><input inputMode="numeric" value={adays} onChange={(e) => setAdays(e.target.value)} /></>)}
            {kind === "tag" && (<><label>Tag</label><input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="VIP" /></>)}
            {kind === "country" && (<><label>Country code</label><input maxLength={2} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="BD" /></>)}
            {kind === "all" && (<><label>&nbsp;</label><div className="sub" style={{ padding: "11px 0" }}>Everyone who opened the app</div></>)}
          </div>
        </div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <div><label>Send later (optional)</label><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></div>
          <div><label>Recipients</label><div style={{ padding: "11px 0" }}><span className="pill info">{count === null ? "…" : count.toLocaleString("en-US")}</span></div></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button className="btn" disabled={text.trim().length < 3 || count === 0} onClick={send}>{toMs(at) > Date.now() ? "Schedule broadcast" : "Send broadcast"}</button>
        </div>
      </div>

      <div className="card">
        <div className="title">Recent broadcasts</div>
        {!d.broadcasts.length ? <div className="empty">No broadcasts yet</div> : (
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>When</th><th>Message</th><th>Audience</th><th>Progress</th><th>Status</th></tr></thead>
              <tbody>
                {d.broadcasts.map((b: any) => {
                  const done = (b.sent || 0) + (b.failed || 0);
                  const pct = b.total ? Math.round((done / b.total) * 100) : 100;
                  return (
                    <tr key={b.id}>
                      <td>{when(b.created_at)}</td>
                      <td style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.text}</td>
                      <td>{audLabel(b.aud)}</td>
                      <td style={{ minWidth: 130 }}>
                        <div className="bar"><div style={{ width: `${pct}%` }} /></div>
                        <div className="sub">{b.sent || 0} sent · {b.failed || 0} failed · {b.total || 0} total</div>
                      </td>
                      <td><span className={`pill ${b.status === "done" ? "ok" : "warn"}`}>{b.status}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="title">Scheduled items</div>
        <div className="sub">In-app announcement banner, shown at the chosen time. Scheduled broadcasts also appear here.</div>
        <div className="grid2" style={{ marginTop: 8 }}>
          <div><label>Announcement text (max 240)</label><input maxLength={240} value={an.text} onChange={(e) => setAn({ ...an, text: e.target.value })} /></div>
          <div><label>Style</label><select value={an.kind} onChange={(e) => setAn({ ...an, kind: e.target.value })}><option value="info">Info</option><option value="warn">Warning</option><option value="success">Success</option></select></div>
        </div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <div><label>Show at</label><input type="datetime-local" value={an.at} onChange={(e) => setAn({ ...an, at: e.target.value })} /></div>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button className="btn sec" disabled={!an.at} onClick={addAnn}>Schedule announcement</button></div>
        </div>
        {!d.schedule.length ? <div className="empty">Nothing scheduled</div> : (
          <div className="scroll-x" style={{ marginTop: 8 }}>
            <table className="tbl">
              <thead><tr><th>At</th><th>Type</th><th>Text</th><th /></tr></thead>
              <tbody>
                {d.schedule.map((s: any) => (
                  <tr key={s.id}>
                    <td>{when(s.at)}</td><td><span className="pill info">{s.type}</span></td>
                    <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.text}</td>
                    <td><button className="btn danger sm" onClick={() => delSched(s.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ChatsCard call={call} onSaved={loadMain} />
      <AutoPostCard call={call} />

      <div className="card">
        <div className="title">Post to channel</div>
        <div className="sub">{st.autopost_channel ? `Channel: ${st.autopost_channel}` : "No channel set. Add it in “Channels & groups” above."}</div>
        <textarea rows={3} maxLength={3800} style={{ marginTop: 8 }} value={post} onChange={(e) => setPost(e.target.value)} placeholder="Post text…" />
        <div style={{ marginTop: 8 }}><button className="btn" disabled={post.trim().length < 3 || !st.autopost_channel} onClick={sendPost}>Post now</button></div>
      </div>

      <div className="card">
        <div className="row">
          <div className="title">Support tickets</div>
          <button className="btn sec sm" onClick={loadTickets}>Refresh</button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
          {["", ...TAGS, "none"].map((t) => (
            <button key={t || "all"} className={`pill ${tagFilter === t ? "info" : ""}`} onClick={() => setTagFilter(t)}>{t === "" ? "All" : t === "none" ? "Untagged" : t}</button>
          ))}
        </div>
        {!shown.length ? <div className="empty">No tickets</div> : (
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th>Subject</th><th>User</th><th>Status</th><th>Tag</th><th>Updated</th></tr></thead>
              <tbody>
                {shown.map((t) => (
                  <tr key={t.id} className="click" onClick={() => openTicket(t.id)}>
                    <td>{t.subject}</td><td>{t.name || t.uid}</td>
                    <td><span className={`pill ${t.status === "open" ? "warn" : "ok"}`}>{t.status}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <select value={t.tag} style={{ padding: "5px 8px", width: "auto" }} onChange={(e) => setTicketTag(t.id, e.target.value)}>
                        <option value="">—</option>{TAGS.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                    <td>{when(t.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {open && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="row"><div className="title">{open.subject}</div><button className="btn ghost sm" onClick={() => setOpen(null)}>Close view</button></div>
            <div className="sub">{open.name || open.uid} · {open.status}</div>
            <div style={{ margin: "8px 0", maxHeight: 280, overflowY: "auto" }}>
              {(open.msgs || []).map((m: any, i: number) => (
                <div key={i} style={{ margin: "6px 0", textAlign: m.f === "admin" ? "right" : "left" }}>
                  <div style={{ display: "inline-block", maxWidth: "85%", textAlign: "left", background: m.f === "admin" ? "var(--info-bg)" : "var(--soft)", borderRadius: 12, padding: "7px 11px", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.t}</div>
                  <div className="sub">{m.f === "admin" ? "Support" : "User"} · {when(m.at)}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
              {tpls.map((t, i) => <button key={i} className="pill" title={t.text} onClick={() => insert(t.text)}>{t.title}</button>)}
              <button className="pill info" onClick={() => setEditTpl(!editTpl)}>{editTpl ? "Done" : "Edit templates"}</button>
            </div>
            <textarea ref={replyRef} rows={3} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn" disabled={reply.trim().length < 2} onClick={sendReply}>Send reply</button>
              <button className="btn sec" onClick={closeTicket}>Close ticket</button>
            </div>
          </div>
        )}

        {editTpl && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="title">Quick-reply templates</div>
            {tpls.map((t, i) => (
              <div key={i} className="grid2" style={{ marginTop: 8, gridTemplateColumns: "1fr 2fr auto" }}>
                <input maxLength={40} value={t.title} placeholder="Title" onChange={(e) => setTpls(tpls.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
                <input maxLength={800} value={t.text} placeholder="Reply text" onChange={(e) => setTpls(tpls.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                <button className="btn danger sm" onClick={() => setTpls(tpls.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn sec sm" disabled={tpls.length >= 30} onClick={() => setTpls([...tpls, { title: "", text: "" }])}>Add template</button>
              <button className="btn sm" onClick={saveTpls}>Save templates</button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="title">Admin alerts</div>
        <div className="sub">{d.targets ? `${d.targets} alert chat(s) configured.` : "No alert chat configured. Set it in Settings."} Send a test to check delivery.</div>
        <div style={{ marginTop: 8 }}><button className="btn sec" onClick={() => call({ action: "alertTest" }, "Test alert sent")}>Send test alert</button></div>
      </div>
    </>
  );
}

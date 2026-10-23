import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icons";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;

const fmt = (n: any) => Math.floor(Number(n) || 0).toLocaleString("en-US");
const when = (t?: number) => (t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const PRESET = ["vip", "suspicious", "testing"];
const flag = (cc: string) => (/^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))) + " " + cc : cc || "—");

function Head2({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="ph">
      <div>
        <h1>{title}</h1>
        {sub && <div className="muted sm" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      <div className="toolbar" style={{ margin: 0 }}>{children}</div>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">{children}</div>
    </div>
  );
}

/** coins → TFUEL display, using the configured coins-per-TFUEL */
function useCpt(call: Call) {
  const [cpt, setCpt] = useState(1000);
  useEffect(() => {
    call<any>({ action: "getSettings" }).then((d) => { if (d?.settings?.coins_per_tfuel) setCpt(Number(d.settings.coins_per_tfuel) || 1000); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (n: any) => {
    const d = Math.min(6, Math.max(0, Math.round(Math.log10(Math.max(1, cpt)))));
    return ((Number(n) || 0) / cpt).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  };
}

function Tags({ tags }: { tags: string[] }) {
  return <>{tags.map((t) => <span key={t} className={`tag ${t === "suspicious" ? "err" : t === "vip" ? "warn" : "info"}`} style={{ marginRight: 4 }}>{t}</span>)}</>;
}

type Tab = "users" | "tags" | "dupes" | "countries";

/** Admin → Users */
export default function PeoplePage({ call }: { call: Call }) {
  const tf = useCpt(call);
  const [tab, setTab] = useState<Tab>("users");
  const [open, setOpen] = useState<string | null>(null);

  if (open) return <UserView uid={open} call={call} tf={tf} onBack={() => setOpen(null)} />;
  return (
    <>
      <Head2 title="Users" sub="Search, tag, freeze and manage accounts" />
      <div className="seg">
        {([["users", "Users"], ["tags", "Tags"], ["dupes", "Duplicates"], ["countries", "Countries"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === "users" && <UserList call={call} tf={tf} onOpen={setOpen} />}
      {tab === "tags" && <TagCounts call={call} onPick={() => setTab("users")} onOpenTag={(t) => { try { sessionStorage.setItem("people_tag", t); } catch {} setTab("users"); }} />}
      {tab === "dupes" && <Dupes call={call} onOpen={setOpen} />}
      {tab === "countries" && <Countries call={call} />}
    </>
  );
}

/* ---------------- list + bulk ---------------- */
function UserList({ call, tf, onOpen }: { call: Call; tf: (n: any) => string; onOpen: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState(() => { try { const t = sessionStorage.getItem("people_tag") || ""; sessionStorage.removeItem("people_tag"); return t; } catch { return ""; } });
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [allTag, setAllTag] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bulk, setBulk] = useState<{ op: string; amount: string; reason: string; text: string; tag: string } | null>(null);
  const [confirmOp, setConfirmOp] = useState(false);
  const [result, setResult] = useState<string>("");

  const search = useCallback(async (qq = q, tt = tag) => {
    setLoading(true);
    const d: any = await call({ action: "uSearch", q: qq, tag: tt });
    setLoading(false);
    if (d) { setRows(d.users); setTotal(d.total); setSel(new Set()); setAllTag(false); }
  }, [call, q, tag]);
  useEffect(() => { search("", tag); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); setAllTag(false); return n; });
  const allOn = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const count = allTag ? -1 : sel.size;

  const run = async () => {
    if (!bulk) return;
    const body: Record<string, any> = { action: "uBulk", op: bulk.op, reason: bulk.reason, amount: bulk.amount, text: bulk.text, tag: bulk.tag };
    if (allTag && tag) body.allTag = tag; else body.uids = [...sel];
    const d: any = await call(body);
    setConfirmOp(false);
    if (d) {
      setResult(`Done: ${d.done} of ${d.total} users updated${d.skipped ? ` (${d.skipped} skipped: not found)` : ""}.`);
      setBulk(null);
      search();
    }
  };
  const need = (() => {
    if (!bulk) return "";
    if (bulk.op === "bonus") return !(Number(bulk.amount) >= 1) ? "Enter an amount" : bulk.reason.length < 3 ? "Enter a reason" : "";
    if (bulk.op === "ban" || bulk.op === "freeze") return bulk.reason.length < 3 ? "Enter a reason" : "";
    if (bulk.op === "message") return bulk.text.length < 3 ? "Write a message" : "";
    if (bulk.op === "tag") return bulk.tag.trim() ? "" : "Enter a tag";
    return "";
  })();
  const opLabel: Record<string, string> = { bonus: "Send bonus", ban: "Ban", unban: "Unban", freeze: "Freeze", unfreeze: "Unfreeze", message: "Send message", tag: "Add tag" };

  return (
    <>
      <div className="toolbar">
        <input placeholder="Name, @username, referral code or ID" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        <select value={tag} onChange={(e) => { setTag(e.target.value); search(q, e.target.value); }}>
          <option value="">All tags</option>
          {PRESET.map((t) => <option key={t} value={t}>{t}</option>)}
          {tag && !PRESET.includes(tag) && <option value={tag}>{tag}</option>}
        </select>
        <button className="btn sm" onClick={() => search()} disabled={loading}><Icon name="search" size={15} /> Search</button>
      </div>
      <div className="xs muted" style={{ marginBottom: 8 }}>Showing {rows.length} of {fmt(total)} users{tag ? ` tagged “${tag}”` : ""}. Click a row to open the full profile.</div>
      {result && <div className="banner info"><Icon name="check" size={18} /><span>{result}</span></div>}

      {count !== 0 && (
        <div className="card" style={{ marginBottom: 10 }}>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <b>{allTag ? "All users tagged “" + tag + "”" : `${sel.size} selected`}</b>
            {tag && !allTag && <button className="btn sec sm" onClick={() => setAllTag(true)}>Select everyone tagged “{tag}”</button>}
            <span style={{ flex: 1 }} />
            <button className="btn sec sm" onClick={() => { setSel(new Set()); setAllTag(false); setBulk(null); }}>Clear</button>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            {Object.keys(opLabel).map((o) => (
              <button key={o} className={`btn sm ${bulk?.op === o ? "" : "sec"}`} onClick={() => setBulk({ op: o, amount: "", reason: "", text: "", tag: "" })}>{opLabel[o]}</button>
            ))}
          </div>
          {bulk && (
            <div style={{ marginTop: 8 }}>
              {bulk.op === "bonus" && <div className="grid2"><input inputMode="numeric" placeholder="Amount (coins)" value={bulk.amount} onChange={(e) => setBulk({ ...bulk, amount: e.target.value.replace(/\D/g, "") })} /><input placeholder="Reason (shown to user)" value={bulk.reason} onChange={(e) => setBulk({ ...bulk, reason: e.target.value })} /></div>}
              {(bulk.op === "ban" || bulk.op === "freeze") && <input placeholder="Reason (required)" value={bulk.reason} onChange={(e) => setBulk({ ...bulk, reason: e.target.value })} />}
              {bulk.op === "message" && <textarea rows={3} maxLength={300} placeholder="Message to send to each user's inbox" value={bulk.text} onChange={(e) => setBulk({ ...bulk, text: e.target.value })} />}
              {bulk.op === "tag" && <input placeholder="Tag name" value={bulk.tag} onChange={(e) => setBulk({ ...bulk, tag: e.target.value })} />}
              <div className="toolbar" style={{ marginTop: 8 }}>
                <button className="btn sm" disabled={!!need} onClick={() => setConfirmOp(true)}>{need || `Run: ${opLabel[bulk.op]}`}</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card scroll-x" style={{ padding: 4 }}>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 28 }}><input type="checkbox" checked={allOn} onChange={() => { setAllTag(false); setSel(allOn ? new Set() : new Set(rows.map((r) => r.id))); }} /></th>
              <th>User</th><th>Tags</th><th>TFUEL</th><th>USDT</th><th>Country</th><th>Last seen</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="click" onClick={() => onOpen(u.id)}>
                <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(u.id) || allTag} onChange={() => toggle(u.id)} /></td>
                <td><div className="b">{u.name || "—"}</div><div className="xs muted">{u.username ? "@" + u.username + " · " : ""}ID {u.id}</div></td>
                <td><Tags tags={u.tags} /></td>
                <td className="num b">{tf(u.balance)}</td>
                <td className="num">{(u.usdt || 0).toFixed(2)}</td>
                <td>{flag(u.cc)}</td>
                <td>{when(u.last_seen)}</td>
                <td>
                  {u.banned && <span className="tag err" style={{ marginRight: 4 }}>Banned</span>}
                  {u.frozen && <span className="tag warn">Frozen</span>}
                  {!u.banned && !u.frozen && <span className="tag ok">Active</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="empty">{loading ? "Loading…" : "No users found"}</td></tr>}
          </tbody>
        </table>
      </div>

      {confirmOp && bulk && (
        <Modal onClose={() => setConfirmOp(false)}>
          <h2 style={{ marginTop: 0 }}>Confirm: {opLabel[bulk.op]}</h2>
          <p className="sm">
            This will apply to <b>{allTag ? `everyone tagged “${tag}” (max 200)` : `${sel.size} user${sel.size === 1 ? "" : "s"}`}</b>
            {bulk.op === "bonus" ? <> — bonus of <b>{fmt(bulk.amount)}</b> coins each.</> : "."}
            {bulk.reason && <> Reason: <i>{bulk.reason}</i></>}
          </p>
          <div className="toolbar">
            <button className="btn danger" onClick={run}>Yes, run it</button>
            <button className="btn sec" onClick={() => setConfirmOp(false)}>Cancel</button>
          </div>
        </Modal>
      )}
    </>
  );
}

/* ---------------- overview tabs ---------------- */
function TagCounts({ call, onOpenTag }: { call: Call; onPick: () => void; onOpenTag: (t: string) => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { call({ action: "uTagCounts" }).then(setD); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (!d) return <div className="empty">Loading…</div>;
  const names = Array.from(new Set([...(d.preset || PRESET), ...Object.keys(d.counts)]));
  return (
    <div className="card scroll-x" style={{ padding: 4 }}>
      <table className="tbl">
        <thead><tr><th>Tag</th><th>Users</th><th /></tr></thead>
        <tbody>
          {names.map((t: string) => (
            <tr key={t} className="click" onClick={() => onOpenTag(t)}>
              <td><Tags tags={[t]} /></td>
              <td className="num b">{fmt(d.counts[t] || 0)}</td>
              <td style={{ textAlign: "right" }}><span className="xs muted">View users</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dupes({ call, onOpen }: { call: Call; onOpen: (id: string) => void }) {
  const [d, setD] = useState<any>(null);
  const load = useCallback(async () => setD(await call({ action: "uDupes" })), [call]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="empty">Loading…</div>;
  return (
    <>
      <div className="xs muted" style={{ marginBottom: 8 }}>Accounts sharing the same device or IP. Scanned {when(d.scanned_at)} (cached for a few minutes).</div>
      {d.groups.length === 0 && <div className="card empty">No duplicate groups found</div>}
      {d.groups.map((g: any) => (
        <div className="card" key={g.kind + g.key} style={{ marginBottom: 10 }}>
          <div className="row">
            <div><span className={`tag ${g.kind === "ip" ? "warn" : "err"}`}>{g.kind === "ip" ? "Same IP" : "Same device"}</span> <span className="xs muted">{g.kind === "ip" ? g.key : g.key.slice(0, 10) + "…"}</span></div>
            <b className="num">{g.total} accounts</b>
          </div>
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {g.uids.map((u: any) => <button key={u.id} className="pill" onClick={() => onOpen(u.id)}>{u.name || u.id}{u.username ? " @" + u.username : ""}</button>)}
            {g.total > g.uids.length && <span className="xs muted">+{g.total - g.uids.length} more</span>}
          </div>
        </div>
      ))}
    </>
  );
}

function Countries({ call }: { call: Call }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { call({ action: "uCountries" }).then(setD); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  if (!d) return <div className="empty">Loading…</div>;
  const tot = d.rows.reduce((s: number, r: any) => s + r.n, 0) || 1;
  return (
    <div className="card scroll-x" style={{ padding: 4 }}>
      <table className="tbl">
        <thead><tr><th>Country</th><th>Users</th><th>Share</th><th>Status</th></tr></thead>
        <tbody>
          {d.rows.map((r: any) => (
            <tr key={r.cc}>
              <td>{r.cc === "??" ? "Unknown" : flag(r.cc)}</td>
              <td className="num b">{fmt(r.n)}</td>
              <td className="num">{((r.n / tot) * 100).toFixed(1)}%</td>
              <td>{d.blocked.includes(r.cc) ? <span className="tag err">Blocked</span> : <span className="tag ok">Allowed</span>}</td>
            </tr>
          ))}
          {d.rows.length === 0 && <tr><td colSpan={4} className="empty">No data yet</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- full user view ---------------- */
const statusTag = (s: string) => (s === "paid" || s === "done" || s === "completed" || s === "confirmed" ? "ok" : s === "rejected" || s === "failed" ? "err" : "warn");

function MoneyList({ title, items, empty }: { title: string; items: any[]; empty?: string }) {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div className="title">{title} ({items.length})</div>
      {items.length === 0 && <div className="muted sm">{empty || "None"}</div>}
      {items.map((w) => (
        <div className="hist" key={w.id}>
          <span>
            <b className="num">{w.amount ?? w.amount_usdt ?? w.usdt ?? w.coins ?? "—"}</b>{" "}
            {[w.currency, w.method, w.network, w.side].filter(Boolean).join(" · ")}
            <div className="xs muted">{when(w.at || w.created_at || w.ts)}{w.address ? " · " + String(w.address).slice(0, 18) + "…" : ""}</div>
          </span>
          {w.status && <span className={`tag ${statusTag(String(w.status))}`}>{String(w.status)}</span>}
        </div>
      ))}
    </div>
  );
}

function UserView({ uid, call, tf, onBack }: { uid: string; call: Call; tf: (n: any) => string; onBack: () => void }) {
  const [d, setD] = useState<any>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [custom, setCustom] = useState("");
  const [sub, setSub] = useState(uid);
  const load = useCallback(async () => { const r: any = await call({ action: "uFull", uid }); if (r) setD(r); }, [call, uid]);
  useEffect(() => { setD(null); load(); }, [load]);
  void sub; void setSub;
  if (!d) return (<><Head2 title="User"><button className="btn sec sm" onClick={onBack}>Back</button></Head2><div className="empty">Loading…</div></>);
  const u = d.user;

  const adjust = async (sign: 1 | -1) => {
    const n = parseInt(delta, 10);
    if (!n) return;
    if (await call({ action: "adjustBalance", uid, delta: sign * Math.abs(n), reason }, "Balance updated")) { setDelta(""); setReason(""); load(); }
  };
  const ban = async () => {
    const r = u.banned ? "" : prompt("Reason for banning this user?") || "";
    if (!u.banned && !r) return;
    if (await call({ action: "banUser", uid, banned: !u.banned, reason: r }, u.banned ? "User unbanned" : "User banned")) load();
  };
  const freeze = async () => {
    const r = u.frozen ? "" : prompt("Reason for freezing withdrawals and transfers?") || "";
    if (!u.frozen && r.trim().length < 3) return;
    if (await call({ action: "uFreeze", uid, frozen: !u.frozen, reason: r }, u.frozen ? "Account unfrozen" : "Account frozen")) load();
  };
  const setTags = async (tags: string[]) => { if (await call({ action: "uTagSet", uid, tags })) load(); };
  const addTag = (t: string) => { const v = t.trim(); if (v) setTags([...d.tags, v]); setCustom(""); };
  const addNote = async () => { if (await call({ action: "uNoteAdd", uid, text: note }, "Note added")) { setNote(""); load(); } };
  const f = d.flags || {};
  const s = d.security || {};

  return (
    <>
      <Head2 title={u.name || "User"} sub={`${u.username ? "@" + u.username + " · " : ""}ID ${u.id}${u.refcode ? " · code " + u.refcode : ""}`}>
        <button className="btn sec sm" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>
        <button className="btn sec sm" onClick={onBack}>Back to list</button>
      </Head2>

      {u.banned && <div className="banner err"><Icon name="ban" size={18} /><span>Banned{u.ban_reason ? `: ${u.ban_reason}` : ""}</span></div>}
      {u.frozen && <div className="banner warn"><Icon name="lock" size={18} /><span>Frozen (withdraw and send blocked): {u.frozen.reason} · by {u.frozen.by} · {when(u.frozen.at)}</span></div>}

      <div className="grid3" style={{ marginBottom: 12 }}>
        <div className="kpi"><div className="k">TFUEL</div><div className="v num">{tf(u.balance)}</div></div>
        <div className="kpi"><div className="k">USDT</div><div className="v num">{(u.usdt || 0).toFixed(2)}</div></div>
        <div className="kpi"><div className="k">Sent today</div><div className="v num">{fmt(d.send_today)}</div></div>
        <div className="kpi"><div className="k">Joined</div><div className="v" style={{ fontSize: 14 }}>{when(u.created_at)}</div></div>
        <div className="kpi"><div className="k">Last seen</div><div className="v" style={{ fontSize: 14 }}>{when(u.last_seen)}</div></div>
        <div className="kpi"><div className="k">Tasks · streak · energy</div><div className="v num" style={{ fontSize: 16 }}>{u.tasks_done} · {u.streak} · {u.energy}</div></div>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="title">Actions</div>
        <label>Adjust balance (coins)</label>
        <div className="grid2">
          <input inputMode="numeric" placeholder="Amount" value={delta} onChange={(e) => setDelta(e.target.value.replace(/\D/g, ""))} />
          <input placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="toolbar" style={{ marginTop: 8 }}>
          <button className="btn good sm" disabled={!delta || reason.length < 3} onClick={() => adjust(1)}><Icon name="plus" size={15} /> Add</button>
          <button className="btn danger sm" disabled={!delta || reason.length < 3} onClick={() => adjust(-1)}>Deduct</button>
          <span style={{ flex: 1 }} />
          <button className="btn sec sm" onClick={async () => { if (confirm("Remove this user's withdraw PIN?")) await call({ action: "resetPin", uid }, "PIN reset"); load(); }}><Icon name="lock" size={15} /> Reset PIN</button>
          <button className="btn sec sm" onClick={freeze}><Icon name="lock" size={15} /> {u.frozen ? "Unfreeze" : "Freeze"}</button>
          <button className={`btn sm ${u.banned ? "sec" : "danger"}`} onClick={ban}><Icon name="ban" size={15} /> {u.banned ? "Unban" : "Ban user"}</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="title">Tags</div>
        <div style={{ marginBottom: 8 }}>
          {d.tags.length === 0 && <span className="muted sm">No tags</span>}
          {d.tags.map((t: string) => (
            <span key={t} className={`tag ${t === "suspicious" ? "err" : t === "vip" ? "warn" : "info"}`} style={{ marginRight: 4 }}>
              {t} <button onClick={() => setTags(d.tags.filter((x: string) => x !== t))} aria-label={`Remove ${t}`} style={{ lineHeight: 1 }}><Icon name="x" size={11} /></button>
            </span>
          ))}
        </div>
        <div className="toolbar">
          {PRESET.filter((t) => !d.tags.includes(t)).map((t) => <button key={t} className="btn sec sm" onClick={() => addTag(t)}><Icon name="plus" size={13} /> {t}</button>)}
          <input placeholder="Custom tag" value={custom} maxLength={20} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag(custom)} />
          <button className="btn sm" disabled={!custom.trim()} onClick={() => addTag(custom)}>Add</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="title">Internal notes <span className="xs muted">(admins only)</span></div>
        <div className="toolbar">
          <input placeholder="Write a note…" value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && note.trim().length > 1 && addNote()} />
          <button className="btn sm" disabled={note.trim().length < 2} onClick={addNote}>Add note</button>
        </div>
        {d.notes.length === 0 && <div className="muted sm">No notes</div>}
        {d.notes.map((n: any) => (
          <div className="hist" key={n.id}>
            <span>{n.t}<div className="xs muted">{n.by} · {when(n.at)}</div></span>
            <button className="btn sec sm" aria-label="Delete note" onClick={async () => { if (confirm("Delete this note?")) { await call({ action: "uNoteDel", uid, id: n.id }, "Note deleted"); load(); } }}><Icon name="trash" size={14} /></button>
          </div>
        ))}
      </div>

      <div className="cols">
        <div className="card">
          <div className="title">Earning sources (coins)</div>
          {Object.keys(d.earn).length === 0 && <div className="muted sm">None</div>}
          {Object.entries(d.earn).map(([k, v]) => <div className="hist" key={k}><span>{k.replace(/_/g, " ")}</span><b className="num">{fmt(v)}</b></div>)}
          {Object.keys(d.spent).length > 0 && <div className="title" style={{ marginTop: 10 }}>Spent</div>}
          {Object.entries(d.spent).map(([k, v]) => <div className="hist" key={k}><span>{k.replace(/_/g, " ")}</span><b className="num">{fmt(v)}</b></div>)}
          {Object.keys(d.usdt_tot).length > 0 && <div className="title" style={{ marginTop: 10 }}>USDT totals</div>}
          {Object.entries(d.usdt_tot).map(([k, v]) => <div className="hist" key={k}><span>{k.replace(/_/g, " ")}</span><b className="num">{Number(v).toFixed(2)}</b></div>)}
        </div>
        <div className="card">
          <div className="title">Flags & referrals</div>
          <div className="sm">Fast taps {f.too_fast} · wrong codes {f.bad_codes} · locked {f.locked} · out-of-order {f.out_of_order}</div>
          <div className="sm" style={{ marginTop: 6 }}>Friends: {fmt(u.ref_count)} · bonus earned {fmt(u.ref_earned)} · commission {fmt(u.ref_comm)}{u.referred_by ? <> · referred by <b>{u.referred_by}</b></> : null}</div>
          <div className="sm" style={{ marginTop: 6 }}>Boosts: {u.boosts.length ? u.boosts.join(", ") : "none"} · active stakes: {u.stakes}</div>
          {d.same_device_or_ip.length > 0 && <div className="banner warn" style={{ marginTop: 8 }}><Icon name="alert" size={16} /><span>Shares a device or IP with: {d.same_device_or_ip.join(", ")}</span></div>}
        </div>
      </div>

      <div style={{ height: 10 }} />
      <MoneyList title="Withdrawals (TFUEL)" items={d.withdrawals} />
      <MoneyList title="USDT withdrawals" items={d.usdt_withdrawals} />
      <MoneyList title="Deposits" items={d.deposits} />
      <MoneyList title="Trades" items={d.trades} />

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="title">Friends ({fmt(d.friends_total)})</div>
        {d.friends.length === 0 && <div className="muted sm">None</div>}
        {d.friends.slice(0, 30).map((fr: any) => (
          <div className="hist" key={fr.id}><span>{fr.name || fr.id}<div className="xs muted">ID {fr.id} · {when(fr.at)}</div></span><span className="xs num">+{fmt(fr.bonus)} / {fmt(fr.comm)}</span></div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="title">Security & devices</div>
        <div className="sm">Email: {s.email ? <>{s.email} {s.email_verified ? <span className="tag ok">verified</span> : <span className="tag warn">unverified</span>}</> : <span className="muted">none</span>} · PIN: {s.pin ? "on" : "off"} · Saved addresses: {s.addrs}</div>
        {s.geo && <div className="sm" style={{ marginTop: 4 }}>Location: {flag(s.geo.cc)}{s.geo.ip ? ` · ${s.geo.ip}` : ""}</div>}
        <div className="title" style={{ marginTop: 10, fontSize: 14 }}>Devices ({s.devices.length})</div>
        {s.devices.map((x: any, i: number) => <div className="xs" key={i}>{x.label || "Device"} · first {when(x.first)} · last {when(x.last)}</div>)}
        <div className="title" style={{ marginTop: 10, fontSize: 14 }}>Security history</div>
        {s.log.length === 0 && <div className="muted sm">None</div>}
        {s.log.map((e: any) => <div className="xs" key={e.id}>{when(e.at)} · <b>{String(e.t).replace(/_/g, " ")}</b>{e.where && e.where !== "Unknown" ? ` · ${e.where}` : ""}{e.ip ? ` · ${e.ip}` : ""}{e.n ? ` · ${e.n}` : ""}</div>)}
      </div>

      <div className="card" style={{ marginBottom: 10 }}>
        <div className="title">Support tickets ({d.tickets.length})</div>
        {d.tickets.length === 0 && <div className="muted sm">None</div>}
        {d.tickets.map((t: any) => (
          <div className="hist" key={t.id}>
            <span>{t.subject || t.title || t.text || t.msg || "Ticket " + t.id}<div className="xs muted">{when(t.at || t.created_at || t.updated)}</div></span>
            {t.status && <span className={`tag ${t.status === "closed" || t.status === "resolved" ? "ok" : "warn"}`}>{String(t.status)}</span>}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="title">Recent activity</div>
        {d.activity.length === 0 && <div className="muted sm">None</div>}
        {d.activity.map((a: any) => (
          <div className="hist" key={a.id}><span>{String(a.t || a.type || "event").replace(/_/g, " ")}{a.note ? ` · ${a.note}` : ""}</span><span className="xs muted">{a.coins ? fmt(a.coins) + " · " : ""}{when(a.at)}</span></div>
        ))}
      </div>
    </>
  );
}

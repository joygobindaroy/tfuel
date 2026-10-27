import { useCallback, useEffect, useState } from "react";
import BackupPanel from "@/components/AdminBackup";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
const Sw = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => <button type="button" className={`switch ${on ? "on" : ""}`} aria-label="toggle" style={{ flexShrink: 0 }} onClick={() => set(!on)} />;
const Row = ({ t, h, children }: { t: string; h?: string; children: React.ReactNode }) => (
  <div className="row" style={{ marginTop: 10 }}><div><div className="title" style={{ fontSize: 14 }}>{t}</div>{h && <div className="sub">{h}</div>}</div>{children}</div>
);
const L = ({ t, children }: { t: string; children: React.ReactNode }) => <div><label>{t}</label>{children}</div>;
const list = (a: any[]) => (a || []).join(", ");
const nums = (s: string) => s.split(/[\s,]+/).map(Number).filter((x) => x > 0);
const dt = (ms: number) => { if (!ms) return ""; const d = new Date(ms - new Date().getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

/** One cfg2 section: local draft + Save */
function Sec({ title, help, section, init, call, children }: { title: string; help?: string; section: string; init: any; call: Call; children: (v: any, set: (p: any) => void) => React.ReactNode }) {
  const [v, setV] = useState<any>(init);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(init), [init]);
  const set = (p: any) => setV((x: any) => ({ ...x, ...p }));
  return (
    <div className="card">
      <div className="title">{title}</div>
      {help && <div className="sub">{help}</div>}
      {children(v, set)}
      <button className="btn" style={{ marginTop: 12 }} disabled={busy} onClick={async () => { setBusy(true); await call({ action: "growthSave", section, value: v }, `${title} saved`); setBusy(false); }}>Save</button>
    </div>
  );
}


/** A/B reward test: switch + how the two groups behave */
function AbPanel({ call, S, Row, Sw, L }: { call: Call; S: any; Row: any; Sw: any; L: any }) {
  const [st, setSt] = useState<any>(null);
  return (
    <>
      {S("ab", "A/B reward test", "Users are split 50/50. Group B gets the daily reward multiplied by the number below while the test is on. Compare the groups after a week or two.", (v: any, set: any) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x: boolean) => set({ enabled: x })} /></Row>
          <div className="grid2">
            <L t="Test name"><input value={v.name} onChange={(e: any) => set({ name: e.target.value })} /></L>
            <L t="Group B daily reward ×"><input inputMode="decimal" value={v.mult_b} onChange={(e: any) => set({ mult_b: e.target.value })} /></L>
          </div>
        </>
      ))}
      <div className="card">
        <div className="title">Test results</div>
        <button className="btn sec sm" style={{ marginTop: 6 }} onClick={async () => { const r: any = await call({ action: "growthAb" }); if (r) setSt(r); }}>Load results</button>
        {st && (
          <table style={{ width: "100%", marginTop: 10, fontSize: 13 }}>
            <thead><tr><th align="left"></th><th align="right">A</th><th align="right">B</th></tr></thead>
            <tbody>
              {([["Users", "users"], ["Active in 7 days (%)", "active7"], ["Avg daily streak", "avgStreak"], ["Avg lifetime coins", "avgEarn"], ["Depositors (%)", "depositors"]] as const).map(([l, k]) => <tr key={k}><td>{l}</td><td align="right">{Number(st.a[k]).toLocaleString("en-US")}</td><td align="right">{Number(st.b[k]).toLocaleString("en-US")}</td></tr>)}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/** Sponsor marketplace: review queue, active promotions, revenue */
const quizLine = (q: any) => typeof q === "string" ? q : [q.q, q.a[q.c], ...q.a.filter((_: any, i: number) => i !== q.c)].join(" | ");
function ToursAdmin({ call }: { call: Call }) {
  const [list, setList] = useState<any[]>([]);
  const [f, setF] = useState<any>({ title: "", game: "memory", start: "", end: "", prizes: "5000, 2500, 1000" });
  const load = useCallback(async () => { const r: any = await call({ action: "growthTours" }); if (r) setList(r.tours); }, [call]);
  useEffect(() => { load(); }, [load]);
  const state = (t: any) => (t.cancelled ? "cancelled" : t.paid ? "paid out" : Date.now() < t.start ? "scheduled" : Date.now() > t.end ? "ending (pays on next cron)" : "live");
  return (
    <div className="card">
      <div className="title">Free tournaments</div>
      <div className="sub">No entry fee. Players join, play Memory match or Crypto trivia, and the best scores win the prizes below (coins, paid by you automatically when it ends).</div>
      <div className="grid2" style={{ marginTop: 8 }}>
        <L t="Title"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></L>
        <L t="Game"><select value={f.game} onChange={(e) => setF({ ...f, game: e.target.value })}><option value="memory">Memory match (fewest moves)</option><option value="trivia">Crypto trivia (most correct)</option></select></L>
        <L t="Starts"><input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></L>
        <L t="Ends"><input type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></L>
      </div>
      <L t="Prizes for #1, #2, #3… (coins, comma separated)"><input value={f.prizes} onChange={(e) => setF({ ...f, prizes: e.target.value })} /></L>
      <button className="btn" style={{ marginTop: 10 }} onClick={async () => { const r: any = await call({ action: "growthTourSave", ...f, start: f.start ? new Date(f.start).getTime() : Date.now(), end: f.end ? new Date(f.end).getTime() : 0 }, "Tournament saved"); if (r) setList(r.tours); }}>Create tournament</button>
      {list.map((t) => (
        <div className="row" key={t.id} style={{ marginTop: 10 }}>
          <div><div className="b">{t.title}</div><div className="xs muted">{t.game} · {state(t)} · {t.players} players · prizes {t.prizes.join(", ")}</div></div>
          {!t.paid && !t.cancelled && <button className="btn danger sm" onClick={async () => { if (confirm("Cancel this tournament? No prizes will be paid.")) { const r: any = await call({ action: "growthTourCancel", id: t.id }, "Cancelled"); if (r) setList(r.tours); } }}>Cancel</button>}
        </div>
      ))}
    </div>
  );
}

function AdsAdmin({ call }: { call: Call }) {
  const [d, setD] = useState<any>(null);
  const [rev, setRev] = useState<any>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const r: any = await call({ action: "growthAds" }); if (r) setD(r);
    const v: any = await call({ action: "growthRevenue" }); if (v) setRev(v);
  }, [call]);
  useEffect(() => { load(); }, [load]);
  const act = async (action: string, id: string, ok: string) => { const r: any = await call({ action, id, note: note[id] || "" }, ok); if (r) { setD(r); const v: any = await call({ action: "growthRevenue" }); if (v) setRev(v); } };
  if (!d) return <div className="card muted">Loading…</div>;
  const Item = ({ o, children }: { o: any; children: React.ReactNode }) => (
    <div className="hist" style={{ alignItems: "flex-start" }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="title" style={{ fontSize: 14 }}>{o.title} <span className="muted">· {o.kind}{o.goal ? ` · ${o.goal} completions` : ""} · {o.days}d · {o.price.toFixed(2)} USDT</span></div>
        {o.text && <div className="sub">{o.text}</div>}
        <div className="sub" style={{ wordBreak: "break-all" }}><a href={o.url} target="_blank" rel="noreferrer">{o.url}</a></div>
        <div className="sub">By {o.name || "User"} ({o.uid}) · {new Date(o.created).toLocaleString()}{o.status !== "pending" ? ` · views ${o.imp || 0} · clicks ${o.clk || 0}` : ""}{o.note ? ` · ${o.note}` : ""}</div>
        {children}
      </div>
    </div>
  );
  return (
    <>
      {rev && (
        <div className="card">
          <div className="title">Revenue</div>
          <div className="sub">Promotions: <b>{rev.ads30.toFixed(2)} USDT</b> in 30 days · {rev.adsAll.toFixed(2)} USDT all time. Shop fees: {rev.shopFees.toFixed(2)} USDT. Send fees: {rev.sendFeesTfuel.toLocaleString("en-US", { maximumFractionDigits: 2 })} TFUEL.</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60, marginTop: 10 }}>
            {rev.days.map((x: any) => { const m = Math.max(0.01, ...rev.days.map((y: any) => y.ads)); return <div key={x.day} title={`${x.day}: ${x.ads.toFixed(2)} USDT`} style={{ flex: 1, height: `${Math.max(3, (x.ads / m) * 100)}%`, background: "var(--accent, #f59e0b)", borderRadius: 2, opacity: x.ads ? 1 : 0.25 }} />; })}
          </div>
        </div>
      )}
      <div className="card">
        <div className="title">Waiting for review ({d.pending.length})</div>
        {d.pending.length === 0 && <div className="sub">Nothing to review.</div>}
        {d.pending.map((o: any) => (
          <Item key={o.id} o={o}>
            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
              <input style={{ flex: 1, minWidth: 120 }} placeholder="Reason if rejecting (optional)" value={note[o.id] || ""} onChange={(e) => setNote({ ...note, [o.id]: e.target.value })} />
              <button className="btn sm" onClick={() => act("growthAdApprove", o.id, "Approved — live now")}>Approve</button>
              <button className="btn sec sm" onClick={() => act("growthAdReject", o.id, "Rejected and refunded")}>Reject + refund</button>
            </div>
          </Item>
        ))}
      </div>
      <div className="card">
        <div className="title">Live now ({d.active.length})</div>
        {d.active.length === 0 && <div className="sub">No active promotions.</div>}
        {d.active.map((o: any) => (
          <Item key={o.id} o={o}>
            <div className="sub">Ends {o.end ? new Date(o.end).toLocaleString() : "—"}</div>
            <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => { if (confirm("Stop now? The unused part is refunded to the advertiser.")) act("growthAdStop", o.id, "Stopped and refunded"); }}>Stop + refund unused</button>
          </Item>
        ))}
      </div>
      <div className="card">
        <div className="title">Recent</div>
        {d.recent.length === 0 && <div className="sub">Nothing yet.</div>}
        {d.recent.map((o: any) => <Item key={o.id} o={o}><div className="sub">{o.status}{o.refund > 0 ? ` · refunded ${o.refund.toFixed(2)} USDT` : ""}</div></Item>)}
      </div>
    </>
  );
}

/** Creator applications + name-tag moderation */
function CreatorsAdmin({ call }: { call: Call }) {
  const [list, setList] = useState<any[] | null>(null);
  const [uid, setUid] = useState("");
  useEffect(() => { call({ action: "growthCreators" }).then((r: any) => r && setList(r.list)); }, [call]);
  const set = async (u: string, status: string) => { const r: any = await call({ action: "growthCreatorSet", uid: u, status }, status === "approved" ? "Approved" : "Updated"); if (r) setList(r.list); };
  return (
    <div className="card">
      <div className="title">Creators</div>
      {!list && <div className="sub">Loading…</div>}
      {list && list.length === 0 && <div className="sub">No applications yet.</div>}
      {(list || []).map((c) => (
        <div className="hist" key={c.uid} style={{ alignItems: "flex-start" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="title" style={{ fontSize: 14 }}>{c.name || "User"} <span className="muted">· {c.uid} · {c.status}</span></div>
            <div className="sub" style={{ wordBreak: "break-all" }}><a href={c.link} target="_blank" rel="noreferrer">{c.link}</a> · {c.subs} followers · {c.friends} invited</div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {c.status !== "approved" && <button className="btn sm" onClick={() => set(c.uid, "approved")}>Approve</button>}
              {c.status === "pending" && <button className="btn sec sm" onClick={() => set(c.uid, "rejected")}>Reject</button>}
              {c.status === "approved" && <button className="btn sec sm" onClick={() => set(c.uid, "revoked")}>Remove creator</button>}
            </div>
          </div>
        </div>
      ))}
      <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Remove a user's name tag</div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <input inputMode="numeric" placeholder="User ID" value={uid} onChange={(e) => setUid(e.target.value.replace(/\D/g, ""))} />
        <button className="btn sec sm" disabled={!uid} onClick={async () => { await call({ action: "growthPlateClear", uid }, "Tag removed"); setUid(""); }}>Remove</button>
      </div>
    </div>
  );
}

export default function GrowthPage({ call }: { call: Call }) {
  const [d, setD] = useState<any>(null);
  const [tag, setTag] = useState("");
  const [cname, setCname] = useState("");
  const [risk, setRisk] = useState<any>(null);
  const [rb, setRb] = useState(false);
  const load = useCallback(async () => { const r: any = await call({ action: "growthData" }); if (r) setD(r); }, [call]);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="card muted">Loading…</div>;
  const c = d.cfg;
  const S = (section: string, title: string, help: string, render: (v: any, set: (p: any) => void) => React.ReactNode) => (
    <Sec key={section} title={title} help={help} section={section} init={c[section]} call={async (b, m) => { const r = await call(b, m); if (r) load(); return r as any; }}>{render}</Sec>
  );
  return (
    <>
      <div className="mhead">Invite & growth</div>
      {S("tiers", "Referral tiers", "More friends → higher commission %. Below the first tier the base % from Settings applies.", (v, set) => (
        <>
          {(v || []).map((t: any, i: number) => (
            <div className="grid2" key={i} style={{ marginTop: 6 }}>
              <input inputMode="numeric" placeholder="Friends" value={t.n} onChange={(e) => set({ ...v, [i]: { ...t, n: e.target.value } })} />
              <div style={{ display: "flex", gap: 6 }}><input inputMode="decimal" placeholder="%" value={t.pct} onChange={(e) => set({ ...v, [i]: { ...t, pct: e.target.value } })} /><button className="btn sec sm" onClick={() => { const a = [...v]; a.splice(i, 1); set(Object.assign({}, a)); }}>✕</button></div>
            </div>
          ))}
          <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ ...v, [(v || []).length]: { n: "", pct: "" } })}>+ Add tier</button>
        </>
      ))}
      {S("contest", "Weekly invite contest", "Top inviters of the week win prizes (coins), paid automatically after the week ends.", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <L t="Contest name"><input value={v.name} onChange={(e) => set({ name: e.target.value })} /></L>
          <L t="Prizes in coins, 1st, 2nd, 3rd… (comma separated)"><input value={list(v.prizes)} onChange={(e) => set({ prizes: nums(e.target.value) })} /></L>
        </>
      ))}
      <div className="card">
        <div className="title">Campaign links</div>
        <div className="sub">Make a link per source (ad, channel, partner) and see how many joined, stayed active, did a task and deposited.</div>
        {!d.hasLink && <div className="banner warn"><span>Set the bot link in Settings → Telegram bot to get full links.</span></div>}
        <div className="grid2" style={{ marginTop: 8 }}>
          <input placeholder="Tag, e.g. fbad1" value={tag} onChange={(e) => setTag(e.target.value)} />
          <div style={{ display: "flex", gap: 6 }}><input placeholder="Name (optional)" value={cname} onChange={(e) => setCname(e.target.value)} /><button className="btn sm" disabled={tag.trim().length < 2} onClick={async () => { const r: any = await call({ action: "growthCampaignSave", tag, name: cname }, "Campaign saved"); if (r) { setTag(""); setCname(""); load(); } }}>Add</button></div>
        </div>
        {d.campaigns.length === 0 && <div className="sub" style={{ marginTop: 8 }}>No campaigns yet.</div>}
        {d.campaigns.map((x: any) => (
          <div className="hist" key={x.tag} style={{ alignItems: "flex-start" }}>
            <div style={{ minWidth: 0 }}>
              <div className="title" style={{ fontSize: 14 }}>{x.name} <span className="muted">· {x.tag}</span></div>
              <div className="sub">Joined {x.joined} · Active 7d {x.active} · Did a task {x.task} · Deposited {x.dep}</div>
              <div className="xs muted" style={{ wordBreak: "break-all" }}>{x.link || `?startapp=cmp_${x.tag}`}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn sec sm" onClick={() => { try { navigator.clipboard.writeText(x.link || `?startapp=cmp_${x.tag}`); } catch {} }}>Copy</button>
              <button className="btn sec sm" onClick={async () => { if (confirm(`Remove campaign ${x.tag}?`)) { await call({ action: "growthCampaignDelete", tag: x.tag }, "Removed"); load(); } }}>✕</button>
            </div>
          </div>
        ))}
      </div>

      <div className="mhead">Money</div>
      {S("autoconv", "Auto-convert", "Users can choose to sell a % of what they earn into USDT automatically (needs Trading + Sell on).", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <L t="Percent choices (comma separated)"><input value={list(v.options)} onChange={(e) => set({ options: nums(e.target.value) })} /></L>
          <Row t="Weekly schedule" h="Also lets users sell a chosen % of their TFUEL balance once a week (Monday–Sunday UTC)."><Sw on={v.weekly !== false} set={(x) => set({ weekly: x })} /></Row>
        </>
      ))}
      {S("moves", "Price-move alerts", "Users pick a % (e.g. 5 / 10 / 20) and get a bot message when the price moves that much in 24 hours. One message per period.", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <L t="Percent choices (comma separated)"><input value={list(v.options)} onChange={(e) => set({ options: nums(e.target.value) })} /></L>
        </>
      ))}
      <AbPanel call={call} S={S} Row={Row} Sw={Sw} L={L} />

      <div className="mhead">Safety</div>
      {S("bot", "Auto-tap detection", "Flags accounts that tap at a steady inhuman rate.", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <div className="grid2">
            <L t="Score threshold (lower = stricter)"><input inputMode="numeric" value={v.threshold} onChange={(e) => set({ threshold: e.target.value })} /></L>
            <L t="When flagged"><select value={v.action} onChange={(e) => set({ action: e.target.value })}><option value="flag">Only flag</option><option value="freeze">Freeze money-out</option></select></L>
          </div>
        </>
      ))}
      {S("autoban", "Auto-protect (risk rules)", "The cron job scans risk scores and acts automatically. Freezing only blocks money-out (withdraw / send); the user can still play. Clearing an account in the Risk report never gets auto-frozen again.", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <div className="grid2">
            <L t="Act at risk score ≥"><input inputMode="numeric" value={v.min_score} onChange={(e) => set({ min_score: e.target.value })} /></L>
            <L t="Action"><select value={v.action} onChange={(e) => set({ action: e.target.value })}><option value="freeze">Freeze money-out</option><option value="flag">Only flag</option></select></L>
            <L t="Max accounts per run"><input inputMode="numeric" value={v.max_per_run} onChange={(e) => set({ max_per_run: e.target.value })} /></L>
          </div>
        </>
      ))}
      <div className="card">
        <div className="title">Flagged accounts</div>
        {d.flagged.length === 0 && <div className="sub">None.</div>}
        {d.flagged.map((x: any) => (
          <div className="hist" key={x.id}>
            <div><div className="title" style={{ fontSize: 14 }}>{x.name || "User"} <span className="muted">· {x.id}</span></div><div className="sub">Score {x.score} · {new Date(x.at).toLocaleString()}</div></div>
            <button className="btn sec sm" onClick={async () => { await call({ action: "growthBotClear", uid: x.id }, "Cleared"); load(); }}>Clear</button>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="title">Risk report</div>
        <div className="sub">Scans all accounts for suspicious patterns (flags, shared IPs, extreme earn rate, referral-only income, instant withdrawals).</div>
        <button className="btn sec sm" style={{ marginTop: 8 }} disabled={rb} onClick={async () => { setRb(true); const r: any = await call({ action: "growthRisk" }); setRb(false); if (r) setRisk(r); }}>{rb ? "Scanning…" : "Run scan"}</button>
        {risk && <div className="sub" style={{ marginTop: 6 }}>{risk.scanned} accounts scanned · {risk.risk.length} flagged</div>}
        {risk && risk.risk.map((x: any) => (
          <div className="hist" key={x.id}>
            <div><div className="title" style={{ fontSize: 14 }}>{x.name || "User"} <span className="muted">· {x.id}</span></div><div className="sub">Risk {x.score} · {x.why.join("; ")}{risk.auto?.[x.id] ? ` · auto: ${risk.auto[x.id].action}` : ""}</div></div>
            <button className="btn sec sm" onClick={async () => { await call({ action: "growthRiskClear", uid: x.id }, "Cleared — won't be auto-actioned again"); setRisk({ ...risk, risk: risk.risk.filter((r: any) => r.id !== x.id) }); }}>Clear</button>
          </div>
        ))}
      </div>
      {S("geo", "Country & IP rules", "Withdrawals from these countries need manual review. Accounts sharing one IP above the limit are flagged.", (v, set) => (
        <>
          <L t="Review countries (2-letter codes, comma separated)"><input value={list(v.hold_countries)} onChange={(e) => set({ hold_countries: e.target.value })} /></L>
          <div className="grid2">
            <L t="Max accounts per IP (0 = off)"><input inputMode="numeric" value={v.ip_limit} onChange={(e) => set({ ip_limit: e.target.value })} /></L>
            <L t="Above the limit"><select value={v.ip_action} onChange={(e) => set({ ip_action: e.target.value })}><option value="flag">Only flag</option><option value="hold">Hold withdrawals</option></select></L>
          </div>
        </>
      ))}
      <div className="card">
        <div className="title">Accounts sharing an IP</div>
        {d.ips.length === 0 && <div className="sub">None above the limit.</div>}
        {d.ips.map((g: any) => <div className="hist" key={g.key}><div className="sub num">{g.users.join(", ")}</div></div>)}
      </div>
      {S("status", "Status page", "Shown to everyone at /status. Auto-checks add to this; set a manual notice here.", (v, set) => (
        <>
          <L t="Level"><select value={v.level} onChange={(e) => set({ level: e.target.value })}><option value="ok">All good</option><option value="degraded">Degraded</option><option value="outage">Outage</option></select></L>
          <L t="Notice (optional)"><input maxLength={200} value={v.note} onChange={(e) => set({ note: e.target.value })} /></L>
        </>
      ))}
      {S("alerts", "Auto-alerts", "Telegram message to you when something breaks (price stale, cron stopped, payouts waiting too long…).", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <L t="Alert when a payout waits longer than (hours)"><input inputMode="numeric" value={v.pending_hours} onChange={(e) => set({ pending_hours: e.target.value })} /></L>
        </>
      ))}

      <div className="mhead">Engagement perks</div>
      {S("eng", "Rewards, boosts & perks", "Everything here is paid in coins from your side, so keep amounts small. Each block has its own switch.", (v, set) => {
        const up = (k: string, p: any) => set({ [k]: { ...v[k], ...p } });
        const N = (k: string, f: string, t: string) => <L t={t}><input inputMode="decimal" value={v[k]?.[f]} onChange={(e) => up(k, { [f]: e.target.value })} /></L>;
        const steps = v.invms?.steps || [];
        return (
          <>
            <div className="title" style={{ fontSize: 14 }}>Level-up reward</div>
            <Row t="Enabled" h="Reward = new level × base coins"><Sw on={!!v.levelup?.enabled} set={(x) => up("levelup", { enabled: x })} /></Row>
            <div className="grid2">{N("levelup", "base", "Base coins per level")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Free lucky box (needs rewarded ads on)</div>
            <Row t="Enabled"><Sw on={!!v.luckybox?.enabled} set={(x) => up("luckybox", { enabled: x })} /></Row>
            <div className="grid2">{N("luckybox", "min", "Min coins")}{N("luckybox", "max", "Max coins")}{N("luckybox", "per_day", "Per user per day")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Rewarded tap boost (needs rewarded ads on)</div>
            <Row t="Enabled"><Sw on={!!v.adboost?.enabled} set={(x) => up("adboost", { enabled: x })} /></Row>
            <div className="grid2">{N("adboost", "minutes", "Minutes per ad")}{N("adboost", "mult", "Tap multiplier")}{N("adboost", "per_day", "Per user per day")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Friend gift</div>
            <Row t="Enabled" h="Users gift friends they invited (or who invited them), once a day each."><Sw on={!!v.gift?.enabled} set={(x) => up("gift", { enabled: x })} /></Row>
            <div className="grid2">{N("gift", "recv", "Friend gets (coins)")}{N("gift", "send", "Sender gets (coins)")}{N("gift", "per_day", "Gifts per day")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Invite milestones</div>
            <Row t="Enabled"><Sw on={!!v.invms?.enabled} set={(x) => up("invms", { enabled: x })} /></Row>
            {steps.map((t: any, i: number) => (
              <div className="grid2" key={i} style={{ marginTop: 6 }}>
                <input inputMode="numeric" placeholder="Friends" value={t.n} onChange={(e) => up("invms", { steps: steps.map((y: any, j: number) => (j === i ? { ...y, n: e.target.value } : y)) })} />
                <div style={{ display: "flex", gap: 6 }}><input inputMode="numeric" placeholder="Coins" value={t.coins} onChange={(e) => up("invms", { steps: steps.map((y: any, j: number) => (j === i ? { ...y, coins: e.target.value } : y)) })} /><button className="btn sec sm" onClick={() => up("invms", { steps: steps.filter((_: any, j: number) => j !== i) })}>✕</button></div>
              </div>
            ))}
            <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => up("invms", { steps: [...steps, { n: 10, coins: 1000 }] })}>+ Add milestone</button>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Creator program</div>
            <Row t="Enabled" h="Approved creators earn extra commission % on their friends' earnings."><Sw on={!!v.creator?.enabled} set={(x) => up("creator", { enabled: x })} /></Row>
            <div className="grid2">{N("creator", "bonus_pct", "Extra commission %")}{N("creator", "min_subs", "Minimum followers")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Season pass</div>
            <Row t="Enabled" h="Users pay coins once for a daily bonus during the pass."><Sw on={!!v.pass?.enabled} set={(x) => up("pass", { enabled: x })} /></Row>
            <div className="grid2">{N("pass", "price", "Price (coins)")}{N("pass", "days", "Length (days)")}{N("pass", "daily", "Daily bonus (coins)")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Name tag</div>
            <Row t="Enabled" h="A short tag next to the user's name on leaderboards. Coin sink."><Sw on={!!v.plate?.enabled} set={(x) => up("plate", { enabled: x })} /></Row>
            <div className="grid2">{N("plate", "price", "Price (coins)")}{N("plate", "max", "Max length")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Tips (clan mates)</div>
            <Row t="Enabled" h="Uses Send TFUEL rules (limits, PIN). Fee goes to you."><Sw on={!!v.tip?.enabled} set={(x) => up("tip", { enabled: x })} /></Row>
            <div className="grid2">{N("tip", "fee_pct", "Fee %")}<L t="Amounts (coins, comma separated)"><input value={Array.isArray(v.tip?.amounts) ? v.tip.amounts.join(", ") : v.tip?.amounts} onChange={(e) => up("tip", { amounts: e.target.value })} /></L></div>
          </>
        );
      })}
      <CreatorsAdmin call={call} />

      <div className="mhead">Sponsor marketplace</div>
      {S("adsmkt", "Promotion slots & prices", "Any user can buy a slot with their USDT balance. Nothing goes live until you approve it. Rejected orders are refunded in full.", (v, set) => {
        const slots = v.slots || [];
        const up = (i: number, p: any) => set({ slots: slots.map((x: any, j: number) => (j === i ? { ...x, ...p } : x)) });
        const disc = v.discounts || [];
        return (
          <>
            <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
            {slots.map((t: any, i: number) => (
              <div key={i} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                <div className="grid2">
                  <L t="Name"><input value={t.name} onChange={(e) => up(i, { name: e.target.value })} /></L>
                  <L t="Where it shows"><select value={t.kind} onChange={(e) => up(i, { kind: e.target.value })}><option value="bot_button">Bot menu button</option><option value="home_banner">App home banner</option><option value="board_top">Top of Leaderboard</option><option value="pinned">Message to every user (once)</option></select></L>
                  <L t={t.kind === "pinned" ? "Price per send (USDT)" : "Price per day (USDT)"}><input inputMode="decimal" value={t.price} onChange={(e) => up(i, { price: e.target.value })} /></L>
                  <L t="Max at the same time"><input inputMode="numeric" value={t.max_active} onChange={(e) => up(i, { max_active: e.target.value })} /></L>
                </div>
                <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => set({ slots: slots.filter((_: any, j: number) => j !== i) })}>Remove slot</button>
              </div>
            ))}
            <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ slots: [...slots, { id: "s" + (slots.length + 1), kind: "home_banner", name: "New slot", price: 1, max_active: 2 }] })}>+ Add slot</button>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Bulk discount (longer = cheaper)</div>
            {disc.map((x: any, i: number) => (
              <div className="grid2" key={i} style={{ marginTop: 6 }}>
                <input inputMode="numeric" placeholder="From days" value={x.days} onChange={(e) => set({ discounts: disc.map((y: any, j: number) => (j === i ? { ...y, days: e.target.value } : y)) })} />
                <div style={{ display: "flex", gap: 6 }}><input inputMode="decimal" placeholder="% off" value={x.pct} onChange={(e) => set({ discounts: disc.map((y: any, j: number) => (j === i ? { ...y, pct: e.target.value } : y)) })} /><button className="btn sec sm" onClick={() => set({ discounts: disc.filter((_: any, j: number) => j !== i) })}>✕</button></div>
              </div>
            ))}
            <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ discounts: [...disc, { days: 7, pct: 10 }] })}>+ Add discount</button>
            <div className="grid2" style={{ marginTop: 12 }}>
              <L t="Longest booking (days)"><input inputMode="numeric" value={v.max_days} onChange={(e) => set({ max_days: e.target.value })} /></L>
            </div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Mission pack (advertiser buys task completions)</div>
            <Row t="Enabled" h="Becomes a sponsored task after you approve it. Unused completions are refunded."><Sw on={!!v.mission?.enabled} set={(x) => set({ mission: { ...v.mission, enabled: x } })} /></Row>
            <div className="grid2">
              <L t="Advertiser pays per completion (USDT)"><input inputMode="decimal" value={v.mission?.price} onChange={(e) => set({ mission: { ...v.mission, price: e.target.value } })} /></L>
              <L t="User reward per completion (coins)"><input inputMode="numeric" value={v.mission?.reward} onChange={(e) => set({ mission: { ...v.mission, reward: e.target.value } })} /></L>
              <L t="Min completions"><input inputMode="numeric" value={v.mission?.min} onChange={(e) => set({ mission: { ...v.mission, min: e.target.value } })} /></L>
              <L t="Max completions"><input inputMode="numeric" value={v.mission?.max} onChange={(e) => set({ mission: { ...v.mission, max: e.target.value } })} /></L>
            </div>
            <L t="Blocked words / domains (comma separated)"><textarea rows={2} value={Array.isArray(v.blocked) ? v.blocked.join(", ") : v.blocked} onChange={(e) => set({ blocked: e.target.value })} /></L>
          </>
        );
      })}
      <AdsAdmin call={call} />

      <div className="mhead">Transfers & VIP</div>
      {S("xfer", "Send & receive rules", "USDT transfers between users, held large sends, request links and money links.", (v, set) => {
        const up = (k: string, p: any) => set({ [k]: { ...v[k], ...p } });
        const N = (k: string, f: string, t: string) => <L t={t}><input inputMode="decimal" value={v[k]?.[f]} onChange={(e) => up(k, { [f]: e.target.value })} /></L>;
        return (
          <>
            <div className="title" style={{ fontSize: 14 }}>USDT transfers</div>
            <Row t="Enabled" h="Users can send USDT to another user's unique ID."><Sw on={!!v.usdt?.enabled} set={(x) => up("usdt", { enabled: x })} /></Row>
            <div className="grid2">{N("usdt", "fee_pct", "Fee %")}{N("usdt", "min", "Minimum (USDT)")}{N("usdt", "daily", "Daily limit (USDT, 0 = none)")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Hold & cancel for large sends</div>
            <div className="sub">A send at or above the amount waits for the minutes below. The sender can cancel it meanwhile (0 = off).</div>
            <div className="grid2">{N("hold", "tfuel", "TFUEL amount (coins)")}{N("hold", "usdt", "USDT amount")}{N("hold", "minutes", "Wait (minutes)")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Links</div>
            <Row t="Payment request links" h="“Pay me X” link or QR."><Sw on={!!v.links?.request} set={(x) => up("links", { request: x })} /></Row>
            <Row t="Money links" h="Sender locks money in a link; the first person who opens it claims it. Unclaimed money returns after the days below."><Sw on={!!v.links?.claim} set={(x) => up("links", { claim: x })} /></Row>
            <div className="grid2">{N("links", "days", "Link valid (days)")}</div>
          </>
        );
      })}
      {S("vip", "VIP pass", "Users buy it with USDT. Perks: bonus on the daily reward, a discount on send fees, and a badge.", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <div className="grid2">
            <L t="Price (USDT)"><input inputMode="decimal" value={v.price} onChange={(e) => set({ price: e.target.value })} /></L>
            <L t="Days"><input inputMode="numeric" value={v.days} onChange={(e) => set({ days: e.target.value })} /></L>
            <L t="Daily reward bonus %"><input inputMode="decimal" value={v.daily_pct} onChange={(e) => set({ daily_pct: e.target.value })} /></L>
            <L t="Send fee discount %"><input inputMode="decimal" value={v.fee_off_pct} onChange={(e) => set({ fee_off_pct: e.target.value })} /></L>
            <L t="Badge (emoji)"><input value={v.badge} onChange={(e) => set({ badge: e.target.value })} /></L>
          </div>
        </>
      ))}

      {S("plus", "Extras: schedules, alerts, quest, trial, subscriptions", "Small switches for the newer Send / games / shop features.", (v, set) => {
        const up = (k: string, p: any) => set({ [k]: { ...v[k], ...p } });
        const N = (k: string, f: string, t: string) => <L t={t}><input inputMode="decimal" value={v[k]?.[f]} onChange={(e) => up(k, { [f]: e.target.value })} /></L>;
        return (
          <>
            <div className="title" style={{ fontSize: 14 }}>Scheduled & repeating sends</div>
            <Row t="Enabled"><Sw on={!!v.sched?.enabled} set={(x) => up("sched", { enabled: x })} /></Row>
            <div className="grid2">{N("sched", "max", "Active schedules per user")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Large-send alert (bot message with “It wasn’t me”)</div>
            <div className="grid2">{N("alert", "tfuel", "From TFUEL amount (coins, 0 = off)")}{N("alert", "usdt", "From USDT amount (0 = off)")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Mini-game daily quest + streak</div>
            <Row t="Enabled" h="“Play N games today” bonus; a longer streak pays an extra bonus."><Sw on={!!v.quest?.enabled} set={(x) => up("quest", { enabled: x })} /></Row>
            <div className="grid2">{N("quest", "plays", "Games to play")}{N("quest", "bonus", "Bonus (coins)")}{N("quest", "streak_days", "Streak length (days)")}{N("quest", "streak_bonus", "Streak bonus (coins)")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>VIP free trial</div>
            <div className="grid2"><L t="Trial days (0 = no trial)"><input inputMode="numeric" value={v.trial_days} onChange={(e) => set({ trial_days: e.target.value })} /></L></div>
            <Row t="Tournament reminder" h="Bot message to joined players 1 hour before the end."><Sw on={!!v.tour_remind} set={(x) => set({ tour_remind: x })} /></Row>
            <Row t="Gentle reminders" h="Unpaid payment requests and unclaimed money links after 24 h; monthly transfer statement on the 1st."><Sw on={v.nudges !== false} set={(x) => set({ nudges: x })} /></Row>
            <Row t="Shop subscriptions" h="Shops can ask for a recurring payment; users approve it once and can cancel any time."><Sw on={!!v.subs} set={(x) => set({ subs: x })} /></Row>
          </>
        );
      })}

      <div className="mhead">Mini games (free to play)</div>
      {S("mini", "Memory, trivia & treasure hunt", "No stake and no risk for players. Rewards are small coins from you, limited per day. Fast finishers (bots) get nothing.", (v, set) => {
        const up = (k: string, p: any) => set({ [k]: { ...v[k], ...p } });
        const N = (k: string, f: string, t: string) => <L t={t}><input inputMode="decimal" value={v[k]?.[f]} onChange={(e) => up(k, { [f]: e.target.value })} /></L>;
        const qs = Array.isArray(v.trivia?.questions) ? v.trivia.questions.map(quizLine).join("\n") : String(v.trivia?.questions || "");
        return (
          <>
            <Row t="All mini games on"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
            <div className="title" style={{ marginTop: 10, fontSize: 14 }}>Memory match</div>
            <Row t="Enabled"><Sw on={!!v.memory?.enabled} set={(x) => up("memory", { enabled: x })} /></Row>
            <div className="grid2">{N("memory", "pairs", "Pairs (3–10)")}{N("memory", "reward", "Reward (coins)")}{N("memory", "max_moves", "Moves for full reward")}{N("memory", "per_day", "Plays per day")}</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Crypto trivia</div>
            <Row t="Enabled"><Sw on={!!v.trivia?.enabled} set={(x) => up("trivia", { enabled: x })} /></Row>
            <div className="grid2">{N("trivia", "per_correct", "Coins per correct")}{N("trivia", "rounds", "Questions per game")}{N("trivia", "per_day", "Plays per day")}</div>
            <L t="Questions — one per line: Question | RIGHT answer | wrong | wrong | wrong (at least 5 lines)"><textarea rows={8} value={qs} onChange={(e) => up("trivia", { questions: e.target.value })} /></L>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Treasure hunt</div>
            <Row t="Enabled"><Sw on={!!v.hunt?.enabled} set={(x) => up("hunt", { enabled: x })} /></Row>
            <div className="grid2">{N("hunt", "min", "Min prize (coins)")}{N("hunt", "max", "Max prize (coins)")}{N("hunt", "per_day", "Picks per day")}</div>
          </>
        );
      })}
      <ToursAdmin call={call} />

      <div className="mhead">Backup & restore</div>
      <BackupPanel call={call} />

      <div className="mhead">Games</div>
      {S("clan", "Clans & raid boss", "Players form teams; their earnings count as clan points. The boss is defeated by all members together.", (v, set) => {
        const bs = v.boss || {};
        const sb = (p: any) => set({ boss: { ...bs, ...p } });
        return (
          <>
            <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
            <div className="grid2">
              <L t="Cost to create a clan (coins)"><input inputMode="numeric" value={v.create_cost} onChange={(e) => set({ create_cost: e.target.value })} /></L>
              <L t="Max members"><input inputMode="numeric" value={v.max_members} onChange={(e) => set({ max_members: e.target.value })} /></L>
            </div>
            <L t="Weekly clan prizes in coins, 1st, 2nd… (shared by members)"><input value={list(v.prizes)} onChange={(e) => set({ prizes: nums(e.target.value) })} /></L>
            <Row t="Raid boss"><Sw on={!!bs.enabled} set={(x) => sb({ enabled: x })} /></Row>
            <div className="grid2">
              <L t="Boss name"><input value={bs.name} onChange={(e) => sb({ name: e.target.value })} /></L>
              <L t="Emoji"><input value={bs.emoji} maxLength={4} onChange={(e) => sb({ emoji: e.target.value })} /></L>
              <L t="Base HP"><input inputMode="numeric" value={bs.hp_base} onChange={(e) => sb({ hp_base: e.target.value })} /></L>
              <L t="HP per member"><input inputMode="numeric" value={bs.hp_per_member} onChange={(e) => sb({ hp_per_member: e.target.value })} /></L>
            </div>
            <L t="Reward per member when defeated (coins)"><input inputMode="numeric" value={bs.reward} onChange={(e) => sb({ reward: e.target.value })} /></L>
          </>
        );
      })}
      {S("rigs", "Mining rigs", "Coin sink: players buy rigs that earn coins per hour. Each extra rig of a type costs more.", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <div className="grid2">
            <L t="Max hours stored before collecting"><input inputMode="numeric" value={v.cap_hours} onChange={(e) => set({ cap_hours: e.target.value })} /></L>
            <L t="Price growth per owned rig (%)"><input inputMode="decimal" value={v.growth_pct} onChange={(e) => set({ growth_pct: e.target.value })} /></L>
          </div>
          {(v.tiers || []).map((t: any, i: number) => {
            const up = (p: any) => { const a = [...v.tiers]; a[i] = { ...t, ...p }; set({ tiers: a }); };
            return (
              <div key={i} className="grid2" style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6 }}><input style={{ width: 56 }} value={t.emoji} onChange={(e) => up({ emoji: e.target.value })} /><input placeholder="Name" value={t.name} onChange={(e) => up({ name: e.target.value })} /></div>
                <div style={{ display: "flex", gap: 6 }}><input inputMode="numeric" placeholder="Price" value={t.price} onChange={(e) => up({ price: e.target.value })} /><input inputMode="numeric" placeholder="Coins/hour" value={t.rate} onChange={(e) => up({ rate: e.target.value })} /><button className="btn sec sm" onClick={() => { const a = [...v.tiers]; a.splice(i, 1); set({ tiers: a }); }}>✕</button></div>
              </div>
            );
          })}
          <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ tiers: [...(v.tiers || []), { id: "r" + ((v.tiers || []).length + 1), name: "New rig", emoji: "🖥", price: 1000, rate: 10 }] })}>+ Add rig</button>
          <div className="xs muted" style={{ marginTop: 6 }}>Payback time = price ÷ coins per hour. Keep it long (e.g. 10+ days) so rigs stay a sink, not a printer.</div>
        </>
      ))}
      {S("puzzle", "Daily word puzzle", "Each player gets their own word every day. Free to play; solving pays a small reward once a day.", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <div className="grid2">
            <L t="Reward (coins)"><input inputMode="numeric" value={v.reward} onChange={(e) => set({ reward: e.target.value })} /></L>
            <L t="Tries per day"><input inputMode="numeric" value={v.tries} onChange={(e) => set({ tries: e.target.value })} /></L>
          </div>
          <L t={`Word list (${(Array.isArray(v.words) ? v.words : String(v.words || "").split(/[\s,]+/)).filter(Boolean).length} words, comma or space separated)`}><textarea rows={4} value={Array.isArray(v.words) ? v.words.join(" ") : v.words} onChange={(e) => set({ words: e.target.value })} /></L>
        </>
      ))}
      {S("collect", "Collectibles", "In-app collectible items at fixed prices (no resale). When the season ends, the pool you fund is shared by holding points.", (v, set) => {
        const items = v.items || [];
        const se = v.season || {};
        const ss = (p: any) => set({ season: { ...se, ...p } });
        return (
          <>
            <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
            {items.map((t: any, i: number) => {
              const up = (p: any) => { const a = [...items]; a[i] = { ...t, ...p }; set({ items: a }); };
              return (
                <div key={i} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                  <div className="grid2">
                    <div style={{ display: "flex", gap: 6 }}><input style={{ width: 56 }} value={t.emoji} onChange={(e) => up({ emoji: e.target.value })} /><input placeholder="Name" value={t.name} onChange={(e) => up({ name: e.target.value })} /></div>
                    <input placeholder="Image URL (https, optional)" value={t.image} onChange={(e) => up({ image: e.target.value })} />
                    <input inputMode="numeric" placeholder="Price (coins)" value={t.price} onChange={(e) => up({ price: e.target.value })} />
                    <input inputMode="numeric" placeholder="Points" value={t.pts} onChange={(e) => up({ pts: e.target.value })} />
                  </div>
                  <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => { const a = [...items]; a.splice(i, 1); set({ items: a }); }}>Remove item</button>
                </div>
              );
            })}
            <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ items: [...items, { id: "c" + (items.length + 1), name: "New item", emoji: "🎴", image: "", price: 1000, supply: 0, pts: 1, max: 0 }] })}>+ Add item</button>
            <div className="xs muted" style={{ marginTop: 8 }}>Supply is unlimited; each user can buy each item once.</div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Season</div>
            <div className="grid2">
              <L t="Season name"><input value={se.name} onChange={(e) => ss({ name: e.target.value })} /></L>
              <L t="Ends at (your time)"><input type="datetime-local" value={dt(se.end)} onChange={(e) => ss({ end: e.target.value ? new Date(e.target.value).getTime() : 0 })} /></L>
            </div>
            <L t="Reward pool (coins, funded by you)"><input inputMode="numeric" value={se.pool} onChange={(e) => ss({ pool: e.target.value })} /></L>
            <div className="xs muted" style={{ marginTop: 4 }}>{se.paid ? "This season was already paid." : "Paid automatically once, a few minutes after the end time (cron)."}</div>
          </>
        );
      })}

      {S("cosmetics", "Profile badges & frames", "Users buy these with TFUEL coins (a coin sink). Fixed price, in-app only, no resale.", (v, set) => {
        const items = v.items || [];
        const up = (i: number, p: any) => set({ items: items.map((x: any, j: number) => (j === i ? { ...x, ...p } : x)) });
        return (
          <>
            <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
            {items.map((t: any, i: number) => (
              <div className="grid2" key={i} style={{ marginTop: 8 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  <input style={{ width: 54 }} value={t.emoji} onChange={(e) => up(i, { emoji: e.target.value })} />
                  <input value={t.name} onChange={(e) => up(i, { name: e.target.value })} />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <select value={t.kind} onChange={(e) => up(i, { kind: e.target.value })}><option value="badge">Badge</option><option value="frame">Frame</option></select>
                  <input inputMode="numeric" value={t.price} onChange={(e) => up(i, { price: e.target.value })} />
                  <button className="btn sec sm" onClick={() => set({ items: items.filter((_: any, j: number) => j !== i) })}>✕</button>
                </div>
              </div>
            ))}
            <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ items: [...items, { id: "x" + (items.length + 1), name: "New", emoji: "✨", kind: "badge", price: 5000 }] })}>+ Add item</button>
          </>
        );
      })}

      <div className="mhead">Support</div>
      {S("faqbot", "FAQ auto-reply bot", "Answers questions sent to the bot using your FAQ (Settings → FAQ). If it can't answer, it offers to open a ticket.", (v, set) => (
        <>
          <Row t="Enabled"><Sw on={!!v.enabled} set={(x) => set({ enabled: x })} /></Row>
          <Row t="Use AI when no FAQ matches" h="Needs OPENROUTER_API_KEY in Vercel env. A free model is fine."><Sw on={!!v.ai} set={(x) => set({ ai: x })} /></Row>
          <div className="grid2">
            <L t="AI model"><input value={v.model} onChange={(e) => set({ model: e.target.value })} /></L>
            <L t="Match strictness (1–10)"><input inputMode="numeric" value={v.min_score} onChange={(e) => set({ min_score: e.target.value })} /></L>
          </div>
        </>
      ))}
    </>
  );
}

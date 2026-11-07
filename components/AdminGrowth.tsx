import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icons";
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
              <div style={{ display: "flex", gap: 6 }}><input inputMode="decimal" placeholder="%" value={t.pct} onChange={(e) => set({ ...v, [i]: { ...t, pct: e.target.value } })} /><button className="btn sec sm" onClick={() => { const a = [...v]; a.splice(i, 1); set(Object.assign({}, a)); }}><Icon name="x" size={14} /></button></div>
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
              <button className="btn sec sm" onClick={async () => { if (confirm(`Remove campaign ${x.tag}?`)) { await call({ action: "growthCampaignDelete", tag: x.tag }, "Removed"); load(); } }}><Icon name="x" size={14} /></button>
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
                <div style={{ display: "flex", gap: 6 }}><input inputMode="numeric" placeholder="Coins" value={t.coins} onChange={(e) => up("invms", { steps: steps.map((y: any, j: number) => (j === i ? { ...y, coins: e.target.value } : y)) })} /><button className="btn sec sm" onClick={() => up("invms", { steps: steps.filter((_: any, j: number) => j !== i) })}><Icon name="x" size={14} /></button></div>
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
                <div style={{ display: "flex", gap: 6 }}><input inputMode="decimal" placeholder="% off" value={x.pct} onChange={(e) => set({ discounts: disc.map((y: any, j: number) => (j === i ? { ...y, pct: e.target.value } : y)) })} /><button className="btn sec sm" onClick={() => set({ discounts: disc.filter((_: any, j: number) => j !== i) })}><Icon name="x" size={14} /></button></div>
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

      <div className="mhead">Brand & look</div>
      {S("brand", "Brand, cards, menu, pages, popup", "Name, logo, colours and texts used across the app, cards, receipts and bot images. Images refresh within a minute.", (v, set) => {
        const nav: any[] = v.nav && v.nav.length ? v.nav : [{ id: "tap", name: "Tap", hide: false }, { id: "tasks", name: "Tasks", hide: false }, { id: "boost", name: "Boost", hide: false }, { id: "tfuel", name: "TFUEL", hide: false }, { id: "profile", name: "Profile", hide: false }];
        const mv = (i: number, d: number) => { const a = [...nav]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set({ nav: a }); };
        const upn = (i: number, p: any) => set({ nav: nav.map((x, j) => (j === i ? { ...x, ...p } : x)) });
        const pages: any[] = v.pages || [];
        const upp = (i: number, p: any) => set({ pages: pages.map((x, j) => (j === i ? { ...x, ...p } : x)) });
        const pop = v.popup || {};
        const loc = (t: number) => { if (!t) return ""; const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
        const unloc = (x: string) => (x ? new Date(x).getTime() : 0);
        return (
          <>
            <div className="grid2">
              <L t="App name (empty = default)"><input value={v.name || ""} onChange={(e) => set({ name: e.target.value })} /></L>
              <L t="Logo image (https link)"><input value={v.logo || ""} onChange={(e) => set({ logo: e.target.value })} placeholder="https://…/logo.png" /></L>
              <L t="Brand colour (cards, receipts)"><input type="color" value={v.accent || "#f5a623"} onChange={(e) => set({ accent: e.target.value })} style={{ height: 40 }} /></L>
              <L t="Short brand label on cards (max 12)"><input value={v.label || ""} onChange={(e) => set({ label: e.target.value })} /></L>
              <L t="Invite card headline (2 lines OK)"><textarea rows={2} value={v.head || ""} onChange={(e) => set({ head: e.target.value })} /></L>
              <L t="Receipt footer text"><input value={v.foot || ""} onChange={(e) => set({ foot: e.target.value })} placeholder="Electronic receipt issued by …" /></L>
              <L t="Default card style (new users)"><select value={v.def_card || "1"} onChange={(e) => set({ def_card: e.target.value })}><option value="1">1 Dark Fintech</option><option value="3">3 Neon Cyber</option><option value="4">4 Gold Premium</option><option value="7">7 Member Card</option></select></L>
              <L t="Default receipt style (new users)"><select value={v.def_rcpt || "b"} onChange={(e) => set({ def_rcpt: e.target.value })}><option value="b">Banking</option><option value="d">Invoice</option><option value="e">Certificate</option><option value="f">Timeline</option><option value="g">Explorer</option></select></L>
              <L t="Coin name in menu (empty = TFUEL)"><input value={v.coin_name || ""} onChange={(e) => set({ coin_name: e.target.value })} /></L>
            </div>
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>Bottom menu</div>
            {nav.map((n, i) => (
              <div key={n.id} className="row" style={{ gap: 6, marginTop: 6 }}>
                <input value={n.name} maxLength={10} onChange={(e) => upn(i, { name: e.target.value })} style={{ flex: 1 }} />
                <button className="btn sec sm" onClick={() => mv(i, -1)}>↑</button><button className="btn sec sm" onClick={() => mv(i, 1)}>↓</button>
                {n.id !== "tap" && n.id !== "profile" ? <Sw on={!n.hide} set={(x) => upn(i, { hide: !x })} /> : <span className="xs muted">always</span>}
              </div>
            ))}
            <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => set({ nav })}>Use these menu settings</button>
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>Contact button</div>
            <div className="grid2">
              <L t="Button text"><input value={v.contact_label || ""} onChange={(e) => set({ contact_label: e.target.value })} /></L>
              <L t="Link (https, empty = hidden)"><input value={v.contact_url || ""} onChange={(e) => set({ contact_url: e.target.value })} placeholder="https://t.me/yoursupport" /></L>
            </div>
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>Pages (About, Rules, Help…)</div>
            {pages.map((p, i) => (
              <div key={p.id} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                <L t="Title"><input value={p.title} onChange={(e) => upp(i, { title: e.target.value })} /></L>
                <L t="Text"><textarea rows={5} value={p.body} onChange={(e) => upp(i, { body: e.target.value })} /></L>
                <button className="btn danger sm" onClick={() => set({ pages: pages.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            {pages.length < 8 && <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ pages: [...pages, { id: "p" + Date.now().toString(36), title: "About", body: "" }] })}>+ Add page</button>}
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>Pop-up when the app opens</div>
            <Row t="Show pop-up" h="Each person sees it once. Change the pop-up ID to show it again."><Sw on={!!pop.on} set={(x) => set({ popup: { ...pop, on: x } })} /></Row>
            <div className="grid2">
              <L t="Title"><input value={pop.title || ""} onChange={(e) => set({ popup: { ...pop, title: e.target.value } })} /></L>
              <L t="Pop-up ID"><input value={pop.id || ""} onChange={(e) => set({ popup: { ...pop, id: e.target.value } })} /></L>
              <L t="Picture (https)"><input value={pop.image || ""} onChange={(e) => set({ popup: { ...pop, image: e.target.value } })} /></L>
              <L t="Link (https)"><input value={pop.link || ""} onChange={(e) => set({ popup: { ...pop, link: e.target.value } })} /></L>
              <L t="Button text"><input value={pop.btn || ""} onChange={(e) => set({ popup: { ...pop, btn: e.target.value } })} /></L>
              <L t="Shows from"><input type="datetime-local" value={loc(pop.from)} onChange={(e) => set({ popup: { ...pop, from: unloc(e.target.value) } })} /></L>
              <L t="Shows until"><input type="datetime-local" value={loc(pop.to)} onChange={(e) => set({ popup: { ...pop, to: unloc(e.target.value) } })} /></L>
            </div>
            <L t="Text"><textarea rows={3} value={pop.text || ""} onChange={(e) => set({ popup: { ...pop, text: e.target.value } })} /></L>
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>More pop-ups (scheduled)</div>
            <div className="xs muted">The first one that is on and inside its time window is shown.</div>
            {(v.popups || []).map((q: any, i: number) => {
              const upq = (p: any) => set({ popups: (v.popups || []).map((x: any, j: number) => (j === i ? { ...x, ...p } : x)) });
              return (
                <div key={i} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                  <div className="row"><b>{q.title || "Pop-up"}</b><Sw on={!!q.on} set={(x) => upq({ on: x })} /></div>
                  <div className="grid2">
                    <L t="Title"><input value={q.title || ""} onChange={(e) => upq({ title: e.target.value })} /></L>
                    <L t="ID (change to show again)"><input value={q.id || ""} onChange={(e) => upq({ id: e.target.value })} /></L>
                    <L t="Picture (https)"><input value={q.image || ""} onChange={(e) => upq({ image: e.target.value })} /></L>
                    <L t="Link (https)"><input value={q.link || ""} onChange={(e) => upq({ link: e.target.value })} /></L>
                    <L t="From"><input type="datetime-local" value={loc(q.from)} onChange={(e) => upq({ from: unloc(e.target.value) })} /></L>
                    <L t="Until"><input type="datetime-local" value={loc(q.to)} onChange={(e) => upq({ to: unloc(e.target.value) })} /></L>
                  </div>
                  <L t="Text"><textarea rows={2} value={q.text || ""} onChange={(e) => upq({ text: e.target.value })} /></L>
                  <button className="btn danger sm" onClick={() => set({ popups: (v.popups || []).filter((_: any, j: number) => j !== i) })}>Remove</button>
                </div>
              );
            })}
            {(v.popups || []).length < 6 && <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ popups: [...(v.popups || []), { on: true, id: "pp" + Date.now().toString(36), title: "New pop-up", text: "", image: "", link: "", btn: "Open", from: Date.now(), to: Date.now() + 7 * 864e5 }] })}>+ Add pop-up</button>}
          </>
        );
      })}
      {S("v30", "Red packets & group tips", "Red packet: one amount shared by N friends. Group tips: users reply /tip 10 in a Telegram group (each user must switch it on in Settings; the bot must be allowed in groups).", (v, set) => {
        const up = (k: string, p: any) => set({ [k]: { ...(v[k] || {}), ...p } });
        return (
          <>
            <Row t="Red packets on"><Sw on={!!v.packet?.on} set={(x) => up("packet", { on: x })} /></Row>
            <div className="grid2">
              <L t="Max people per packet"><input inputMode="numeric" value={v.packet?.max_n ?? 30} onChange={(e) => up("packet", { max_n: e.target.value })} /></L>
              <L t="Max open hours"><input inputMode="numeric" value={v.packet?.max_hours ?? 48} onChange={(e) => up("packet", { max_hours: e.target.value })} /></L>
            </div>
            <Row t="Group /tip on"><Sw on={!!v.tip?.on} set={(x) => up("tip", { on: x })} /></Row>
            <div className="grid2">
              <L t="Max per tip (TFUEL)"><input inputMode="decimal" value={v.tip?.max_tfuel ?? 50} onChange={(e) => up("tip", { max_tfuel: e.target.value })} /></L>
              <L t="Max tips per user per day (TFUEL)"><input inputMode="decimal" value={v.tip?.day_max_tfuel ?? 200} onChange={(e) => up("tip", { day_max_tfuel: e.target.value })} /></L>
            </div>
          </>
        );
      })}
      {S("v29", "Vault, contest, bonuses & panic", "Savings vault, referral contest, first exchange bonus, win-back gift and the user panic button. All off by default except the panic button.", (v, set) => {
        const lo = (t: number) => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
        const up = (k: string, p: any) => set({ [k]: { ...(v[k] || {}), ...p } });
        return (
          <>
            <Row t="Savings vault" h="Users lock their own money until a date. No interest."><Sw on={!!v.vault?.on} set={(x) => up("vault", { on: x })} /></Row>
            <div className="grid2">
              <L t="Vault min days"><input inputMode="numeric" value={v.vault?.min_days ?? 1} onChange={(e) => up("vault", { min_days: e.target.value })} /></L>
              <L t="Vault max days"><input inputMode="numeric" value={v.vault?.max_days ?? 365} onChange={(e) => up("vault", { max_days: e.target.value })} /></L>
              <L t="Min TFUEL per vault"><input inputMode="decimal" value={v.vault?.min_tfuel ?? 10} onChange={(e) => up("vault", { min_tfuel: e.target.value })} /></L>
              <L t="Locked vaults per user"><input inputMode="numeric" value={v.vault?.max_open ?? 5} onChange={(e) => up("vault", { max_open: e.target.value })} /></L>
            </div>
            <Row t="Referral contest" h="Most friends invited between the two dates wins. Pay the prizes from Admin → Team & contest after it ends."><Sw on={!!v.contest?.on} set={(x) => up("contest", { on: x })} /></Row>
            <div className="grid2">
              <L t="Contest title"><input maxLength={60} value={v.contest?.title ?? ""} onChange={(e) => up("contest", { title: e.target.value })} /></L>
              <L t="Prizes in TFUEL for #1, #2, #3… (comma)"><input value={(v.contest?.prizes || []).join(",")} onChange={(e) => up("contest", { prizes: e.target.value.split(",").map((x) => Number(x.trim()) || 0).filter((x) => x >= 0).slice(0, 10) })} /></L>
              <L t="Start"><input type="datetime-local" value={lo(v.contest?.start || 0)} onChange={(e) => up("contest", { start: e.target.value ? new Date(e.target.value).getTime() : 0 })} /></L>
              <L t="End"><input type="datetime-local" value={lo(v.contest?.end || 0)} onChange={(e) => up("contest", { end: e.target.value ? new Date(e.target.value).getTime() : 0 })} /></L>
            </div>
            <Row t="First exchange order bonus" h="Once per user, after their first completed Exchange order."><Sw on={!!v.first?.on} set={(x) => up("first", { on: x })} /></Row>
            <L t="Bonus (TFUEL)"><input inputMode="decimal" value={v.first?.tfuel ?? 50} onChange={(e) => up("first", { tfuel: e.target.value })} /></L>
            <Row t="Win-back gift" h="Users who have not opened the app for N days get one message and a small gift (once per 60 days, up to 150 a day, skips users who muted offers)."><Sw on={!!v.winback?.on} set={(x) => up("winback", { on: x })} /></Row>
            <div className="grid2">
              <L t="Days away"><input inputMode="numeric" value={v.winback?.days ?? 14} onChange={(e) => up("winback", { days: e.target.value })} /></L>
              <L t="Gift (TFUEL, 0 = message only)"><input inputMode="decimal" value={v.winback?.tfuel ?? 20} onChange={(e) => up("winback", { tfuel: e.target.value })} /></L>
            </div>
            <L t="Win-back message"><input maxLength={200} value={v.winback?.text ?? ""} onChange={(e) => up("winback", { text: e.target.value })} /></L>
            <Row t="Panic button (user can freeze own account)"><Sw on={v.panic !== false} set={(x) => set({ panic: x })} /></Row>
          </>
        );
      })}
      {S("xchg", "Exchange (buy / sell USDT)", "Users buy or sell USDT for local money. You are the only other side: you set the rates and payment methods, check payments yourself, and mark orders done in Admin › Exchange. Nothing is ever credited automatically.", (v, set) => {
        const ms: any[] = v.methods || [];
        const um = (i: number, p: any) => set({ methods: ms.map((x, j) => (j === i ? { ...x, ...p } : x)) });
        return (
          <>
            <Row t="Exchange on" h="Shows the Exchange page. Off by default."><Sw on={!!v.on} set={(x) => set({ on: x })} /></Row>
            <Row t="Buying allowed"><Sw on={v.buy_on !== false} set={(x) => set({ buy_on: x })} /></Row>
            <Row t="Selling allowed"><Sw on={v.sell_on !== false} set={(x) => set({ sell_on: x })} /></Row>
            <Row t="Show ≈ local value next to USDT" h="Display only."><Sw on={v.show_local !== false} set={(x) => set({ show_local: x })} /></Row>
            <Row t="Automatic rate" h="Takes today's market USD rate for your currency (free public source, refreshed hourly) and adds your margins. If the source can't be reached, the base rate below is used."><Sw on={!!v.auto} set={(x) => set({ auto: x })} /></Row>
            {v.auto && (
              <div className="grid2">
                <L t="Base rate if the source fails"><input inputMode="decimal" value={v.fx ?? 0} onChange={(e) => set({ fx: e.target.value })} /></L>
                <L t="Buy margin % (users pay more)"><input inputMode="decimal" value={v.margin_buy ?? 1} onChange={(e) => set({ margin_buy: e.target.value })} /></L>
                <L t="Sell margin % (users get less)"><input inputMode="decimal" value={v.margin_sell ?? 1} onChange={(e) => set({ margin_sell: e.target.value })} /></L>
              </div>
            )}
            <div className="grid2">
              <L t="Currency code"><input value={v.cur ?? "BDT"} onChange={(e) => set({ cur: e.target.value })} /></L>
              <L t="Price lock (minutes)"><input inputMode="numeric" value={v.lock_min ?? 15} onChange={(e) => set({ lock_min: e.target.value })} /></L>
              {!v.auto && <L t="Users BUY 1 USDT at"><input inputMode="decimal" value={v.rate_buy ?? 0} onChange={(e) => set({ rate_buy: e.target.value })} /></L>}
              {!v.auto && <L t="Users SELL 1 USDT at"><input inputMode="decimal" value={v.rate_sell ?? 0} onChange={(e) => set({ rate_sell: e.target.value })} /></L>}
              <L t="New accounts wait (hours)"><input inputMode="numeric" value={v.new_user_hours ?? 24} onChange={(e) => set({ new_user_hours: e.target.value })} /></L>
              <L t="Daily limit per user (USDT, 0 = none)"><input inputMode="decimal" value={v.daily_max_usdt ?? 0} onChange={(e) => set({ daily_max_usdt: e.target.value })} /></L>
              <L t="Trusted badge after N clean orders"><input inputMode="numeric" value={v.trusted_after ?? 5} onChange={(e) => set({ trusted_after: e.target.value })} /></L>
            </div>
            <Row t="Open hours only" h="Outside these hours users can see rates but can't place orders."><Sw on={!!v.hours_on} set={(x) => set({ hours_on: x })} /></Row>
            {v.hours_on && (
              <div className="grid2">
                <L t="Opens (hour 0–23)"><input inputMode="numeric" value={v.hours_from ?? 10} onChange={(e) => set({ hours_from: e.target.value })} /></L>
                <L t="Closes (hour 1–24)"><input inputMode="numeric" value={v.hours_to ?? 22} onChange={(e) => set({ hours_to: e.target.value })} /></L>
                <L t="Your time zone (UTC+, e.g. 6)"><input inputMode="numeric" value={v.tz_h ?? 6} onChange={(e) => set({ tz_h: e.target.value })} /></L>
              </div>
            )}
            <L t="Note shown to users"><input maxLength={400} value={v.terms ?? ""} onChange={(e) => set({ terms: e.target.value })} /></L>
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>Payment methods</div>
            {ms.map((m, i) => (
              <div key={m.id} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                <div className="grid2">
                  <L t="Name (e.g. bKash)"><input value={m.name} onChange={(e) => um(i, { name: e.target.value })} /></L>
                  <L t="Used for"><select value={m.kind} onChange={(e) => um(i, { kind: e.target.value })}><option value="both">Buy and sell</option><option value="buy">Buy only</option><option value="sell">Sell only</option></select></L>
                  <L t="Min (USDT)"><input inputMode="decimal" value={m.min} onChange={(e) => um(i, { min: e.target.value })} /></L>
                  <L t="Max (USDT)"><input inputMode="decimal" value={m.max} onChange={(e) => um(i, { max: e.target.value })} /></L>
                  <L t="Fee %"><input inputMode="decimal" value={m.fee_pct} onChange={(e) => um(i, { fee_pct: e.target.value })} /></L>
                </div>
                <L t="Where the user pays you (shown only when buying)"><textarea rows={2} value={m.details} onChange={(e) => um(i, { details: e.target.value })} /></L>
                <button className="btn danger sm" onClick={() => set({ methods: ms.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            {ms.length < 12 && <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ methods: [...ms, { id: "m" + Date.now().toString(36), name: "", details: "", kind: "both", min: 1, max: 1000, fee_pct: 0 }] })}>+ Add payment method</button>}
          </>
        );
      })}
      {S("v27", "Alerts & support speed", "Small switches added in v27.", (v, set) => (
        <>
          <Row t="Low balance alerts" h="Lets users ask for a bot message when a balance gets low."><Sw on={v.lowbal !== false} set={(x) => set({ lowbal: x })} /></Row>
          <L t="Mark a ticket 'late' after (hours without an answer)"><input inputMode="numeric" value={v.sla_h ?? 24} onChange={(e) => set({ sla_h: e.target.value })} /></L>
        </>
      ))}
      {S("v26", "Lessons & identity check", "Short lessons (Tasks tab) with an optional reward, and the identity check for big USDT withdrawals.", (v, set) => {
        const ls: any[] = v.lessons || [];
        const ul = (i: number, p: any) => set({ lessons: ls.map((x, j) => (j === i ? { ...x, ...p } : x)) });
        return (
          <>
            <Row t="Identity check for big USDT withdrawals" h="People above the amount send a private link to their ID; you approve it in Feedback & reports."><Sw on={!!v.kyc?.on} set={(x) => set({ kyc: { ...v.kyc, on: x } })} /></Row>
            <L t="Needed from (USDT)"><input inputMode="decimal" value={v.kyc?.usd ?? 500} onChange={(e) => set({ kyc: { ...v.kyc, usd: e.target.value } })} /></L>
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>Lessons</div>
            {ls.map((l, i) => (
              <div key={l.id} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                <div className="grid2"><L t="Title"><input value={l.title} onChange={(e) => ul(i, { title: e.target.value })} /></L><L t="Reward (coins, 0 = none)"><input inputMode="numeric" value={l.reward} onChange={(e) => ul(i, { reward: e.target.value })} /></L></div>
                <L t="Text"><textarea rows={5} value={l.body} onChange={(e) => ul(i, { body: e.target.value })} /></L>
                <button className="btn danger sm" onClick={() => set({ lessons: ls.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            {ls.length < 20 && <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ lessons: [...ls, { id: "l" + Date.now().toString(36), title: "", body: "", reward: 0 }] })}>+ Add lesson</button>}
          </>
        );
      })}
      {S("v25", "Combo, birthday, cashback, auto-replies, public page", "Small engagement and support switches.", (v, set) => {
        const kw: any[] = v.kw || [];
        const uk = (i: number, p: any) => set({ kw: kw.map((x, j) => (j === i ? { ...x, ...p } : x)) });
        return (
          <>
            <Row t="Daily combo" h="Daily reward + spin + a mini game on the same day gives a bonus."><Sw on={!!v.combo?.on} set={(x) => set({ combo: { ...v.combo, on: x } })} /></Row>
            <L t="Combo bonus (coins)"><input inputMode="numeric" value={v.combo?.bonus ?? 0} onChange={(e) => set({ combo: { ...v.combo, bonus: e.target.value } })} /></L>
            <Row t="Birthday gift" h="Paid once a year on the date the user saved (UTC)."><Sw on={!!v.birthday?.on} set={(x) => set({ birthday: { ...v.birthday, on: x } })} /></Row>
            <L t="Birthday gift (coins)"><input inputMode="numeric" value={v.birthday?.bonus ?? 0} onChange={(e) => set({ birthday: { ...v.birthday, bonus: e.target.value } })} /></L>
            <Row t="Monthly cashback on send fees" h="On the 1st–3rd, TFUEL send fees of last month are partly refunded."><Sw on={!!v.cashback?.on} set={(x) => set({ cashback: { ...v.cashback, on: x } })} /></Row>
            <div className="grid2">
              <L t="Refund % of fees"><input inputMode="decimal" value={v.cashback?.pct ?? 0} onChange={(e) => set({ cashback: { ...v.cashback, pct: e.target.value } })} /></L>
              <L t="Only if fees paid ≥ (coins)"><input inputMode="numeric" value={v.cashback?.min_fee ?? 0} onChange={(e) => set({ cashback: { ...v.cashback, min_fee: e.target.value } })} /></L>
            </div>
            <Row t="Public numbers page (/stats)" h="Shows users, active today, joined and paid out in 30 days."><Sw on={!!v.stats_public} set={(x) => set({ stats_public: x })} /></Row>
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>Bot auto-replies by keyword</div>
            <div className="xs muted">If a message contains any of the words, the bot answers with your text first.</div>
            {kw.map((k, i) => (
              <div key={i} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                <L t="Words (comma separated)"><input value={k.words} onChange={(e) => uk(i, { words: e.target.value })} placeholder="pin, password" /></L>
                <L t="Reply"><textarea rows={2} value={k.reply} onChange={(e) => uk(i, { reply: e.target.value })} /></L>
                <button className="btn danger sm" onClick={() => set({ kw: kw.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            {kw.length < 30 && <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ kw: [...kw, { words: "", reply: "" }] })}>+ Add rule</button>}
          </>
        );
      })}
      {S("v24", "Merchant QR", "Lets users accept payments with a permanent QR and see their sales.", (v, set) => (
        <Row t="Merchant QR on" h="Normal send fees apply; there is no extra merchant fee."><Sw on={v.merchant !== false} set={(x) => set({ merchant: x })} /></Row>
      ))}
      {S("v23", "Free lucky draw & API key", "One winner per round, paid automatically. Everyone can join free: 1 ticket for joining plus tickets for each friend who joins during the round.", (v, set) => {
        const dr = v.draw || {};
        const up = (p: any) => set({ draw: { ...dr, ...p } });
        const loc = (t: number) => { if (!t) return ""; const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
        return (
          <>
            <Row t="Draw on"><Sw on={!!dr.on} set={(x) => up({ on: x })} /></Row>
            <div className="grid2">
              <L t="Title"><input value={dr.title || ""} onChange={(e) => up({ title: e.target.value })} /></L>
              <L t="Prize (coins)"><input inputMode="numeric" value={dr.prize ?? 0} onChange={(e) => up({ prize: e.target.value })} /></L>
              <L t="Round ends"><input type="datetime-local" value={loc(dr.end)} onChange={(e) => up({ end: e.target.value ? new Date(e.target.value).getTime() : 0 })} /></L>
              <L t="Repeat every N days (0 = once)"><input inputMode="numeric" value={dr.every_days ?? 0} onChange={(e) => up({ every_days: e.target.value })} /></L>
              <L t="Tickets per friend who joins"><input inputMode="numeric" value={dr.per_friend ?? 1} onChange={(e) => up({ per_friend: e.target.value })} /></L>
            </div>
            {dr.winner && <div className="xs muted" style={{ marginTop: 6 }}>Last winner: {dr.winner.name} · {dr.winner.prize} coins · {new Date(dr.winner.at).toLocaleDateString()}</div>}
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Read-only API key</div>
            <div className="xs muted">For outside tools: GET /api/ext with header x-api-key. Returns user count, new today and pending withdrawals. Making a new key stops the old one.</div>
            <button className="btn sec sm" style={{ marginTop: 6 }} onClick={async () => { if (!confirm("Make a new key? The old key stops working.")) return; const r: any = await call({ action: "v22ApiKey" }); if (r?.key) window.prompt("Copy this key now. It is shown only once.", r.key); }}>Make new API key</button>
          </>
        );
      })}
      {S("v22", "Help center, polls, feedback", "Questions people can search in Settings → Help center, polls/surveys on the Tasks tab, and the rating prompt.", (v, set) => {
        const help: any[] = v.help || [], polls: any[] = v.polls || [];
        const uh = (i: number, p: any) => set({ help: help.map((x, j) => (j === i ? { ...x, ...p } : x)) });
        const up = (i: number, p: any) => set({ polls: polls.map((x, j) => (j === i ? { ...x, ...p } : x)) });
        const loc = (t: number) => { if (!t) return ""; const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
        return (
          <>
            <Row t="Ask people to rate the app" h="Shown once a month after 3 days of use."><Sw on={v.feedback !== false} set={(x) => set({ feedback: x })} /></Row>
            <div className="title" style={{ marginTop: 12, fontSize: 14 }}>Help center</div>
            {help.map((h, i) => (
              <div key={h.id} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                <L t="Question"><input value={h.q} onChange={(e) => uh(i, { q: e.target.value })} /></L>
                <L t="Answer"><textarea rows={3} value={h.a} onChange={(e) => uh(i, { a: e.target.value })} /></L>
                <button className="btn danger sm" onClick={() => set({ help: help.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ help: [...help, { id: "h" + Date.now().toString(36), q: "", a: "" }] })}>+ Add question</button>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Polls & surveys</div>
            {polls.map((p, i) => (
              <div key={p.id} className="card" style={{ background: "var(--soft)", boxShadow: "none", marginTop: 8 }}>
                <div className="row"><b>{p.title || "Poll"}</b><Sw on={!!p.on} set={(x) => up(i, { on: x })} /></div>
                <div className="grid2">
                  <L t="Title"><input value={p.title} onChange={(e) => up(i, { title: e.target.value })} /></L>
                  <L t="Ends (optional)"><input type="datetime-local" value={loc(p.end)} onChange={(e) => up(i, { end: e.target.value ? new Date(e.target.value).getTime() : 0 })} /></L>
                </div>
                {(p.qs || []).map((q: any, qi: number) => (
                  <div key={qi} style={{ marginTop: 8 }}>
                    <L t={`Question ${qi + 1}`}><input value={q.q} onChange={(e) => up(i, { qs: p.qs.map((x: any, k: number) => (k === qi ? { ...x, q: e.target.value } : x)) })} /></L>
                    <L t="Options (one per line, 2–8)"><textarea rows={3} value={(q.opts || []).join("\n")} onChange={(e) => up(i, { qs: p.qs.map((x: any, k: number) => (k === qi ? { ...x, opts: e.target.value.split("\n") } : x)) })} /></L>
                  </div>
                ))}
                <div className="gap" style={{ marginTop: 6 }}>
                  <button className="btn sec sm" onClick={() => up(i, { qs: [...(p.qs || []), { q: "", opts: ["Yes", "No"] }] })}>+ Question</button>
                  <button className="btn danger sm" onClick={() => set({ polls: polls.filter((_, j) => j !== i) })}>Remove poll</button>
                </div>
              </div>
            ))}
            {polls.length < 10 && <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ polls: [...polls, { id: "q" + Date.now().toString(36), title: "Quick poll", on: false, end: 0, qs: [{ q: "", opts: ["Yes", "No"] }] }] })}>+ Add poll</button>}
          </>
        );
      })}
      {S("v21", "Digest & invite switches", "Daily admin digest, invite tree and friends board switches.", (v, set) => (
        <>
          <Row t="Daily admin digest" h="One bot message a day to the main admin: who changed what."><Sw on={!!v.digest} set={(x) => set({ digest: x })} /></Row>
          <Row t="Invite tree" h="Shows people their 2 invite levels."><Sw on={!!v.tree} set={(x) => set({ tree: x })} /></Row>
          <Row t="Friends-only leaderboard"><Sw on={!!v.friends_board} set={(x) => set({ friends_board: x })} /></Row>
        </>
      ))}

      <div className="mhead">Events & goals</div>
      {S("v20", "Bonus events, community goal, safety", "×2 reward events, a daily community goal, and a few safety / support switches.", (v, set) => {
        const ev: any[] = v.events || [];
        const setEv = (i: number, p: any) => set({ events: ev.map((e, j) => (j === i ? { ...e, ...p } : e)) });
        const loc = (t: number) => { if (!t) return ""; const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };
        const unloc = (s: string) => (s ? new Date(s).getTime() : 0);
        return (
          <>
            <div className="title" style={{ fontSize: 14 }}>Bonus events (×2 rewards for a while)</div>
            <div className="xs muted">Applies to daily rewards, tasks, games and puzzles. The bot posts the start to your channel. Times use your device time.</div>
            {ev.map((e, i) => (
              <div key={e.id} style={{ border: "1px solid var(--line, #e5e7eb)", borderRadius: 12, padding: 10, marginTop: 8 }}>
                <div className="row"><b>{e.title || "Event"}</b><Sw on={!!e.on} set={(x) => setEv(i, { on: x })} /></div>
                <div className="grid2">
                  <L t="Title"><input value={e.title} onChange={(x) => setEv(i, { title: x.target.value })} /></L>
                  <L t="Multiplier (1–5)"><input inputMode="decimal" value={e.mult} onChange={(x) => setEv(i, { mult: x.target.value })} /></L>
                  <L t="Starts"><input type="datetime-local" value={loc(e.start)} onChange={(x) => setEv(i, { start: unloc(x.target.value), ann: false })} /></L>
                  <L t="Ends"><input type="datetime-local" value={loc(e.end)} onChange={(x) => setEv(i, { end: unloc(x.target.value) })} /></L>
                </div>
                <button className="btn danger sm" style={{ marginTop: 6 }} onClick={() => set({ events: ev.filter((_, j) => j !== i) })}>Remove</button>
              </div>
            ))}
            <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => set({ events: [...ev, { id: "e" + Date.now().toString(36), title: "Double rewards weekend", mult: 2, start: Date.now() + 3600000, end: Date.now() + 49 * 3600000, on: true }] })}>+ Add event</button>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Daily community goal</div>
            <Row t="Enabled" h="If enough people claim the daily reward today, everyone who did gets a bonus."><Sw on={!!v.gq?.enabled} set={(x) => set({ gq: { ...v.gq, enabled: x } })} /></Row>
            <div className="grid2">
              <L t="Goal title"><input value={v.gq?.title} onChange={(e) => set({ gq: { ...v.gq, title: e.target.value } })} /></L>
              <L t="People needed"><input inputMode="numeric" value={v.gq?.target} onChange={(e) => set({ gq: { ...v.gq, target: e.target.value } })} /></L>
              <L t="Bonus each (coins)"><input inputMode="numeric" value={v.gq?.bonus} onChange={(e) => set({ gq: { ...v.gq, bonus: e.target.value } })} /></L>
            </div>
            <div className="title" style={{ marginTop: 14, fontSize: 14 }}>Safety & support</div>
            <div className="grid2">
              <L t="Require a PIN for sends over (USDT value, 0 = off)"><input inputMode="decimal" value={v.pin_over_usd} onChange={(e) => set({ pin_over_usd: e.target.value })} /></L>
              <L t="Close silent tickets after (days, 0 = never)"><input inputMode="numeric" value={v.ticket_close_days} onChange={(e) => set({ ticket_close_days: e.target.value })} /></L>
            </div>
            <Row t="Hold referral bonus on same device" h="If the invited person logs in from the same phone as the inviter, no bonus is paid and you get an alert."><Sw on={v.ref_guard !== false} set={(x) => set({ ref_guard: x })} /></Row>
            <Row t="“What's new” popup" h="Shown once after an update to people who joined more than a day ago."><Sw on={v.whatsnew !== false} set={(x) => set({ whatsnew: x })} /></Row>
          </>
        );
      })}
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
                <div style={{ display: "flex", gap: 6 }}><input inputMode="numeric" placeholder="Price" value={t.price} onChange={(e) => up({ price: e.target.value })} /><input inputMode="numeric" placeholder="Coins/hour" value={t.rate} onChange={(e) => up({ rate: e.target.value })} /><button className="btn sec sm" onClick={() => { const a = [...v.tiers]; a.splice(i, 1); set({ tiers: a }); }}><Icon name="x" size={14} /></button></div>
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
                  <button className="btn sec sm" onClick={() => set({ items: items.filter((_: any, j: number) => j !== i) })}><Icon name="x" size={14} /></button>
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

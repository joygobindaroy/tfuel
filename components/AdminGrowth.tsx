import { useCallback, useEffect, useState } from "react";

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
        </>
      ))}

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
            <div><div className="title" style={{ fontSize: 14 }}>{x.name || "User"} <span className="muted">· {x.id}</span></div><div className="sub">Risk {x.score} · {x.why.join("; ")}</div></div>
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

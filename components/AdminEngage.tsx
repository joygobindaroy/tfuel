import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icons";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
const Toggle = ({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) => (
  <button className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} aria-pressed={on} />
);
const when = (t?: number) => (t ? new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** Admin → Engagement: promo codes, lucky spin, leaderboard prizes, ads, notifications, limit orders, cron */
export default function EngagePage({ call }: { call: Call }) {
  const [s, setS] = useState<any>(null);
  const [st, setSt] = useState<any>(null);
  const [promos, setPromos] = useState<any[]>([]);
  const [lb, setLb] = useState<any>(null);
  const [np, setNp] = useState({ code: "", coins: "", max: "100", days: "7", note: "" });

  const loadAll = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([
      call({ action: "getSettings" }),
      call({ action: "engageStats" }),
      call({ action: "promoList" }),
      call({ action: "lbView" }),
    ]);
    if (a) setS((a as any).settings);
    if (b) setSt(b);
    if (c) setPromos((c as any).items);
    if (d) setLb(d);
  }, [call]);
  useEffect(() => {
    loadAll();
  }, [loadAll]);
  if (!s) return <div className="empty">Loading…</div>;
  const set = (k: string, v: any) => setS({ ...s, [k]: v });
  const save = () =>
    call(
      {
        action: "saveSettings",
        settings: {
          notify_enabled: s.notify_enabled, orders_enabled: s.orders_enabled, max_open_orders: s.max_open_orders, max_alerts: s.max_alerts,
          spin_enabled: s.spin_enabled, spin_prizes: s.spin_prizes.map((p: any) => ({ coins: p.coins, weight: p.weight })), spin_free_per_day: s.spin_free_per_day,
          streak_freeze_enabled: s.streak_freeze_enabled, streak_freeze_price: s.streak_freeze_price, streak_freeze_max: s.streak_freeze_max,
          ach_enabled: s.ach_enabled, comeback_enabled: s.comeback_enabled, comeback_days: s.comeback_days, comeback_bonus: s.comeback_bonus,
          weekly_enabled: s.weekly_enabled, weekly_target: s.weekly_target, weekly_reward: s.weekly_reward, anniv_enabled: s.anniv_enabled, anniv_bonus: s.anniv_bonus,
          events: (s.events || []).map((e: any) => ({ id: e.id, name: e.name, text: e.text, start: e.start, end: e.end, tap_mult: e.tap_mult, daily_mult: e.daily_mult, bonus: e.bonus })),
          lb_enabled: s.lb_enabled, lb_prizes: s.lb_prizes,
          ads_enabled: s.ads_enabled, ads_provider: s.ads_provider, ads_monetag_zone: s.ads_monetag_zone, ads_monetag_format: s.ads_monetag_format, ads_inapp: s.ads_inapp, ads_block_id: s.ads_block_id, ads_coins: s.ads_coins, ads_coins_per_day: s.ads_coins_per_day, ads_energy_per_day: s.ads_energy_per_day, ads_spin_per_day: s.ads_spin_per_day,
        },
      },
      "Saved"
    );
  const cpt = s.coins_per_tfuel || 1000;
  const tf = (n: any) => ((Number(n) || 0) / cpt).toLocaleString("en-US", { maximumFractionDigits: 6 });
  const totalW = s.spin_prizes.reduce((a: number, p: any) => a + (Number(p.weight) || 0), 0) || 1;
  const setPrize = (i: number, k: string, v: string) => set("spin_prizes", s.spin_prizes.map((p: any, j: number) => (j === i ? { ...p, [k]: v } : p)));

  const addPromo = async () => {
    const ok = await call({ action: "savePromo", code: np.code, coins: np.coins, max: np.max, days: np.days, note: np.note }, "Promo code saved");
    if (ok) {
      setNp({ code: "", coins: "", max: "100", days: "7", note: "" });
      loadAll();
    }
  };

  return (
    <>
      <div className="toolbar">
        <h2 style={{ margin: 0, flex: 1 }}>Engagement</h2>
        <button className="btn" onClick={save}>Save changes</button>
      </div>

      <div className="card">
        <div className="title">Retention (streaks, achievements, challenges)</div>
        <div className="sub">Keeps users coming back. All rewards are paid in TFUEL coins.</div>
        <div className="row" style={{ marginTop: 8 }}><span>Streak freeze (protects a missed day; recovery costs 2× price)</span><Toggle on={s.streak_freeze_enabled} onChange={(v) => set("streak_freeze_enabled", v)} /></div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <div><label>Freeze price (coins)</label><input inputMode="numeric" value={s.streak_freeze_price} onChange={(e) => set("streak_freeze_price", e.target.value)} /></div>
          <div><label>Max freezes held</label><input inputMode="numeric" value={s.streak_freeze_max} onChange={(e) => set("streak_freeze_max", e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}><span>Achievements</span><Toggle on={s.ach_enabled} onChange={(v) => set("ach_enabled", v)} /></div>
        <div className="row" style={{ marginTop: 10 }}><span>Comeback bonus (user returns after being away)</span><Toggle on={s.comeback_enabled} onChange={(v) => set("comeback_enabled", v)} /></div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <div><label>Away for (days)</label><input inputMode="numeric" value={s.comeback_days} onChange={(e) => set("comeback_days", e.target.value)} /></div>
          <div><label>Bonus (coins)</label><input inputMode="numeric" value={s.comeback_bonus} onChange={(e) => set("comeback_bonus", e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}><span>Weekly challenge (tasks + articles + daily rewards)</span><Toggle on={s.weekly_enabled} onChange={(v) => set("weekly_enabled", v)} /></div>
        <div className="grid2" style={{ marginTop: 6 }}>
          <div><label>Target / week</label><input inputMode="numeric" value={s.weekly_target} onChange={(e) => set("weekly_target", e.target.value)} /></div>
          <div><label>Reward (coins)</label><input inputMode="numeric" value={s.weekly_reward} onChange={(e) => set("weekly_reward", e.target.value)} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}><span>Anniversary bonus (30 days, then every year)</span><Toggle on={s.anniv_enabled} onChange={(v) => set("anniv_enabled", v)} /></div>
        <div style={{ maxWidth: 220, marginTop: 6 }}><label>Bonus (coins)</label><input inputMode="numeric" value={s.anniv_bonus} onChange={(e) => set("anniv_bonus", e.target.value)} /></div>
        <div className="title" style={{ marginTop: 14 }}>Seasonal events</div>
        <div className="sub">While an event is live users see it in Rewards: tap and daily-reward multipliers apply automatically, and a one-time bonus can be claimed.</div>
        {(s.events || []).map((e: any, i: number) => {
          const up = (k: string, v: any) => set("events", s.events.map((x: any, j: number) => (j === i ? { ...x, [k]: v } : x)));
          const dt = (ms: number) => { const d = new Date(ms || Date.now()); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
          return (
            <div key={i} style={{ borderTop: "1px solid var(--line)", marginTop: 10, paddingTop: 8 }}>
              <div className="grid2">
                <div><label>Name</label><input value={e.name} onChange={(x) => up("name", x.target.value)} /></div>
                <div><label>Text</label><input value={e.text} onChange={(x) => up("text", x.target.value)} /></div>
                <div><label>Starts</label><input type="datetime-local" value={dt(e.start)} onChange={(x) => up("start", new Date(x.target.value).getTime())} /></div>
                <div><label>Ends</label><input type="datetime-local" value={dt(e.end)} onChange={(x) => up("end", new Date(x.target.value).getTime())} /></div>
                <div><label>Tap ×</label><input inputMode="decimal" value={e.tap_mult} onChange={(x) => up("tap_mult", x.target.value)} /></div>
                <div><label>Daily reward ×</label><input inputMode="decimal" value={e.daily_mult} onChange={(x) => up("daily_mult", x.target.value)} /></div>
                <div><label>One-time bonus (coins)</label><input inputMode="numeric" value={e.bonus} onChange={(x) => up("bonus", x.target.value)} /></div>
              </div>
              <button className="btn sec sm" style={{ marginTop: 6 }} onClick={() => set("events", s.events.filter((_: any, j: number) => j !== i))}>Remove event</button>
            </div>
          );
        })}
        <button className="btn sec sm" style={{ marginTop: 10 }} onClick={() => set("events", [...(s.events || []), { id: "", name: "New event", text: "", start: Date.now(), end: Date.now() + 7 * 86400000, tap_mult: 2, daily_mult: 1, bonus: 0 }])}>Add event</button>
      </div>

      <div className="card">
        <div className="title">Cron / background checks</div>
        <div className="sub">
          Price alerts, limit orders and bot messages are checked whenever someone has the TFUEL tab open. For reliable timing, set a free pinger (cron-job.org) to open
          {" "}<code>https://YOUR-SITE/api/cron?key=CRON_SECRET</code> every 1–5 minutes. Last cron run: <b>{st?.cronAt ? when(st.cronAt) : "never"}</b>
        </div>
        <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
          <span className="pill info">Open sell orders: {st?.openSell ?? 0}</span>
          <span className="pill info">Open buy orders: {st?.openBuy ?? 0}</span>
          <span className="pill info">Price alerts: {st?.alerts ?? 0}</span>
          <button className="btn sec sm" onClick={async () => { await call({ action: "runTriggers" }, "Checked"); loadAll(); }}>Run checks now</button>
        </div>
      </div>

      <div className="card">
        <div className="row"><div><div className="title">Notifications (Telegram bot messages)</div><div className="sub">Energy full, deposit/payout results, stake ready, price alerts, order fills. Users can turn them off. They only work for users who have started your bot.</div></div><Toggle on={s.notify_enabled} onChange={(v) => set("notify_enabled", v)} /></div>
      </div>

      <div className="card">
        <div className="row"><div><div className="title">Limit orders &amp; price alerts</div><div className="sub">Users set a price; the server buys/sells automatically (needs Trading enabled).</div></div><Toggle on={s.orders_enabled} onChange={(v) => set("orders_enabled", v)} /></div>
        <div className="grid3">
          <div><label>Max open orders / user</label><input inputMode="numeric" value={s.max_open_orders} onChange={(e) => set("max_open_orders", e.target.value)} /></div>
          <div><label>Max price alerts / user</label><input inputMode="numeric" value={s.max_alerts} onChange={(e) => set("max_alerts", e.target.value)} /></div>
        </div>
      </div>

      <div className="card">
        <div className="row"><div><div className="title">Lucky Spin</div><div className="sub">Prize is chosen on the server by weight. Higher weight = more likely.</div></div><Toggle on={s.spin_enabled} onChange={(v) => set("spin_enabled", v)} /></div>
        <div style={{ maxWidth: 220 }}><label>Free spins per day</label><input inputMode="numeric" value={s.spin_free_per_day} onChange={(e) => set("spin_free_per_day", e.target.value)} /></div>
        <div style={{ marginTop: 10 }}>
          {s.spin_prizes.map((p: any, i: number) => (
            <div className="grid3" key={i} style={{ alignItems: "end", marginBottom: 6 }}>
              <div><label>Prize (coins)</label><input inputMode="numeric" value={p.coins} onChange={(e) => setPrize(i, "coins", e.target.value)} /><div className="xs muted" style={{ marginTop: 3 }}>= {tf(p.coins)} TFUEL</div></div>
              <div><label>Weight</label><input inputMode="decimal" value={p.weight} onChange={(e) => setPrize(i, "weight", e.target.value)} /><div className="xs muted" style={{ marginTop: 3 }}>{(((Number(p.weight) || 0) / totalW) * 100).toFixed(1)}% chance</div></div>
              <div><button className="btn sec sm" disabled={s.spin_prizes.length <= 2} onClick={() => set("spin_prizes", s.spin_prizes.filter((_: any, j: number) => j !== i))}>Remove</button></div>
            </div>
          ))}
          <button className="btn sec sm" disabled={s.spin_prizes.length >= 12} onClick={() => set("spin_prizes", [...s.spin_prizes, { coins: 100, weight: 5 }])}><Icon name="plus" size={14} /> Add prize</button>
        </div>
        <div className="xs muted" style={{ marginTop: 8 }}>Expected payout per spin ≈ {tf(s.spin_prizes.reduce((a: number, p: any) => a + ((Number(p.coins) || 0) * (Number(p.weight) || 0)) / totalW, 0))} TFUEL</div>
      </div>

      <div className="card">
        <div className="row"><div><div className="title">Leaderboard &amp; weekly prizes</div><div className="sub">Ranks by coins earned (tapping, tasks, rewards, mining). Weeks run Monday–Sunday (UTC). Last week's prizes are paid by the cron job, or with the button below (only once per week).</div></div><Toggle on={s.lb_enabled} onChange={(v) => set("lb_enabled", v)} /></div>
        <label>Prizes for #1, #2, #3… (coins, comma-separated)</label>
        <input value={(s.lb_prizes || []).join(", ")} onChange={(e) => set("lb_prizes", e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean))} placeholder="5000, 3000, 2000, 1000, 1000" />
        <div className="xs muted" style={{ marginTop: 4 }}>= {(s.lb_prizes || []).map((x: any) => tf(x)).join(" · ")} TFUEL</div>
        <div className="toolbar" style={{ marginTop: 10, marginBottom: 0 }}>
          <button className="btn sec sm" onClick={async () => { const r: any = await call({ action: "lbPayout" }); if (r) { setLb(await call({ action: "lbView" })); loadAll(); } }}>Pay last week's prizes now</button>
          <span className="xs muted">Paid weeks: {(st?.paidWeeks || []).join(", ") || "none"}</span>
        </div>
        {lb && (
          <table className="tbl" style={{ marginTop: 10 }}>
            <thead><tr><th>#</th><th>Player</th><th>User ID</th><th>Earned this week</th></tr></thead>
            <tbody>
              {lb.list.map((r: any) => (
                <tr key={r.id}><td>{r.rank}</td><td>{r.name}</td><td>{r.id}</td><td>{tf(r.v)} TFUEL</td></tr>
              ))}
              {lb.list.length === 0 && <tr><td colSpan={4} className="muted">No data yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <div className="row"><div><div className="title">Rewarded ads</div><div className="sub">Users watch an ad for bonus coins, an energy refill or an extra spin. Choose Monetag (zone ID) or Adsgram (block ID).</div></div><Toggle on={s.ads_enabled} onChange={(v) => set("ads_enabled", v)} /></div>
        <div className="grid3">
          <div><label>Ad network</label><select value={s.ads_provider} onChange={(e) => set("ads_provider", e.target.value)}><option value="monetag">Monetag</option><option value="adsgram">Adsgram</option></select></div>
          <div><label>Monetag zone ID</label><input inputMode="numeric" value={s.ads_monetag_zone} onChange={(e) => set("ads_monetag_zone", e.target.value.replace(/\D/g, ""))} placeholder="12010944" /></div>
          <div><label>Monetag reward format</label><select value={s.ads_monetag_format} onChange={(e) => set("ads_monetag_format", e.target.value)}><option value="interstitial">Rewarded interstitial</option><option value="popup">Rewarded popup</option></select></div>
          <div><label>Adsgram Block ID</label><input value={s.ads_block_id} onChange={(e) => set("ads_block_id", e.target.value)} placeholder="e.g. 12345" /></div>
          <div><label>Coins per ad</label><input inputMode="numeric" value={s.ads_coins} onChange={(e) => set("ads_coins", e.target.value)} /><div className="xs muted" style={{ marginTop: 3 }}>= {tf(s.ads_coins)} TFUEL</div></div>
          <div><label>Bonus ads / day</label><input inputMode="numeric" value={s.ads_coins_per_day} onChange={(e) => set("ads_coins_per_day", e.target.value)} /></div>
          <div><label>Energy-refill ads / day</label><input inputMode="numeric" value={s.ads_energy_per_day} onChange={(e) => set("ads_energy_per_day", e.target.value)} /></div>
          <div><label>Extra-spin ads / day</label><input inputMode="numeric" value={s.ads_spin_per_day} onChange={(e) => set("ads_spin_per_day", e.target.value)} /></div>
          <div><label>Monetag in-app interstitial</label><select value={s.ads_inapp ? "1" : "0"} onChange={(e) => set("ads_inapp", e.target.value === "1")}><option value="0">Off</option><option value="1">On (automatic, now and then)</option></select></div>
        </div>
        <div className="xs muted" style={{ marginTop: 8 }}>
          Anti-cheat: the server times each ad and enforces daily limits. For stronger proof, set <code>ADS_SECRET</code> in Vercel and add this Reward URL in Adsgram:
          {" "}<code>https://YOUR-SITE/api/ad-callback?userid=[userId]&amp;secret=ADS_SECRET</code> — then rewards are only paid after Adsgram confirms the view.
        </div>
      </div>

      <div className="card">
        <div className="title">Promo codes</div>
        <div className="sub">One use per user. Share them in your channel or giveaways.</div>
        <div className="grid3" style={{ alignItems: "end" }}>
          <div><label>Code</label><input value={np.code} onChange={(e) => setNp({ ...np, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="WELCOME50" /></div>
          <div><label>Reward (coins)</label><input inputMode="numeric" value={np.coins} onChange={(e) => setNp({ ...np, coins: e.target.value })} /><div className="xs muted" style={{ marginTop: 3 }}>= {tf(np.coins)} TFUEL</div></div>
          <div><label>Max total uses (0 = unlimited)</label><input inputMode="numeric" value={np.max} onChange={(e) => setNp({ ...np, max: e.target.value })} /></div>
          <div><label>Valid for (days, 0 = forever)</label><input inputMode="numeric" value={np.days} onChange={(e) => setNp({ ...np, days: e.target.value })} /></div>
          <div><label>Note (private)</label><input value={np.note} onChange={(e) => setNp({ ...np, note: e.target.value })} /></div>
          <div><button className="btn" disabled={np.code.length < 3 || !(Number(np.coins) > 0)} onClick={addPromo}><Icon name="plus" size={15} /> Create code</button></div>
        </div>
        <table className="tbl" style={{ marginTop: 12 }}>
          <thead><tr><th>Code</th><th>Reward</th><th>Used</th><th>Expires</th><th>Status</th><th /></tr></thead>
          <tbody>
            {promos.map((p) => (
              <tr key={p.code}>
                <td><b>{p.code}</b>{p.note ? <div className="xs muted">{p.note}</div> : null}</td>
                <td>{tf(p.coins)} TFUEL</td>
                <td>{p.used || 0}{p.max > 0 ? ` / ${p.max}` : " / ∞"}</td>
                <td>{p.exp ? when(p.exp) : "Never"}</td>
                <td><span className={`pill ${p.active && (!p.exp || p.exp > Date.now()) && !(p.max > 0 && p.used >= p.max) ? "ok" : "err"}`}>{!p.active ? "Off" : p.exp && p.exp < Date.now() ? "Expired" : p.max > 0 && p.used >= p.max ? "Used up" : "Active"}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn sec sm" onClick={async () => { await call({ action: "savePromo", code: p.code, coins: p.coins, max: p.max, active: !p.active, keepExp: true, note: p.note }, p.active ? "Turned off" : "Turned on"); loadAll(); }}>{p.active ? "Turn off" : "Turn on"}</button>{" "}
                  <button className="btn sec sm" onClick={async () => { if (confirm(`Delete ${p.code}?`)) { await call({ action: "deletePromo", code: p.code }, "Deleted"); loadAll(); } }}>Delete</button>
                </td>
              </tr>
            ))}
            {promos.length === 0 && <tr><td colSpan={6} className="muted">No promo codes yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

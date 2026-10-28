import { useEffect, useState } from "react";
import { PageHead } from "@/components/Cashier";
import { ConfirmSheet, confetti } from "@/components/Ui";
import { api, errText, fmtTf } from "@/lib/client";
import { useAd, useEngage } from "@/components/Engage";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;
const hm = (ms: number) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
function useNow() { const [t, setT] = useState(() => Date.now()); useEffect(() => { const i = setInterval(() => setT(Date.now()), 15000); return () => clearInterval(i); }, []); return t; }

/** Popup when a new level was reached (the reward is already paid) */
export function LevelUpPopup({ up, cpt }: { up: { from: number; to: number; coins: number } | null | undefined; cpt: number }) {
  const [show, setShow] = useState(false);
  useEffect(() => { if (up && up.coins > 0) { setShow(true); confetti(30); } }, [up]);
  if (!show || !up) return null;
  return (
    <div className="sheet-bg" onClick={() => setShow(false)}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} style={{ textAlign: "center" }}>
        <div style={{ fontSize: 46 }}><Icon name="sparkle" size={14} /></div>
        <div className="title" style={{ fontSize: 20 }}>Level {up.to}!</div>
        <div className="sub" style={{ margin: "6px 0 12px" }}>You earned <b>+{fmtTf(up.coins, cpt)} TFUEL</b> for leveling up.</div>
        <button className="btn block" onClick={() => setShow(false)}>Awesome</button>
      </div>
    </div>
  );
}

/** Lucky box + rewarded boost (each needs a rewarded ad) */
export function AdPerks({ eng, say, cpt, reload }: { eng: any; say: Say; cpt: number; reload: () => void }) {
  const { e, load } = useEngage();
  const ad = useAd(e?.ads, say);
  const now = useNow();
  if (!eng || (!eng.box?.on && !eng.boost?.on)) return null;
  const openBox = async () => {
    const r = await ad.watch("box");
    if (r) { confetti(24); say(`Lucky box: +${fmtTf(r.coins, cpt)} TFUEL`, true); load(); reload(); }
  };
  const boost = async () => {
    const r = await ad.watch("boost");
    if (r) { say(`Boost ×${r.mult} is on!`, true); load(); reload(); }
  };
  const act = eng.boost?.until > now;
  return (
    <>
      {eng.box?.on && (
        <div className="card">
          <div className="row">
            <div className="left"><div className="ico gold"><Icon name="gift" /></div><div><div className="title">Free lucky box</div><div className="sub">{fmtTf(eng.box.min, cpt)}–{fmtTf(eng.box.max, cpt)} TFUEL · {eng.box.left} left today</div></div></div>
            <button className="btn sm" disabled={ad.busy || eng.box.left < 1} onClick={openBox}>{eng.box.left < 1 ? "Done" : "Open"}</button>
          </div>
        </div>
      )}
      {eng.boost?.on && (
        <div className="card">
          <div className="row">
            <div className="left"><div className="ico gold"><Icon name="zap" /></div><div><div className="title">Tap ×{eng.boost.mult} boost</div><div className="sub">{act ? `Active · ${hm(eng.boost.until - now)} left` : `Watch an ad for ${eng.boost.minutes} min of ×${eng.boost.mult} taps · ${eng.boost.left} left today`}</div></div></div>
            <button className="btn sm" disabled={ad.busy || eng.boost.left < 1} onClick={boost}>{eng.boost.left < 1 ? "Done" : act ? "Extend" : "Boost"}</button>
          </div>
        </div>
      )}
    </>
  );
}

/** Profile → Perks: season pass + name plate */
export function PerksPage({ eng, say, onBack, cpt, reload }: { eng: any; say: Say; onBack: () => void; cpt: number; reload: () => void }) {
  const [busy, setBusy] = useState("");
  const [text, setText] = useState("");
  const [ask, setAsk] = useState<"" | "pass" | "plate">("");
  const now = useNow();
  const run = async (key: string, body: any, ok: string) => {
    setBusy(key);
    try { await api("eng", body); confetti(18); say(ok, true); reload(); setAsk(""); }
    catch (e) { say(errText(e)); setAsk(""); } finally { setBusy(""); }
  };
  const p = eng?.pass, pl = eng?.plate;
  return (
    <>
      <PageHead title="Perks" onBack={onBack} />
      {!p?.on && !pl?.on && <div className="card empty">No perks are available right now.</div>}
      {p?.on && (
        <div className="card">
          <div className="row"><div className="title">Season pass</div>{p.until > now && <span className="pill ok">Active</span>}</div>
          <div className="sub" style={{ margin: "4px 0 8px" }}>{p.days} days of a daily bonus: <b>+{fmtTf(p.daily, cpt)} TFUEL</b> every day.{p.until > now ? ` Active until ${new Date(p.until).toLocaleDateString()}.` : ""}</div>
          {p.until > now && <button className="btn block" style={{ marginBottom: 8 }} disabled={p.claimed || !!busy} onClick={() => run("pc", { action: "passClaim" }, "Daily bonus claimed")}>{p.claimed ? "Claimed today" : "Claim today's bonus"}</button>}
          <button className="btn sec block" disabled={!!busy} onClick={() => setAsk("pass")}>{p.until > now ? "Extend" : "Get"} for {fmtTf(p.price, cpt)} TFUEL</button>
        </div>
      )}
      {pl?.on && (
        <div className="card">
          <div className="title">Name tag</div>
          <div className="sub" style={{ margin: "4px 0 8px" }}>A short tag shown next to your name on leaderboards{pl.cur ? <> — now: <b>«{pl.cur}»</b></> : ""}.</div>
          <input maxLength={pl.max} value={text} onChange={(e) => setText(e.target.value)} placeholder={`3–${pl.max} characters`} />
          <button className="btn block" style={{ marginTop: 8 }} disabled={text.trim().length < 3 || !!busy} onClick={() => setAsk("plate")}>Set tag · {fmtTf(pl.price, cpt)} TFUEL</button>
        </div>
      )}
      {ask === "pass" && <ConfirmSheet title="Season pass" busy={busy === "pp"} rows={[["Length", `${p.days} days`], ["Daily bonus", `${fmtTf(p.daily, cpt)} TFUEL`], ["Price", `${fmtTf(p.price, cpt)} TFUEL`]]} onConfirm={() => run("pp", { action: "passBuy" }, "Season pass active")} onCancel={() => setAsk("")} />}
      {ask === "plate" && <ConfirmSheet title="Set name tag" busy={busy === "pl"} rows={[["Tag", `«${text.trim()}»`], ["Price", `${fmtTf(pl.price, cpt)} TFUEL`]]} onConfirm={() => run("pl", { action: "plateBuy", text }, "Tag updated")} onCancel={() => setAsk("")} />}
    </>
  );
}

/** Invite milestones */
export function MilestonesCard({ eng, say, cpt, reload }: { eng: any; say: Say; cpt: number; reload: () => void }) {
  const [busy, setBusy] = useState(0);
  const m = eng?.ms;
  if (!m?.on || !m.steps?.length) return null;
  const claim = async (n: number) => {
    setBusy(n);
    try { const r: any = await api("eng", { action: "msClaim", n }); confetti(20); say(`+${fmtTf(r.coins, cpt)} TFUEL`, true); reload(); }
    catch (e) { say(errText(e)); } finally { setBusy(0); }
  };
  return (
    <div className="card">
      <div className="title">Invite milestones</div>
      <div className="sub" style={{ margin: "4px 0 6px" }}>{m.friends} friend{m.friends === 1 ? "" : "s"} invited.</div>
      {m.steps.map((x: any) => (
        <div className="hist" key={x.n}>
          <div className="left"><span style={{ fontSize: 18, width: 30 }}><Icon name={x.claimed ? "check" : x.ready ? "gift" : "lock"} size={18} /></span><div><div className="title" style={{ fontSize: 14 }}>{x.n} friends</div><div className="sub" style={{ margin: 0 }}>+{fmtTf(x.coins, cpt)} TFUEL</div></div></div>
          {x.ready && <button className="btn sm" disabled={!!busy} onClick={() => claim(x.n)}>Claim</button>}
          {!x.ready && !x.claimed && <span className="muted xs">{Math.max(0, x.n - m.friends)} to go</span>}
        </div>
      ))}
    </div>
  );
}

/** Gift a friend (friends = people you invited or who invited you) */
export function GiftCard({ eng, say }: { eng: any; say: Say }) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const on = eng?.gift?.on;
  useEffect(() => { if (on) api<any>("eng", { action: "gifts" }).then((r) => setD(r.gifts)).catch(() => {}); }, [on]);
  if (!on || !d || !d.friends.length) return null;
  const send = async (id: string) => {
    setBusy(id);
    try { const r: any = await api("eng", { action: "giftSend", to: id }); setD(r.gifts); confetti(12); say(`Gift sent! You both got coins.`, true); }
    catch (e) { say(errText(e)); } finally { setBusy(""); }
  };
  return (
    <div className="card">
      <div className="title">Gift a friend</div>
      <div className="sub" style={{ margin: "4px 0 6px" }}>Your friend gets {d.recv} coins and you get {d.send}. {d.left} gift{d.left === 1 ? "" : "s"} left today.</div>
      {d.friends.slice(0, 12).map((f: any) => (
        <div className="hist" key={f.id}>
          <span>{f.name}</span>
          <button className="btn sec sm" disabled={f.sent || d.left < 1 || !!busy} onClick={() => send(f.id)}>{f.sent ? "Sent" : "Gift"}</button>
        </div>
      ))}
    </div>
  );
}

/** Creator program: apply, status, stats */
export function CreatorCard({ eng, say }: { eng: any; say: Say }) {
  const c = eng?.creator;
  const [link, setLink] = useState("");
  const [subs, setSubs] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  if (!c?.on) return null;
  const apply = async () => {
    setBusy(true);
    try { await api("eng", { action: "creatorApply", link: link.trim(), subs: Number(subs) }); setSent(true); say("Application sent", true); }
    catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  const st = sent ? "pending" : c.status;
  return (
    <div className="card">
      <div className="row"><div className="title">Creator program</div>{st === "approved" && <span className="pill ok">Creator</span>}{st === "pending" && <span className="pill">In review</span>}</div>
      {st === "approved" ? <div className="sub" style={{ marginTop: 4 }}>You earn <b>+{c.bonus}%</b> extra commission on everything your friends earn. Thanks for spreading the word!</div> : st === "pending" ? <div className="sub" style={{ marginTop: 4 }}>We&apos;re reviewing your application.</div> : (
        <>
          <div className="sub" style={{ margin: "4px 0 8px" }}>Have a channel or an audience? Creators get <b>+{c.bonus}%</b> extra commission.{c.status === "rejected" && c.note ? ` Last note: ${c.note}.` : ""}</div>
          <label>Your channel / profile link</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://t.me/yourchannel" />
          <label>Followers (at least {c.min})</label>
          <input inputMode="numeric" value={subs} onChange={(e) => setSubs(e.target.value.replace(/\D/g, ""))} />
          <button className="btn block" style={{ marginTop: 8 }} disabled={busy || !/^https:\/\//i.test(link.trim()) || Number(subs) < c.min} onClick={apply}>Apply</button>
        </>
      )}
    </div>
  );
}

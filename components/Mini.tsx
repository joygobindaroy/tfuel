import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icons";
import { PageHead } from "@/components/Cashier";
import { Empty, SkelList, confetti } from "@/components/Ui";
import { api, errText, fmtTf, haptic } from "@/lib/client";

type P = { say: (m: string, ok?: boolean) => void; onBack: () => void; cpt: number; reload: () => void };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const when = (t: number) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function usePlay(say: P["say"]) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(async () => { try { setD(await api<any>("play", { action: "view" })); setErr(false); } catch (e: any) { setErr(true); say(errText(e)); } }, [say]);
  useEffect(() => { load(); }, [load]);
  return { d, load, err };
}

/** VIP pass: buy / extend with USDT */
export function VipPage({ say, onBack, reload }: P) {
  const { d, load, err } = usePlay(say);
  const [busy, setBusy] = useState(false);
  const head = <PageHead title="VIP pass" onBack={onBack} />;
  if (!d) return <>{head}{err ? <Empty icon="alert" title="Couldn't load" hint="Check your connection."><button className="btn sm" onClick={load}>Try again</button></Empty> : <SkelList n={3} />}</>;
  const v = d.vip;
  if (!v.enabled) return <>{head}<Empty icon="alert" title="Not available right now" hint="The VIP pass is turned off." /></>;
  const buy = async () => {
    if (busy) return; setBusy(true);
    try { await api("play", { action: "vipBuy" }); confetti(); haptic("success"); say("VIP pass active!", true); reload(); load(); } catch (e: any) { say(errText(e)); }
    setBusy(false);
  };
  const trial = async () => {
    if (busy) return; setBusy(true);
    try { await api("play", { action: "vipTrial" }); confetti(); haptic("success"); say("Free trial started!", true); reload(); load(); } catch (e: any) { say(errText(e)); }
    setBusy(false);
  };
  return (
    <>
      {head}
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 46 }}>{v.badge || <span style={{ color: "#f5a623", display: "inline-flex" }}><Icon name="crown" size={46} /></span>}</div>
        <div className="title">{v.active ? "You are VIP" : "Get the VIP pass"}</div>
        {v.active && <div className="sub">Active until {when(v.until)}</div>}
        <div style={{ textAlign: "left", margin: "14px 0" }}>
          {v.daily_pct > 0 && <div className="sumrow"><span className="muted">Daily reward</span><b>+{v.daily_pct}%</b></div>}
          {v.fee_off_pct > 0 && <div className="sumrow"><span className="muted">Send fee discount</span><b>−{v.fee_off_pct}%</b></div>}
          <div className="sumrow"><span className="muted">Badge next to your name</span><b>{v.badge}</b></div>
          <div className="sumrow"><span className="muted">Duration</span><b>{v.days} days</b></div>
        </div>
        <button className="btn" style={{ width: "100%" }} disabled={busy} onClick={buy}>{busy ? "Please wait…" : `${v.active ? "Extend" : "Buy"} for ${v.price} USDT`}</button>
        {v.trial > 0 && !v.active && <button className="btn sec" style={{ width: "100%", marginTop: 8 }} disabled={busy} onClick={trial}><Icon name="gift" size={14} /> Try free for {v.trial} days</button>}
        <div className="xs muted" style={{ marginTop: 8 }}>Paid from your USDT balance. Extending adds days to your current pass.</div>
      </div>
    </>
  );
}

/* ───────── Memory match ───────── */
function Memory({ cfg, say, reload, done }: { cfg: any; say: P["say"]; reload: () => void; done: () => void }) {
  const [g, setG] = useState<{ id: string; n: number } | null>(null);
  const [sym, setSym] = useState<Record<number, string>>({});
  const [matched, setMatched] = useState<number[]>([]);
  const [open, setOpen] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [lock, setLock] = useState(false);
  const [res, setRes] = useState<any>(null);
  const start = async () => {
    try {
      const r = await api<any>("play", { action: "memStart" });
      const m: Record<number, string> = {}; (r.symbols || []).forEach(([i, s]: [number, string]) => (m[i] = s));
      setSym(m); setMatched(r.matched || []); setOpen([]); setMoves(r.moves || 0); setRes(null); setG({ id: r.id, n: r.cards }); done();
    } catch (e: any) { say(errText(e)); }
  };
  const flip = async (i: number) => {
    if (!g || lock || matched.includes(i) || open.includes(i) || res) return;
    setLock(true); haptic("light");
    try {
      const r = await api<any>("play", { action: "memFlip", id: g.id, idx: i });
      setSym((m) => ({ ...m, [i]: r.sym }));
      if (r.phase === "first") { setOpen([i]); }
      else {
        setOpen([r.first, i]); setMoves(r.moves);
        if (r.match) { await sleep(350); setMatched((m) => [...m, r.first, i]); setOpen([]); }
        else { await sleep(800); setOpen([]); }
        if (r.phase === "done") { setRes(r); if (r.reward > 0) { confetti(); say(`+${fmtTf(r.reward, 1)} coins`, true); reload(); } }
      }
    } catch (e: any) { say(errText(e)); }
    setLock(false);
  };
  return (
    <div className="card">
      <div className="title"><Icon name="bulb" size={14} /> Memory match</div>
      <div className="sub">Find all pairs in {cfg.max_moves} moves or fewer for the full reward: <b>{cfg.reward} coins</b>. {cfg.left} plays left today.</div>
      {!g || res ? (
        <>
          {res && <div className="sub" style={{ marginTop: 8 }}>{res.reward > 0 ? <>Done in {res.moves} moves · <b>+{res.reward} coins</b></> : "Finished — no reward this time."}</div>}
          <button className="btn" style={{ marginTop: 10 }} disabled={cfg.left <= 0 && !g} onClick={start}>{res ? "Play again" : "Start"}</button>
        </>
      ) : (
        <>
          <div className="xs muted" style={{ margin: "6px 0" }}>Moves: {moves}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {Array.from({ length: g.n }, (_, i) => {
              const show = matched.includes(i) || open.includes(i);
              return <button key={i} onClick={() => flip(i)} className="btn sec" style={{ height: 64, fontSize: 28, padding: 0, opacity: matched.includes(i) ? 0.55 : 1 }}>{show ? sym[i] : "?"}</button>;
            })}
          </div>
        </>
      )}
    </div>
  );
}

/* ───────── Crypto trivia ───────── */
function Trivia({ cfg, say, reload, done }: { cfg: any; say: P["say"]; reload: () => void; done: () => void }) {
  const [q, setQ] = useState<any>(null);
  const [id, setId] = useState("");
  const [pick, setPick] = useState<{ right: boolean; answer: number; i: number } | null>(null);
  const [fin, setFin] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    try { const r = await api<any>("play", { action: "triStart" }); setId(r.id); setQ(r); setFin(null); setPick(null); done(); } catch (e: any) { say(errText(e)); }
  };
  const answer = async (i: number) => {
    if (busy || pick) return; setBusy(true);
    try {
      const r = await api<any>("play", { action: "triAnswer", id, choice: i });
      setPick({ right: r.right, answer: r.answer, i }); haptic(r.right ? "success" : "error");
      await sleep(1100);
      if (r.done) { setFin(r); setQ(null); if (r.reward > 0) { confetti(); reload(); } }
      else setQ({ ...r.next });
      setPick(null);
    } catch (e: any) { say(errText(e)); setQ(null); }
    setBusy(false);
  };
  return (
    <div className="card">
      <div className="title"><Icon name="help" size={14} /> Crypto trivia</div>
      <div className="sub">{cfg.rounds} questions · <b>{cfg.per_correct} coins</b> per correct answer · {cfg.left} plays left today.</div>
      {q ? (
        <div style={{ marginTop: 10 }}>
          <div className="xs muted">Question {q.i + 1} of {q.n}</div>
          <div className="b" style={{ margin: "6px 0 10px" }}>{q.q}</div>
          {q.opts.map((o: string, i: number) => {
            const st = pick ? (i === pick.answer ? "ok" : i === pick.i ? "err" : "") : "";
            return <button key={i} className="btn sec" disabled={busy} onClick={() => answer(i)} style={{ width: "100%", marginBottom: 6, textAlign: "left", borderColor: st === "ok" ? "#22c55e" : st === "err" ? "#ef4444" : undefined }}>{o}</button>;
          })}
        </div>
      ) : (
        <>
          {fin && <div className="sub" style={{ marginTop: 8 }}>{fin.correct}/{fin.n} correct · {fin.reward > 0 ? <b>+{fin.reward} coins</b> : "no reward"}</div>}
          <button className="btn" style={{ marginTop: 10 }} disabled={cfg.left <= 0 && !fin} onClick={start}>{fin ? "Play again" : "Start"}</button>
        </>
      )}
    </div>
  );
}

/* ───────── Treasure hunt ───────── */
function Hunt({ cfg, say, reload, done }: { cfg: any; say: P["say"]; reload: () => void; done: () => void }) {
  const [r, setR] = useState<{ tile: number; reward: number; board: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const play = async (tile: number) => {
    if (busy) return; setBusy(true);
    try { const x = await api<any>("play", { action: "hunt", tile }); setR({ tile, reward: x.reward, board: x.board }); if (x.reward > 0) { confetti(); haptic("success"); reload(); } done(); } catch (e: any) { say(errText(e)); }
    setBusy(false);
  };
  return (
    <div className="card">
      <div className="title"><Icon name="map" size={14} /> Treasure hunt</div>
      <div className="sub">Pick one tile — free to play. Prizes {cfg.min}–{cfg.max} coins. {cfg.left} picks left today.</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
        {Array.from({ length: 9 }, (_, i) => (
          <button key={i} className="btn sec" disabled={busy || (!r && cfg.left <= 0)} onClick={() => (r ? setR(null) : play(i))} style={{ height: 58, fontSize: 16, outline: r?.tile === i ? "2px solid var(--accent, #f5a623)" : undefined }}>
            {r ? (r.board[i] > 0 ? `${r.board[i]}` : "·") : <Icon name="box" size={22} />}
          </button>
        ))}
      </div>
      {r && <div className="sub" style={{ marginTop: 8 }}>{r.reward > 0 ? <>You found <b>{r.reward} coins</b>! Tap any tile to play again.</> : "Empty box. Tap any tile to try again."}</div>}
    </div>
  );
}

/* ───────── Tournaments ───────── */
function Tours({ tours, say, load }: { tours: any[]; say: P["say"]; load: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [board, setBoard] = useState<any[]>([]);
  const show = async (id: string) => { if (open === id) return setOpen(null); try { const r = await api<any>("play", { action: "tourBoard", id }); setBoard(r.board); setOpen(id); } catch (e: any) { say(errText(e)); } };
  const join = async (id: string) => { try { await api("play", { action: "tourJoin", id }); say("Joined! Play the game now to set your score.", true); load(); } catch (e: any) { say(errText(e)); } };
  if (!tours.length) return null;
  return (
    <>
      <div className="mhead">Tournaments · free entry</div>
      {tours.map((t) => (
        <div className="card" key={t.id}>
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="b"><Icon name={t.game === "memory" ? "bulb" : "help"} size={14} /> {t.title}</div>
              <div className="xs muted">{t.state === "soon" ? `Starts ${when(t.start)}` : t.paid ? "Finished" : `Ends ${when(t.end)}`} · prizes: {t.prizes.map((p: number, i: number) => `#${i + 1} ${p}`).join(" · ")} coins</div>
              {t.mine && <div className="xs" style={{ marginTop: 2 }}>Your best: {t.game === "memory" ? `${t.mine.moves} moves` : `${t.mine.correct} correct`}</div>}
            </div>
            <div className="gap">
              {!t.paid && !t.joined && <button className="btn sm" onClick={() => join(t.id)}>Join</button>}
              <button className="btn sec sm" onClick={() => show(t.id)}>{open === t.id ? "Hide" : "Board"}</button>
            </div>
          </div>
          {open === t.id && (board.length ? board.map((r) => <div className="sumrow" key={r.rank} style={r.me ? { fontWeight: 700 } : undefined}><span>#{r.rank} {r.name}</span><span>{t.game === "memory" ? `${r.moves} moves` : `${r.correct} correct`}{r.prize ? ` · ${r.prize} coins` : ""}</span></div>) : <div className="xs muted" style={{ marginTop: 8 }}>No scores yet.</div>)}
        </div>
      ))}
    </>
  );
}

export function MiniPage({ say, onBack, reload }: P) {
  const { d, load, err } = usePlay(say);
  const head = <PageHead title="Mini games" onBack={onBack} />;
  if (!d) return <>{head}{err ? <Empty icon="alert" title="Couldn't load" hint="Check your connection."><button className="btn sm" onClick={load}>Try again</button></Empty> : <SkelList n={3} />}</>;
  const m = d.mini;
  if (!m.enabled) return <>{head}<Empty icon="alert" title="Not available right now" hint="Mini games are turned off." /></>;
  return (
    <>
      {head}
      <div className="sub" style={{ margin: "4px 2px 12px" }}>Free to play — no stake, no risk. Rewards are small coins from the app, limited per day.</div>
      {m.quest && (
        <div className="card">
          <div className="title" style={{ fontSize: 14 }}><Icon name="target" size={14} /> Daily quest</div>
          <div className="sub">Play {m.quest.plays} games today for <b>+{m.quest.bonus} coins</b>. {m.quest.played >= m.quest.plays ? "Done for today" : `${m.quest.played}/${m.quest.plays} played.`}</div>
          <div className="xs muted" style={{ marginTop: 4 }}><Icon name="flame" size={14} /> Streak: {m.quest.streak} day{m.quest.streak === 1 ? "" : "s"} · every {m.quest.streak_days} days: +{m.quest.streak_bonus} coins</div>
        </div>
      )}
      {m.memory && <Memory cfg={m.memory} say={say} reload={reload} done={load} />}
      {m.trivia && <Trivia cfg={m.trivia} say={say} reload={reload} done={load} />}
      {m.hunt && <Hunt cfg={m.hunt} say={say} reload={reload} done={load} />}
      <Tours tours={m.tours || []} say={say} load={load} />
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { PageHead } from "@/components/Cashier";
import { Empty, SkelList, ConfirmSheet, confetti } from "@/components/Ui";
import { api, errText, fmtTf, haptic } from "@/lib/client";
import Icon from "@/components/Icons";

type P = { say: (m: string, ok?: boolean) => void; onBack: () => void; cpt: number; reload: () => void };

const num = (n: number) => Math.round(n).toLocaleString("en-US");
const pad2 = (n: number) => String(n).padStart(2, "0");
function left(ms: number) {
  if (ms <= 0) return "ended";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : `${pad2(h)}:${pad2(m)}:${pad2(s % 60)}`;
}
function useNow(step = 1000) {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), step); return () => clearInterval(i); }, [step]);
  return t;
}
/** wallet balance in coins (for disabling buy buttons) */
function useBalance() {
  const [bal, setBal] = useState<number | null>(null);
  const refresh = useCallback(async () => { try { const d = await api<any>("me"); setBal(Number(d?.user?.balance) || 0); } catch {} }, []);
  useEffect(() => { refresh(); }, [refresh]);
  return { bal, refresh };
}
/** load one `more` action and keep its result */
function useMore<T>(action: string, key: string, say: P["say"]) {
  const [d, setD] = useState<T | null>(null);
  const [err, setErr] = useState(false);
  const load = useCallback(async () => {
    try { const r = await api<any>("more", { action }); setD(r[key]); setErr(false); } catch (e: any) { setErr(true); say(errText(e)); }
  }, [action, key, say]);
  useEffect(() => { load(); }, [load]);
  return { d, setD, load, err };
}
const Retry = ({ onClick }: { onClick: () => void }) => (
  <Empty icon="alert" title="Couldn't load this page" hint="Check your connection and try again."><button className="btn sm" onClick={onClick}>Try again</button></Empty>
);
const Off = () => <Empty icon="alert" title="Not available right now" hint="This feature is turned off. Please check back later." />;
const note = (t: string) => <div className="sub" style={{ margin: "4px 2px 12px" }}>{t}</div>;

/* ---------------------------------------------------------------- Clan */
interface ClanMine {
  id: string; name: string; tag: string; owner: boolean; members: number; score: number; rank: number | null; myContribution: number; bossClaimed: boolean;
  ann?: string;
  roster: { id: string; name: string; v: number; owner: boolean; me: boolean }[];
  boss: { name: string; emoji: string; hp: number; damage: number; pct: number; defeated: boolean; reward: number } | null;
}
interface ClanV {
  enabled: boolean; createCost: number; maxMembers: number; prizes: number[]; endsAt: number; mine: ClanMine | null;
  list: { id: string; name: string; tag: string; members: number; full: boolean }[];
  ranks: { rank: number; id: string; name?: string; tag?: string; v: number }[];
}
export function ClanPage({ say, onBack, cpt, reload, tip }: P & { tip?: { on: boolean; amounts: number[]; fee: number } }) {
  const { d, setD, load, err } = useMore<ClanV>("clan", "clan", say);
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [ask, setAsk] = useState<null | { kind: "leave" } | { kind: "kick"; id: string; name: string } | { kind: "create" } | { kind: "tip"; id: string; name: string }>(null);
  const [ann, setAnn] = useState("");
  const now = useNow();
  const money = (c: number) => `${fmtTf(c, cpt)} TFUEL`;

  const run = async (key: string, body: Record<string, any>, ok?: string, after?: (r: any) => void) => {
    if (busy) return;
    setBusy(key);
    try {
      const r = await api<any>("more", body);
      if (r.clan) setD(r.clan);
      haptic("success");
      if (ok) say(ok, true);
      after?.(r);
      reload();
    } catch (e: any) {
      haptic("error");
      say(key === "claim" && e?.message === "already_claimed" ? "You've already claimed this reward." : errText(e));
    }
    setBusy(""); setAsk(null);
  };

  const head = <PageHead title="Clan & raid boss" onBack={onBack} />;
  if (!d) return <>{head}{err ? <Retry onClick={load} /> : <SkelList n={4} />}</>;
  if (!d.enabled) return <>{head}<Off /></>;
  const m = d.mine;
  const nameOk = /^[A-Za-z0-9][A-Za-z0-9 _.-]{2,19}$/.test(name.trim());
  const tagOk = /^[A-Za-z0-9]{2,5}$/.test(tag.trim());

  if (!m) {
    return (
      <>
        {head}
        <div className="card">
          <div className="title">Create a clan</div>
          <div className="sub">Name: 3-20 letters, numbers, spaces, . _ -  ·  Tag: 2-5 letters or numbers. Up to {d.maxMembers} members.</div>
          <input className="input" style={{ marginTop: 10 }} placeholder="Clan name" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
          <input className="input" style={{ marginTop: 8, textTransform: "uppercase" }} placeholder="TAG" maxLength={5} value={tag} onChange={(e) => setTag(e.target.value.replace(/[^A-Za-z0-9]/g, ""))} />
          <div className="row" style={{ marginTop: 10 }}>
            <span className="sub">Cost: <b>{d.createCost > 0 ? money(d.createCost) : "Free"}</b></span>
            <button className="btn" disabled={!nameOk || !tagOk || !!busy} onClick={() => setAsk({ kind: "create" })}>Create clan</button>
          </div>
        </div>
        <div className="title" style={{ margin: "6px 2px 8px" }}>Open clans</div>
        {d.list.length === 0 ? <Empty icon="users" title="No clans yet" hint="Be the first to create one." /> : d.list.map((c) => (
          <div className="card" key={c.id}>
            <div className="row">
              <div><div className="title">[{c.tag}] {c.name}</div><div className="sub">{c.members}/{d.maxMembers} members</div></div>
              <button className="btn sm" disabled={c.full || !!busy} onClick={() => run("join" + c.id, { action: "clanJoin", id: c.id }, `Joined ${c.name}!`)}>{c.full ? "Full" : busy === "join" + c.id ? "…" : "Join"}</button>
            </div>
          </div>
        ))}
        {d.ranks.length > 0 && <Board d={d} money={money} now={now} />}
        {ask?.kind === "create" && (
          <ConfirmSheet title="Create this clan?" rows={[["Name", name.trim()], ["Tag", tag.toUpperCase()], ["Cost", d.createCost > 0 ? money(d.createCost) : "Free"]]} busy={busy === "create"}
            onCancel={() => setAsk(null)} onConfirm={() => run("create", { action: "clanCreate", name: name.trim(), tag }, "Clan created!", () => { setName(""); setTag(""); })} />
        )}
      </>
    );
  }

  const b = m.boss;
  const canClaim = !!b?.defeated && m.myContribution > 0 && !m.bossClaimed;
  return (
    <>
      {head}
      <div className="card">
        <div className="row">
          <div><div className="title" style={{ fontSize: 17 }}>[{m.tag}] {m.name}</div><div className="sub">{m.members}/{d.maxMembers} members · {m.owner ? "You are the leader" : "Member"}</div></div>
          <div style={{ textAlign: "right" }}><div className="title num">{m.rank ? "#" + m.rank : "—"}</div><div className="sub">weekly rank</div></div>
        </div>
        <div className="sub" style={{ marginTop: 8 }}>Clan score this week: <b className="num">{num(m.score)}</b> · Your part: <b className="num">{num(m.myContribution)}</b></div>
        <div className="sub">Week resets in {left(d.endsAt - now)}. Every coin members earn counts toward the clan.</div>
      </div>

      {b && (
        <div className="card">
          <div className="row">
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 34 }}>{b.emoji}</span>
              <div><div className="title">{b.name}</div><div className="sub">Weekly raid boss</div></div>
            </div>
            <span className={"pill " + (b.defeated ? "ok" : "warn")}>{b.defeated ? "Defeated" : "Alive"}</span>
          </div>
          <div className="bar" style={{ margin: "12px 0 6px" }}><div style={{ width: `${b.pct}%` }} /></div>
          <div className="row"><span className="sub num">{num(b.damage)} / {num(b.hp)} HP</span><span className="sub num">{b.pct}%</span></div>
          <div className="sub" style={{ marginTop: 6 }}>Your damage: <b className="num">{num(m.myContribution)}</b> · Reward: <b>{money(b.reward)}</b> for each member who dealt damage.</div>
          {b.defeated && (
            <button className="btn block" style={{ marginTop: 10 }} disabled={!canClaim || !!busy}
              onClick={() => run("claim", { action: "bossClaim" }, undefined, (r) => { confetti(); say(`Reward claimed: +${money(Number(r.reward) || b.reward)}`, true); })}>
              {m.bossClaimed ? "Reward claimed" : m.myContribution > 0 ? (busy === "claim" ? "Claiming…" : `Claim ${money(b.reward)}`) : "No damage dealt, no reward"}
            </button>
          )}
        </div>
      )}

      {(m.ann || m.owner) && (
        <div className="card">
          <div className="title" style={{ marginBottom: 4 }}><Icon name="megaphone" size={14} /> Announcement</div>
          {m.ann ? <div className="sub" style={{ whiteSpace: "pre-wrap" }}>{m.ann}</div> : <div className="sub">Nothing posted yet.</div>}
          {m.owner && (
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <input maxLength={200} placeholder="Write to all members…" value={ann} onChange={(e) => setAnn(e.target.value)} />
              <button className="btn sm" disabled={ann.trim().length < 3 || !!busy} onClick={async () => { setBusy("ann"); try { await api("eng", { action: "clanAnnounce", text: ann }); setAnn(""); say("Announcement sent to your members", true); await load(); } catch (e) { say(errText(e)); } setBusy(""); }}>Post</button>
            </div>
          )}
        </div>
      )}
      <div className="card">
        <div className="title" style={{ marginBottom: 4 }}>Members this week</div>
        {m.roster.map((r) => (
          <div className="hist" key={r.id}>
            <span>{r.name}{r.owner ? <> <Icon name="crown" size={13} /></> : null}{r.me ? " (you)" : ""}</span>
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <b className="num">{num(r.v)}</b>
              {tip?.on && !r.me && <button className="btn sec sm" disabled={!!busy} onClick={() => setAsk({ kind: "tip", id: r.id, name: r.name })}><Icon name="heart" size={14} /> Tip</button>}
              {m.owner && !r.me && <button className="btn sec sm" disabled={!!busy} onClick={() => setAsk({ kind: "kick", id: r.id, name: r.name })}>Remove</button>}
            </span>
          </div>
        ))}
      </div>

      <Board d={d} money={money} now={now} mineId={m.id} />
      <button className="btn sec block" disabled={!!busy} onClick={() => setAsk({ kind: "leave" })}>Leave clan</button>

      {ask?.kind === "leave" && (
        <ConfirmSheet title="Leave clan?" rows={[["Clan", `[${m.tag}] ${m.name}`]]} warn={m.owner ? "Leadership will pass to the longest-standing member. If you are the last member, the clan is deleted." : "Your weekly contribution stays with the clan."}
          busy={busy === "leave"} confirmLabel="Leave" onCancel={() => setAsk(null)} onConfirm={() => run("leave", { action: "clanLeave" }, "You left the clan.")} />
      )}
      {ask?.kind === "tip" && tip && (
        <div className="sheet-bg" onClick={() => setAsk(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="title" style={{ fontSize: 17 }}>Tip {ask.name}</div>
            <div className="sub" style={{ margin: "4px 0 10px" }}>Say thanks with a few coins. A {tip.fee}% fee applies.</div>
            <div className="chips">
              {tip.amounts.map((a) => <button key={a} className="chip" disabled={!!busy} onClick={async () => { setBusy("tip"); try { await api("eng", { action: "tip", to: ask.id, amount: a }); haptic(); say(`Tip sent: ${num(a)} coins`, true); reload(); } catch (e) { say(errText(e)); } setBusy(""); setAsk(null); }}>{num(a)}</button>)}
            </div>
          </div>
        </div>
      )}
      {ask?.kind === "kick" && (
        <ConfirmSheet title="Remove member?" rows={[["Member", ask.name]]} busy={busy === "kick"} confirmLabel="Remove" onCancel={() => setAsk(null)}
          onConfirm={() => run("kick", { action: "clanKick", uid: ask.id }, "Member removed.")} />
      )}
    </>
  );
}
function Board({ d, money, now, mineId }: { d: ClanV; money: (c: number) => string; now: number; mineId?: string }) {
  return (
    <div className="card">
      <div className="row"><div className="title">Clan leaderboard</div><span className="sub">resets in {left(d.endsAt - now)}</span></div>
      {d.prizes.length > 0 && <div className="sub" style={{ marginBottom: 4 }}>Weekly prizes: {d.prizes.map((p, i) => `#${i + 1} ${money(p)}`).join(" · ")}. Each prize is shared among members who contributed.</div>}
      {d.ranks.length === 0 ? <div className="sub" style={{ padding: "8px 0" }}>No scores yet this week.</div> : d.ranks.map((r) => (
        <div className="hist" key={r.id} style={r.id === mineId ? { fontWeight: 700 } : undefined}>
          <span>#{r.rank} {r.tag ? `[${r.tag}] ` : ""}{r.name || "Clan"}{r.id === mineId ? " (yours)" : ""}</span>
          <b className="num">{num(r.v)}</b>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Rigs */
interface RigsV {
  enabled: boolean; capHours: number; perHour: number; pending: number; full: boolean;
  tiers: { id: string; name: string; emoji: string; price: number; rate: number; owned: number; next: number }[];
}
export function RigsPage({ say, onBack, cpt, reload }: P) {
  const { d, setD, load, err } = useMore<RigsV>("rigs", "rigs", say);
  const { bal, refresh } = useBalance();
  const [busy, setBusy] = useState("");
  const [ask, setAsk] = useState<RigsV["tiers"][0] | null>(null);
  const tf = (c: number) => `${fmtTf(c, cpt)} TFUEL`;
  const rate = (c: number) => `${fmtTf(c, cpt)} TFUEL/h`;
  // live pending estimate between refreshes
  const now = useNow(5000);
  const [at, setAt] = useState(() => Date.now());
  useEffect(() => { setAt(Date.now()); }, [d]);
  const live = d ? Math.min(d.full ? d.pending : Infinity, d.pending + (d.full ? 0 : (d.perHour * (now - at)) / 3600000)) : 0;

  const act = async (key: string, body: Record<string, any>, ok: (r: any) => string) => {
    if (busy) return;
    setBusy(key);
    try { const r = await api<any>("more", body); setD(r.rigs); haptic("success"); say(ok(r), true); reload(); refresh(); }
    catch (e: any) { haptic("error"); say(errText(e)); }
    setBusy(""); setAsk(null);
  };

  const head = <PageHead title="Mining rigs" onBack={onBack} />;
  if (!d) return <>{head}{err ? <Retry onClick={load} /> : <SkelList n={4} />}</>;
  if (!d.enabled) return <>{head}<Off /></>;
  return (
    <>
      {head}
      <div className="card">
        <div className="sub">Ready to collect</div>
        <div className="title num" style={{ fontSize: 26 }}>{tf(Math.floor(live))}</div>
        <div className="sub" style={{ margin: "4px 0 10px" }}>Income: <b>{rate(d.perHour)}</b>. Rigs stop producing after {d.capHours} hours, so collect at least that often.{d.full ? " Your storage is full, collect now." : ""}</div>
        <button className="btn block" disabled={Math.floor(live) < 1 || !!busy} onClick={() => act("collect", { action: "rigCollect" }, (r) => `Collected +${tf(Number(r.amount) || 0)}`)}>{busy === "collect" ? "Collecting…" : "Collect"}</button>
      </div>
      {note("Rigs are bought once with TFUEL. Each extra rig of the same tier costs a bit more. Income is a fixed rate per hour, and it may take a while to earn back the price.")}
      {d.tiers.map((t) => {
        const low = bal !== null && bal < t.next;
        const max = t.owned >= 100;
        return (
          <div className="card" key={t.id}>
            <div className="row">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span style={{ fontSize: 30 }}>{t.emoji}</span>
                <div><div className="title">{t.name}</div><div className="sub">+{rate(t.rate)} each · owned <b>{t.owned}</b></div></div>
              </div>
              <button className="btn sm" disabled={low || max || !!busy} onClick={() => setAsk(t)}>{max ? "Max" : tf(t.next)}</button>
            </div>
            {low && <div className="sub" style={{ marginTop: 6 }}>Not enough balance yet.</div>}
          </div>
        );
      })}
      {ask && (
        <ConfirmSheet title={`Buy ${ask.name}?`} rows={[["Price", tf(ask.next)], ["Adds", rate(ask.rate)], ["You will own", String(ask.owned + 1)]]} busy={busy === "buy"} confirmLabel="Buy"
          onCancel={() => setAsk(null)} onConfirm={() => act("buy", { action: "rigBuy", id: ask.id }, () => `${ask.name} bought!`)} />
      )}
    </>
  );
}

/* -------------------------------------------------------------- Puzzle */
interface PzV { enabled: boolean; reward?: number; len?: number; scr?: string; left?: number; solved?: boolean; hint?: string; answer?: string }
export function PuzzlePage({ say, onBack, cpt, reload }: P) {
  const { d, setD, load, err } = useMore<PzV>("puzzle", "puzzle", say);
  const [sel, setSel] = useState<number[]>([]); // indexes into scr
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState<string[]>([]);
  const [won, setWon] = useState(0);
  const money = (c: number) => `${fmtTf(c, cpt)} TFUEL`;

  const head = <PageHead title="Daily word" onBack={onBack} />;
  if (!d) return <>{head}{err ? <Retry onClick={load} /> : <SkelList n={3} />}</>;
  if (!d.enabled) return <>{head}<Off /></>;
  const scr = (d.scr || "").split("");
  const len = d.len || scr.length;
  const over = !!d.solved || (d.left || 0) <= 0;
  const guess = sel.map((i) => scr[i]).join("");

  const submit = async () => {
    if (busy || guess.length !== len) return;
    setBusy(true);
    try {
      const r = await api<any>("more", { action: "puzzleGuess", guess });
      setD(r.view);
      if (r.correct) { confetti(); haptic("success"); setWon(Number(r.reward) || 0); say(`Correct! +${money(Number(r.reward) || 0)}`, true); reload(); }
      else { haptic("error"); setWrong((w) => [...w, guess]); say("Not the right word. Try again.", false); }
      setSel([]);
    } catch (e: any) { haptic("error"); say(errText(e)); load(); }
    setBusy(false);
  };

  return (
    <>
      {head}
      <div className="card" style={{ textAlign: "center" }}>
        <div className="title">Unscramble the word</div>
        <div className="sub">Reward: <b>{money(d.reward || 0)}</b> · {len} letters · {d.left} {d.left === 1 ? "try" : "tries"} left today</div>
        {d.hint && !d.solved && <div className="sub" style={{ marginTop: 4 }}>Hint: it starts with <b>{d.hint}</b></div>}

        {d.solved ? (
          <>
            <div style={{ fontSize: 44, margin: "14px 0 4px" }}><Icon name="sparkle" size={14} /></div>
            <div className="title">Solved!</div>
            {won > 0 && <div className="sub">You earned {money(won)}.</div>}
            <div className="sub" style={{ marginTop: 6 }}>Come back tomorrow for a new word.</div>
          </>
        ) : over ? (
          <>
            <div style={{ fontSize: 40, margin: "14px 0 4px" }}><Icon name="hourglass" size={14} /></div>
            <div className="title">No tries left today</div>
            {d.answer && <div className="sub">The word was <b>{d.answer}</b>.</div>}
            <div className="sub" style={{ marginTop: 6 }}>Come back tomorrow for a new word.</div>
          </>
        ) : (
          <>
            <Tiles letters={Array.from({ length: len }, (_, i) => (sel[i] !== undefined ? scr[sel[i]] : ""))} kind="neutral" hintFirst={d.hint} />
            <div className="sub" style={{ margin: "14px 0 6px" }}>Tap letters in order</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              {scr.map((ch, i) => (
                <button key={i} className="btn sec" style={{ width: 44, height: 44, padding: 0, fontSize: 20, opacity: sel.includes(i) ? 0.3 : 1 }} disabled={sel.includes(i) || sel.length >= len || busy}
                  onClick={() => { haptic("light"); setSel([...sel, i]); }}>{ch}</button>
              ))}
            </div>
            <div className="grid2" style={{ marginTop: 14 }}>
              <button className="btn sec" disabled={!sel.length || busy} onClick={() => setSel(sel.slice(0, -1))}>Undo</button>
              <button className="btn" disabled={guess.length !== len || busy} onClick={submit}>{busy ? "Checking…" : "Submit"}</button>
            </div>
          </>
        )}
      </div>
      {wrong.length > 0 && !d.solved && (
        <div className="card">
          <div className="title" style={{ marginBottom: 6 }}>Your guesses</div>
          {wrong.map((w, i) => <div key={i} style={{ marginBottom: 6 }}><Tiles letters={w.split("")} kind="absent" small /></div>)}
          <div className="sub">Grey means the word was not correct.</div>
        </div>
      )}
      {note("One word per day, different for each player. Skill only: no random draws, and the reward is fixed.")}
    </>
  );
}
function Tiles({ letters, kind, small, hintFirst }: { letters: string[]; kind: "neutral" | "absent"; small?: boolean; hintFirst?: string }) {
  const sz = small ? 32 : 44;
  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 12, flexWrap: "wrap" }}>
      {letters.map((ch, i) => {
        const hinted = !ch && i === 0 && !!hintFirst && kind === "neutral";
        return (
          <div key={i} style={{
            width: sz, height: sz, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: small ? 16 : 22,
            background: kind === "absent" ? "var(--soft)" : ch ? "var(--warn-bg)" : "var(--soft)",
            color: kind === "absent" ? "var(--muted)" : "var(--text)", border: "1px solid var(--line)", opacity: hinted ? 0.6 : 1,
          }}>{ch || (hinted ? hintFirst : "")}</div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- Collect */
interface CollV {
  enabled: boolean; season: { name: string; end: number; pool: number; paid: boolean }; myPts: number; totalPts: number; share: number; holders: number;
  items: { id: string; name: string; emoji: string; image: string; price: number; supply: number; pts: number; max: number; owned: number; left: number | null }[];
}
export function CollectPage({ say, onBack, cpt, reload }: P) {
  const { d, setD, load, err } = useMore<CollV>("collect", "collect", say);
  const { bal, refresh } = useBalance();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<CollV["items"][0] | null>(null);
  const now = useNow();
  const money = (c: number) => `${fmtTf(c, cpt)} TFUEL`;

  const buy = async (it: CollV["items"][0]) => {
    if (busy) return;
    setBusy(true);
    try { const r = await api<any>("more", { action: "collectBuy", id: it.id }); setD(r.collect); haptic("success"); say(`${it.name} added to your collection.`, true); reload(); refresh(); }
    catch (e: any) { haptic("error"); say(errText(e)); load(); }
    setBusy(false); setAsk(null);
  };

  const head = <PageHead title="Collectibles" onBack={onBack} />;
  if (!d) return <>{head}{err ? <Retry onClick={load} /> : <SkelList n={4} />}</>;
  if (!d.enabled) return <>{head}<Off /></>;
  const s = d.season;
  const over = !!s.end && now >= s.end;
  const mine = d.items.filter((i) => i.owned > 0);
  const Img = ({ it, size }: { it: CollV["items"][0]; size: number }) =>
    it.image ? <img src={it.image} alt="" width={size} height={size} style={{ borderRadius: 12, objectFit: "cover" }} /> : <span style={{ fontSize: size * 0.8, lineHeight: 1 }}>{it.emoji || "◆"}</span>;

  return (
    <>
      {head}
      <div className="banner info"><Icon name="alert" size={18} /><span>In-app collectibles at a fixed price. They cannot be resold or traded, have no cash value, and nothing is promised: your share of the season pool depends on everyone's points and may be smaller than what you paid.</span></div>

      <div className="card">
        <div className="row"><div className="title">{s.name}</div><span className={"pill " + (over ? "err" : "ok")}>{s.end ? (over ? "Ended" : left(s.end - now)) : "Open"}</span></div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div><div className="sub">Your points</div><div className="title num">{num(d.myPts)}</div></div>
          <div><div className="sub">Total points</div><div className="title num">{num(d.totalPts)}</div></div>
          <div><div className="sub">Season pool</div><div className="title num">{money(s.pool)}</div></div>
          <div><div className="sub">Est. share now</div><div className="title num">{money(d.share)}</div></div>
        </div>
        <div className="sub" style={{ marginTop: 8 }}>{s.paid ? "This season's pool has been paid out." : "When the season ends, the pool is split by points. The estimate changes as others buy."} {d.holders > 0 ? `${num(d.holders)} collectors.` : ""}</div>
      </div>

      <div className="title" style={{ margin: "6px 2px 8px" }}>Shop</div>
      {d.items.length === 0 ? <Empty icon="list" title="No items yet" hint="New collectibles will appear here." /> : d.items.map((it) => {
        const sold = it.left !== null && it.left <= 0;
        const capped = it.owned >= 1;
        const poor = bal !== null && bal < it.price;
        const dis = over || sold || capped || poor || busy;
        return (
          <div className="card" key={it.id}>
            <div className="row">
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Img it={it} size={52} />
                <div>
                  <div className="title">{it.name}</div>
                  <div className="sub">{it.pts} season pts · {it.left === null ? "Unlimited supply" : `${num(it.left)} of ${num(it.supply)} left`}</div>
                  <div className="sub">{it.owned >= 1 ? <b><Icon name="check" size={14} /> You own this</b> : "One per user"}</div>
                </div>
              </div>
              <button className="btn sm" disabled={dis} onClick={() => setAsk(it)}>{over ? "Ended" : sold ? "Sold out" : capped ? "Max" : money(it.price)}</button>
            </div>
            {poor && !over && !sold && !capped && <div className="sub" style={{ marginTop: 6 }}>Not enough balance.</div>}
          </div>
        );
      })}

      <div className="title" style={{ margin: "14px 2px 8px" }}>My collection</div>
      {mine.length === 0 ? <div className="sub" style={{ margin: "0 2px 12px" }}>You don't own any collectibles yet.</div> : (
        <div className="card">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(88px,1fr))", gap: 10 }}>
            {mine.map((it) => (
              <div key={it.id} style={{ textAlign: "center", background: "var(--soft)", borderRadius: 12, padding: 10 }}>
                <Img it={it} size={40} />
                <div className="sub" style={{ fontWeight: 700, color: "var(--text)" }}>{it.name}</div>
                <div className="sub num">x{it.owned} · {it.owned * it.pts} pts</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {ask && (
        <ConfirmSheet title={`Buy ${ask.name}?`} rows={[["Price", money(ask.price)], ["Season points", `+${ask.pts}`], ["Supply left", ask.left === null ? "Unlimited" : String(ask.left)]]}
          warn="Final purchase: no refunds, no resale. The season reward is not guaranteed to cover the price." busy={busy} confirmLabel="Buy"
          onCancel={() => setAsk(null)} onConfirm={() => buy(ask)} />
      )}
    </>
  );
}

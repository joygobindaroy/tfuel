import { useCallback, useEffect, useState } from "react";
import { PageHead } from "@/components/Cashier";
import { Empty, SkelList, CopyBtn } from "@/components/Ui";
import { api, errText, fmtUsd, tg } from "@/lib/client";
import Icon from "@/components/Icons";
import { VERSION } from "@/lib/version";

type P = { say: (m: string, ok?: boolean) => void; onBack: () => void; cpt: number; reload: () => void };

/** Invite & earn: commission tier progress, weekly invite leaderboard + contest prizes */
export function InvitePlusPage({ say, onBack, cpt }: P) {
  const [d, setD] = useState<any>(null);
  const [board, setBoard] = useState<"w" | "all">("w");
  const [list, setList] = useState<any>(null);
  const load = useCallback(async () => { try { const r = await api<any>("more", { action: "invite" }); setD(r); setList(r.board); } catch (e) { say(errText(e)); } }, [say]);
  useEffect(() => { load(); }, [load]);
  const pick = async (b: "w" | "all") => { setBoard(b); try { setList((await api<any>("more", { action: "refBoard", board: b })).board); } catch (e) { say(errText(e)); } };
  if (!d) return (<><PageHead title="Invite & earn" onBack={onBack} /><SkelList /></>);
  const t = d.tier;
  const prevN = [...t.tiers].reverse().find((x: any) => x.n <= t.count)?.n || 0;
  const pct = t.next ? Math.min(100, Math.floor(((t.count - prevN) / Math.max(1, t.next.n - prevN)) * 100)) : 100;
  return (
    <>
      <PageHead title="Invite & earn" onBack={onBack} />
      <div className="card">
        <div className="row"><div className="title">Your commission</div><span className="pill ok">{t.pct}%</span></div>
        <div className="sub" style={{ margin: "4px 0 8px" }}>{t.count} friend{t.count === 1 ? "" : "s"} joined. {t.next ? `Invite ${t.next.need} more to reach ${t.next.pct}% on everything they earn.` : "You are at the top tier."}</div>
        <div className="bar"><div style={{ width: `${pct}%` }} /></div>
        <div className="grid2" style={{ marginTop: 10 }}>
          {t.tiers.map((x: any) => <div key={x.n} className="sub" style={{ opacity: t.count >= x.n ? 1 : 0.55 }}>{x.n === 0 ? "Start" : `${x.n}+ friends`}: <b>{x.pct}%</b></div>)}
        </div>
      </div>
      <div className="section"><h2>Invite leaderboard</h2></div>
      <div className="seg">
        <button className={board === "w" ? "on" : ""} onClick={() => pick("w")}>This week</button>
        <button className={board === "all" ? "on" : ""} onClick={() => pick("all")}>All time</button>
      </div>
      {list?.contest && (
        <div className="banner info"><Icon name="gift" size={18} /><span><b>{list.contest.name}</b> — weekly prizes for the top {list.contest.prizes.length}: {list.contest.prizes.map((p: number, i: number) => `#${i + 1} ${(p / cpt).toLocaleString("en-US")} TFUEL`).join(", ")}. A friend counts once they finish their first task.</span></div>
      )}
      <div className="card">
        {!list?.list?.length && <Empty icon="users" title="No invites yet" hint="Share your link — the first to invite wins the top spot." />}
        {list?.list?.map((r: any) => (
          <div className="hist" key={r.rank} style={r.me ? { background: "var(--soft)", borderRadius: 10, padding: "8px 8px" } : undefined}>
            <div className="left"><b className="num" style={{ width: 28 }}>#{r.rank}</b><div className="title" style={{ fontSize: 14 }}>{r.name}{r.me ? " (you)" : ""}</div></div>
            <b className="num">{r.v}</b>
          </div>
        ))}
        <div className="sub" style={{ marginTop: 8 }}>You: <b>{list?.mine || 0}</b> friend{list?.mine === 1 ? "" : "s"} {board === "w" ? "this week" : "in total"}</div>
      </div>
    </>
  );
}

/** Report a problem: category + text; device details are attached automatically */
export function ReportPage({ say, onBack }: P) {
  const cats = ["Deposit", "Withdrawal", "Tasks / articles", "Wallet / balance", "Login / account", "Other"];
  const [cat, setCat] = useState(cats[0]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      let err = ""; try { err = sessionStorage.getItem("last_err") || ""; } catch {}
      await api("more", { action: "report", category: cat, message: msg, diag: { v: VERSION, ua: navigator.userAgent, scr: `${window.innerWidth}x${window.innerHeight}`, err } });
      setDone(true); say("Report sent", true);
    } catch (e) { say(errText(e)); } finally { setBusy(false); }
  };
  void tg;
  if (done) return (<><PageHead title="Report a problem" onBack={onBack} /><Empty icon="check" title="Thanks — we got it" hint="Our team will reply in Profile → Support."><button className="btn sm" onClick={onBack}>Back</button></Empty></>);
  return (
    <>
      <PageHead title="Report a problem" onBack={onBack} />
      <div className="card">
        <label style={{ marginTop: 0 }}>What is it about?</label>
        <div className="chips">{cats.map((c) => <button key={c} className={`chip ${c === cat ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>)}</div>
        <label>What went wrong?</label>
        <textarea rows={5} maxLength={900} placeholder="Describe what you did and what happened (include amounts or TxID if it is about money)." value={msg} onChange={(e) => setMsg(e.target.value)} />
        <div className="xs muted" style={{ marginTop: 4 }}>We attach your app version and device type automatically. Never share your PIN or codes.</div>
        <button className="btn block" style={{ marginTop: 10 }} disabled={busy || msg.trim().length < 10} onClick={send}>{busy ? "Sending…" : "Send report"}</button>
      </div>
    </>
  );
}

/** Auto-convert: sell X% of new earnings into USDT automatically */
export function AutoConvertCard({ say }: { say: (m: string, ok?: boolean) => void }) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setD(await api<any>("more", { action: "acGet" })); } catch {} }, []);
  useEffect(() => { load(); }, [load]);
  if (!d?.enabled) return null;
  const set = async (pct: number) => { setBusy(true); try { await api("more", { action: "acSet", pct }); await load(); say(pct ? `Auto-convert ${pct}% on` : "Auto-convert off", true); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  return (
    <div className="card">
      <div className="title">Auto-convert</div>
      <div className="sub" style={{ marginBottom: 8 }}>Automatically sell a share of what you earn into USDT at the market price (normal trade fee applies). Runs when you open the app.</div>
      <div className="chips">
        <button className={`chip ${!d.pct ? "on" : ""}`} disabled={busy} onClick={() => set(0)}>Off</button>
        {d.options.map((o: number) => <button key={o} className={`chip ${d.pct === o ? "on" : ""}`} disabled={busy} onClick={() => set(o)}>{o}%</button>)}
      </div>
      {d.total > 0 && <div className="xs muted" style={{ marginTop: 6 }}>Converted so far: {(d.total / 1).toLocaleString("en-US")} coins</div>}
    </div>
  );
}

/** Profit / loss on bought TFUEL */
export function PlCard({ pl }: { pl: any }) {
  if (!pl) return null;
  const up = (pl.unreal || 0) >= 0;
  return (
    <div className="card">
      <div className="title" style={{ marginBottom: 6 }}>Profit &amp; loss</div>
      {pl.tfuel > 0 && <>
        <div className="sumrow"><span className="muted">Bought TFUEL held</span><b className="num">{pl.tfuel.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
        <div className="sumrow"><span className="muted">Average buy price</span><b className="num">{fmtUsd(pl.avg)}</b></div>
        <div className="sumrow"><span className="muted">Unrealised</span><b className="num" style={{ color: up ? "#16a34a" : "#dc2626" }}>{up ? "+" : "−"}{fmtUsd(Math.abs(pl.unreal || 0))}</b></div>
      </>}
      <div className="sumrow"><span className="muted">Realised (sold)</span><b className="num" style={{ color: pl.realized >= 0 ? "#16a34a" : "#dc2626" }}>{pl.realized >= 0 ? "+" : "−"}{fmtUsd(Math.abs(pl.realized || 0))}</b></div>
    </div>
  );
}
export { CopyBtn };

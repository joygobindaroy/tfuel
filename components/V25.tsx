import { useEffect, useState } from "react";
import { api, errText, saveImage, shareImage, fmtTf } from "@/lib/client";
import { CopyBtn } from "@/components/Ui";
import Icon from "@/components/Icons";

type Say = (m: string, ok?: boolean) => void;

/** Daily combo: daily reward + spin + a mini game, then a bonus */
export function ComboCard({ say, reload, cpt }: { say: Say; reload: () => void; cpt: number }) {
  const [c, setC] = useState<any>(undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<any>("v25", { action: "combo" }).then((r) => setC(r.combo)).catch(() => setC(null)); }, []);
  if (!c) return null;
  const claim = async () => { setBusy(true); try { const r = await api<any>("v25", { action: "comboClaim" }); setC(r.combo); say(`+${fmtTf(r.bonus, cpt)} TFUEL combo bonus`, true); reload(); } catch (e) { say(errText(e)); } finally { setBusy(false); } };
  return (
    <div className="card">
      <div className="row"><div className="title">Daily combo</div><span className="pill info">+{fmtTf(c.bonus, cpt)} TFUEL</span></div>
      {c.steps.map((s: any) => <div key={s.k} className="row" style={{ marginTop: 8 }}><span className="sm">{s.t}</span><span style={{ color: s.done ? "#15803d" : "var(--muted, #9aa3b5)" }}><Icon name={s.done ? "check" : "clock"} size={16} /></span></div>)}
      {!c.claimed && <button className="btn block" style={{ marginTop: 10 }} disabled={busy || !c.ready} onClick={claim}>{c.ready ? "Claim bonus" : "Finish all three to claim"}</button>}
      {c.claimed && <div className="xs muted" style={{ marginTop: 8 }}>Claimed today. Come back tomorrow.</div>}
    </div>
  );
}

/** Settings: birthday gift + my game history */
export function LifeCard({ say }: { say: Say }) {
  const [bd, setBd] = useState<string | null>(null);
  const [mm, setMm] = useState("");
  const [dd, setDd] = useState("");
  const [tours, setTours] = useState<any[]>([]);
  useEffect(() => {
    api<any>("v25", { action: "bday" }).then((r) => setBd(r.bday || "")).catch(() => setBd(""));
    api<any>("v25", { action: "tours" }).then((r) => setTours(r.list || [])).catch(() => {});
  }, []);
  const save = async () => { try { const r = await api<any>("v25", { action: "bdaySet", date: `${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` }); setBd(r.bday); say("Saved", true); } catch (e) { say(errText(e)); } };
  return (
    <>
      <div className="card">
        <div className="title">Birthday</div>
        {bd ? <div className="sub">Saved: {bd.slice(3)}/{bd.slice(0, 2)} (day/month). It can&apos;t be changed.</div> : (
          <>
            <div className="sub">Add your birthday for a small gift. It can only be saved once.</div>
            <div className="grid2" style={{ marginTop: 8 }}>
              <input inputMode="numeric" maxLength={2} placeholder="Day (1-31)" value={dd} onChange={(e) => setDd(e.target.value.replace(/\D/g, ""))} />
              <input inputMode="numeric" maxLength={2} placeholder="Month (1-12)" value={mm} onChange={(e) => setMm(e.target.value.replace(/\D/g, ""))} />
            </div>
            <button className="btn block" style={{ marginTop: 8 }} disabled={!mm || !dd} onClick={save}>Save birthday</button>
          </>
        )}
      </div>
      {tours.length > 0 && (
        <div className="card">
          <div className="title">My tournaments</div>
          {tours.map((t) => (
            <div key={t.id} className="row" style={{ marginTop: 8 }}>
              <div><div className="b">{t.title}</div><div className="xs muted">{new Date(t.end).toLocaleDateString()} · {t.cancelled ? "cancelled" : t.played ? `rank ${t.rank} of ${t.players}` : "no score"}</div></div>
              {t.prize > 0 && <span className="pill info">+{t.prize}</span>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** Boost → Invite: share card for how many friends joined + creators' custom link */
export function MilestoneCard({ say }: { say: Say }) {
  const [m, setM] = useState<{ n: number; url: string } | null>(null);
  useEffect(() => { api<any>("v25", { action: "milestone" }).then(setM).catch(() => {}); }, []);
  if (!m || !m.url) return null;
  return (
    <div className="card">
      <div className="title">Share your progress</div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={m.url} alt="" loading="lazy" style={{ width: "100%", borderRadius: 14, marginTop: 8 }} />
      <button className="btn sec block" style={{ marginTop: 8 }} onClick={() => saveImage(m.url, "tfuel-friends.png").catch(() => say("Could not save the picture"))}><Icon name="download" size={16} /> Save picture</button>
      <button className="btn sec block" style={{ marginTop: 8 }} onClick={() => shareImage(m.url, "tfuel-friends.png", "My progress on TFUEL").catch(() => say("Could not share the picture"))}><Icon name="send" size={16} /> Share image to any app</button>
    </div>
  );
}
export function AliasCard({ say }: { say: Say }) {
  const [creator, setCreator] = useState(false);
  const [a, setA] = useState("");
  const [cur, setCur] = useState("");
  useEffect(() => { api<any>("v25", { action: "alias" }).then((r) => { setCreator(!!r.creator); setA(r.alias); setCur(r.alias); }).catch(() => {}); }, []);
  if (!creator) return null;
  const save = async () => { try { const r = await api<any>("v25", { action: "aliasSet", alias: a }); setCur(r.alias); say("Your invite link now uses this name", true); } catch (e) { say(errText(e)); } };
  return (
    <div className="card">
      <div className="title">Custom invite name</div>
      <div className="sub">Creators can choose a short name for their invite link.</div>
      <div className="row" style={{ gap: 8, marginTop: 8 }}><input maxLength={16} value={a} onChange={(e) => setA(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} placeholder="e.g. sam2026" /><button className="btn sm" disabled={a.length < 3 || a === cur} onClick={save}>Save</button></div>
      {cur && <div className="xs muted" style={{ marginTop: 6 }}>Current: {cur}</div>}
    </div>
  );
}

/** Settings: daily limit per saved contact */
export function LimitsCard({ say }: { say: Say }) {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api<any>("v25", { action: "limits" }).then((r) => setList(r.list || [])).catch(() => {}); }, []);
  if (!list.length) return null;
  const save = async (c: any, tfuel: string, usdt: string) => { try { const r = await api<any>("v25", { action: "limitSet", code: c.code, tfuel, usdt }); setList(r.list); say("Saved", true); } catch (e) { say(errText(e)); } };
  return (
    <div className="card">
      <div className="title">Daily limit per contact</div>
      <div className="sub">The most you can send to one saved contact in a day. Leave empty for no limit.</div>
      {list.map((c) => <LimitRow key={c.code} c={c} onSave={save} />)}
    </div>
  );
}
function LimitRow({ c, onSave }: { c: any; onSave: (c: any, t: string, u: string) => void }) {
  const [t, setT] = useState(c.tfuel ? String(c.tfuel) : "");
  const [u, setU] = useState(c.usdt ? String(c.usdt / 1e6) : "");
  return (
    <div style={{ marginTop: 10 }}>
      <div className="b">{c.label}</div>
      <div className="grid2" style={{ marginTop: 4 }}>
        <input inputMode="numeric" placeholder="TFUEL coins/day" value={t} onChange={(e) => setT(e.target.value.replace(/\D/g, ""))} onBlur={() => onSave(c, t, u)} />
        <input inputMode="decimal" placeholder="USDT/day" value={u} onChange={(e) => setU(e.target.value)} onBlur={() => onSave(c, t, u)} />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { PageHead } from "@/components/Cashier";
import { ConfirmSheet, SkelList } from "@/components/Ui";
import { api, errText } from "@/lib/client";

type Say = (m: string, ok?: boolean) => void;
const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const KIND: Record<string, string> = { bot_button: "Button in the bot menu", home_banner: "Banner on the app home screen", board_top: "Top of the Leaderboard", pinned: "One message to every user", mission: "Sponsored mission" };

/** Sponsored banner (home / leaderboard). A view is counted once per session per ad. */
export function AdBanner({ ad }: { ad?: { id: string; title: string; text: string; url: string; image: string } | null }) {
  useEffect(() => {
    if (!ad) return;
    try { const k = "adv_" + ad.id; if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, "1"); } catch {}
    api("more", { action: "adImp", id: ad.id }).catch(() => {});
  }, [ad]);
  if (!ad) return null;
  return (
    <a className="card" href={`/api/ad-click?id=${encodeURIComponent(ad.id)}`} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 12, alignItems: "center", textDecoration: "none", color: "inherit" }}>
      {ad.image && /* eslint-disable-next-line @next/next/no-img-element */ <img src={ad.image} alt="" width={52} height={52} style={{ borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="title" style={{ fontSize: 14 }}>{ad.title}</div>
        {ad.text && <div className="sub" style={{ margin: 0 }}>{ad.text}</div>}
      </div>
      <span className="pill" style={{ flexShrink: 0 }}>Ad</span>
    </a>
  );
}

const STATUS: Record<string, string> = { pending: "In review", active: "Live", rejected: "Rejected", ended: "Finished", cancelled: "Cancelled" };

/** Profile → Promote with us: buy a slot, see results */
export function AdsPage({ say, onBack, reload }: { say: Say; onBack: () => void; reload: () => void }) {
  const [d, setD] = useState<any>(null);
  const [slot, setSlot] = useState("");
  const [days, setDays] = useState(1);
  const [mission, setMission] = useState(false);
  const [goal, setGoal] = useState("100");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState("");
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setD((await api<any>("more", { action: "ads" })).ads); } catch (e) { say(errText(e)); } }, [say]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (d && !slot && d.slots[0]) setSlot(d.slots[0].id); }, [d, slot]);

  if (!d) return <><PageHead title="Promote with us" onBack={onBack} /><SkelList /></>;
  if (!d.enabled) return <><PageHead title="Promote with us" onBack={onBack} /><div className="card empty">Promotions are not available right now.</div></>;

  const sl = d.slots.find((s: any) => s.id === slot);
  const pinned = sl?.kind === "pinned";
  const d2 = pinned ? 1 : Math.max(1, Math.min(d.max_days, days));
  const pct = pinned ? 0 : d.discounts.filter((x: any) => d2 >= x.days).reduce((m: number, x: any) => Math.max(m, x.pct), 0);
  const price = mission ? Math.round(Math.floor(Number(goal) || 0) * d.mission.price * 100) / 100 : sl ? Math.round(sl.price * d2 * (1 - pct / 100) * 100) / 100 : 0;
  const ready = title.trim().length >= 3 && /^https:\/\//i.test(url.trim()) && price > 0 && (mission || !!sl);
  const submit = async () => {
    setBusy(true);
    try {
      const r: any = await api("more", { action: "adsBuy", mission, slot, days: d2, goal: Math.floor(Number(goal) || 0), title, text, url: url.trim(), image: image.trim() });
      setD(r.ads); setAsk(false); setTitle(""); setText(""); setUrl(""); setImage("");
      say("Sent for review. You'll get a message when it's live.", true); reload();
    } catch (e) { say(errText(e)); setAsk(false); } finally { setBusy(false); }
  };
  const cancel = async (id: string) => {
    try { const r: any = await api("more", { action: "adsCancel", id }); setD(r.ads); say("Cancelled and refunded", true); reload(); } catch (e) { say(errText(e)); }
  };
  return (
    <>
      <PageHead title="Promote with us" onBack={onBack} />
      <div className="card">
        <div className="title">Reach every TFUEL user</div>
        <div className="sub">Pick a spot, add your link and pay from your USDT balance (<b>{usd(d.usdt)} USDT</b>). Every promotion is reviewed first; if it isn&apos;t accepted you get a full refund. Scams, adult and gambling content are not allowed.</div>
        <div className="chips" style={{ marginTop: 10 }}>
          {d.slots.map((s: any) => <button key={s.id} className={`chip ${!mission && slot === s.id ? "on" : ""}`} onClick={() => { setMission(false); setSlot(s.id); }}>{s.name}</button>)}
          {d.mission?.enabled && <button className={`chip ${mission ? "on" : ""}`} onClick={() => setMission(true)}>Sponsored mission</button>}
        </div>
        <div className="xs muted" style={{ marginTop: 8 }}>
          {mission ? `Users visit your link to earn coins. You pay ${usd(d.mission.price)} USDT per completed visit; unused visits are refunded.` : sl ? `${KIND[sl.kind] || sl.name} · ${usd(sl.price)} USDT ${pinned ? "per send" : "per day"}${sl.full ? " · currently full" : ""}` : ""}
        </div>
        {(mission || !pinned) && (
          <div className="grid2" style={{ marginTop: 10 }}>
            {mission && <div><label>Completions wanted ({d.mission.min}–{d.mission.max})</label><input inputMode="numeric" value={goal} onChange={(e) => setGoal(e.target.value.replace(/\D/g, ""))} /></div>}
            <div><label>{mission ? "Runs for (days)" : "Days"}</label><input inputMode="numeric" value={days} onChange={(e) => setDays(Math.floor(Number(e.target.value.replace(/\D/g, "")) || 1))} /></div>
          </div>
        )}
        <label style={{ marginTop: 10 }}>Title (shown to users)</label>
        <input maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Join our channel" />
        {!(sl?.kind === "bot_button" && !mission) && (<><label>Short text (optional)</label><input maxLength={120} value={text} onChange={(e) => setText(e.target.value)} placeholder="One line about what you offer" /></>)}
        <label>Link (https://…)</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://t.me/yourchannel" />
        {sl?.kind === "home_banner" && !mission && (<><label>Image link (optional, square)</label><input value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://…/logo.png" /></>)}
        {pct > 0 && !mission && <div className="xs" style={{ marginTop: 8, color: "var(--ok, #16a34a)" }}>{pct}% bulk discount applied</div>}
        <button className="btn block" style={{ marginTop: 12 }} disabled={!ready || (!mission && !!sl?.full)} onClick={() => setAsk(true)}>Review &amp; pay {price > 0 ? `${usd(price)} USDT` : ""}</button>
      </div>

      <div className="title" style={{ margin: "6px 2px 8px" }}>My promotions</div>
      {d.mine.length === 0 && <div className="card empty">Nothing yet.</div>}
      {d.mine.map((o: any) => (
        <div className="card" key={o.id}>
          <div className="row"><div className="title" style={{ fontSize: 14 }}>{o.title}</div><span className="pill">{STATUS[o.status] || o.status}</span></div>
          <div className="sub">{KIND[o.kind] || o.kind} · {o.kind === "pinned" ? "once" : `${o.days} day${o.days === 1 ? "" : "s"}`} · {usd(o.price)} USDT</div>
          {(o.status === "active" || o.status === "ended") && o.kind !== "pinned" && <div className="sub">Views {o.imp.toLocaleString("en-US")} · Clicks {o.clk.toLocaleString("en-US")}{o.end && o.status === "active" ? ` · ends ${new Date(o.end).toLocaleDateString()}` : ""}</div>}
          {o.note && <div className="sub">Note: {o.note}</div>}
          {o.refund > 0 && <div className="sub">Refunded {usd(o.refund)} USDT</div>}
          {o.status === "pending" && <button className="btn sec sm" style={{ marginTop: 8 }} onClick={() => cancel(o.id)}>Cancel &amp; refund</button>}
        </div>
      ))}
      {ask && <ConfirmSheet title="Confirm promotion" busy={busy} confirmLabel="Pay & send for review" warn="It goes live after review. Not accepted = full refund." rows={[["Type", mission ? KIND.mission : KIND[sl?.kind] || ""], mission ? ["Completions", goal] : ["Days", pinned ? "once" : String(d2)], ["Title", title], ["Link", url.trim()], ["Total", `${usd(price)} USDT`]]} onConfirm={submit} onCancel={() => setAsk(false)} />}
    </>
  );
}

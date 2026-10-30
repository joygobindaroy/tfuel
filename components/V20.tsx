import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icons";
import { api, tg, openLink, openTgLink, errText } from "@/lib/client";

/** "What's new" popup: shown once per version to people who have been here a day or more */
export function WhatsNew({ w, onDone }: { w: { version: string; text: string }; onDone: () => void }) {
  const go = async () => { try { await api("seen", {}); } catch {} onDone(); };
  return (
    <div className="sheet-bg" style={{ alignItems: "center" }} onClick={go}>
      <div className="sheet" style={{ borderRadius: 22, margin: 16, paddingBottom: 20 }} onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ fontSize: 20, textAlign: "center" }}><Icon name="sparkle" size={14} /> What&apos;s new in {w.version}</div>
        <div className="sub" style={{ margin: "10px 0 14px", textAlign: "center" }}>{w.text}</div>
        <button className="btn" style={{ width: "100%" }} onClick={go}>Got it</button>
      </div>
    </div>
  );
}

/** Running bonus event strip + today's community goal */
export function EventStrip({ ev, gq }: { ev?: { mult: number } | null; gq?: { title: string; target: number; bonus: number; n: number; done: boolean } | null }) {
  const [hide, setHide] = useState(false);
  if (hide || (!ev && !gq)) return null;
  const pct = gq ? Math.min(100, Math.floor((gq.n / Math.max(1, gq.target)) * 100)) : 0;
  return (
    <div className="card" style={{ position: "relative" }}>
      {ev && <div className="row"><div><div className="title"><Icon name="zap" size={14} /> ×{ev.mult} rewards are on!</div><div className="sub">Daily rewards, tasks and games pay more right now.</div></div></div>}
      {gq && (
        <div style={{ marginTop: ev ? 10 : 0 }}>
          <div className="row"><div className="b"><Icon name="target" size={14} /> {gq.title}</div><span className="xs muted">{gq.done ? "Reached!" : `${gq.n}/${gq.target}`}</span></div>
          <div className="xs muted" style={{ margin: "2px 0 6px" }}>{gq.done ? `Everyone who claimed today got +${gq.bonus} coins.` : `Claim your daily reward — if ${gq.target} people do it today, all of them get +${gq.bonus} coins.`}</div>
          <div className="bar"><div style={{ width: `${gq.done ? 100 : pct}%` }} /></div>
        </div>
      )}
      <button className="btn ghost sm" style={{ position: "absolute", right: 6, top: 6 }} aria-label="Hide" onClick={() => setHide(true)}>×</button>
    </div>
  );
}

type Looks = { card: string; rcpt: string; cards: { id: string; name: string; url: string }[]; rcpts: { id: string; name: string; url: string }[]; share: { link: string; card: string; earn: string; earned: string; text: string } };

/** Settings → Looks: pick the card and receipt style, then share the pictures (chat or Telegram Story) */
export function LooksCard({ say }: { say: (m: string, ok?: boolean) => void }) {
  const [d, setD] = useState<Looks | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async (b: Record<string, string> = {}) => { try { setD(await api<Looks>("looks", b)); } catch (e) { say(errText(e)); } };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const pick = async (k: "card" | "rcpt", id: string) => { setBusy(true); await load({ action: "set", [k]: id }); setBusy(false); say("Saved", true); };
  const story = (url: string, text: string) => {
    const w: any = tg();
    try { if (typeof w?.shareToStory === "function") { w.shareToStory(url, { text, ...(d.share.link ? { widget_link: { url: d.share.link, name: "Join" } } : {}) }); return; } } catch {}
    openLink(url);
  };
  const chat = (text: string) => openTgLink(`https://t.me/share/url?url=${encodeURIComponent(d.share.link || " ")}&text=${encodeURIComponent(text)}`);
  const Chips = ({ k, items, cur }: { k: "card" | "rcpt"; items: Looks["cards"]; cur: string }) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 8 }}>
      {items.map((c) => (
        <button key={c.id} type="button" disabled={busy} onClick={() => pick(k, c.id)} style={{ textAlign: "left", padding: 6, borderRadius: 12, border: cur === c.id ? "2px solid var(--gold, #f5a623)" : "1px solid var(--line, #e5e7eb)", background: "var(--card, #fff)" }}>
          {c.url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={c.url} alt="" loading="lazy" style={{ width: "100%", height: 86, objectFit: "cover", objectPosition: "top", borderRadius: 8, display: "block" }} />}
          <div className="xs" style={{ marginTop: 4, fontWeight: 700 }}>{cur === c.id && <Icon name="check" size={12} />} {c.name}</div>
        </button>
      ))}
    </div>
  );
  return (
    <div className="card">
      <div className="title">Looks</div>
      <div className="sub">Choose how your cards and receipts look.</div>
      <div className="b" style={{ marginTop: 10 }}>Card style</div>
      <Chips k="card" items={d.cards} cur={d.card} />
      <div className="b" style={{ marginTop: 14 }}>Receipt style</div>
      <Chips k="rcpt" items={d.rcpts} cur={d.rcpt} />
      {d.share.card && (
        <>
          <div className="b" style={{ marginTop: 14 }}>Share</div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.share.card} alt="" loading="lazy" style={{ width: "100%", borderRadius: 14, marginTop: 8 }} />
          <div className="gap" style={{ marginTop: 8 }}>
            <button className="btn sec sm" onClick={() => chat(d.share.text)}><Icon name="send" size={13} /> Send</button>
            <button className="btn sec sm" onClick={() => story(d.share.card, d.share.text)}><Icon name="image" size={13} /> Story</button>
            <button className="btn sec sm" onClick={() => openLink(d.share.card)}><Icon name="download" size={13} /> Image</button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {d.share.earn && <img src={d.share.earn} alt="" loading="lazy" style={{ width: "100%", borderRadius: 14, marginTop: 14 }} />}
          {d.share.earn && (
            <div className="gap" style={{ marginTop: 8 }}>
              <button className="btn sec sm" onClick={() => chat(`I earned ${d.share.earned} this week on TFUEL!`)}><Icon name="send" size={13} /> Send</button>
              <button className="btn sec sm" onClick={() => story(d.share.earn, `I earned ${d.share.earned} this week`)}><Icon name="image" size={13} /> Story</button>
              <button className="btn sec sm" onClick={() => openLink(d.share.earn)}><Icon name="download" size={13} /> Image</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Telegram's big bottom button (MainButton): mirrors the main action of a screen. Hidden when `on` is false or outside Telegram. */
export function useMainButton(text: string, on: boolean, onClick: () => void) {
  const fn = useRef(onClick);
  fn.current = onClick;
  useEffect(() => {
    const mb: any = (tg() as any)?.MainButton;
    if (!mb || !on) return;
    const h = () => fn.current();
    try { mb.setText(text); mb.show(); mb.onClick(h); } catch { return; }
    return () => { try { mb.offClick(h); mb.hide(); } catch {} };
  }, [text, on]);
}

/** One gentle, dismissible reminder to add the app to the home screen (Telegram 8.0+) */
export function HomeScreenPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const w: any = tg();
      if (!w?.checkHomeScreenStatus || !w?.addToHomeScreen) return;
      if (Number(localStorage.getItem("a2hs_hide") || 0) > Date.now()) return;
      w.checkHomeScreenStatus((st: string) => { if (st === "missed") setShow(true); });
    } catch {}
  }, []);
  if (!show) return null;
  const hide = (days: number) => { try { localStorage.setItem("a2hs_hide", String(Date.now() + days * 86400000)); } catch {} setShow(false); };
  return (
    <div className="card">
      <div className="row"><div><div className="title">Add TFUEL to your home screen</div><div className="sub">Open the app in one tap, like any other app.</div></div></div>
      <div className="gap" style={{ marginTop: 8 }}>
        <button className="btn sm" onClick={() => { try { (tg() as any).addToHomeScreen(); } catch {} hide(30); }}>Add</button>
        <button className="btn ghost sm" onClick={() => hide(7)}>Not now</button>
      </div>
    </div>
  );
}

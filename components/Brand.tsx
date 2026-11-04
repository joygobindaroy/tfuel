import { useState } from "react";
import { openLink } from "@/lib/client";
import Icon from "@/components/Icons";

type Page = { id: string; title: string; body: string };

/** Admin-made pages (About / Rules / Help) and the Contact button */
export function BrandLinks({ pages, contact }: { pages: Page[]; contact: { label: string; url: string } | null }) {
  const [open, setOpen] = useState<Page | null>(null);
  if (!pages.length && !contact) return null;
  return (
    <>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {pages.map((p) => (
          <button key={p.id} className="row" style={{ width: "100%", padding: "14px 16px", background: "none", border: 0, textAlign: "left", borderBottom: "1px solid var(--line, #e5e7eb)" }} onClick={() => setOpen(p)}>
            <span className="b">{p.title}</span><Icon name="chevron" size={16} />
          </button>
        ))}
        {contact && (
          <button className="row" style={{ width: "100%", padding: "14px 16px", background: "none", border: 0, textAlign: "left" }} onClick={() => openLink(contact.url)}>
            <span className="b">{contact.label}</span><Icon name="chevron" size={16} />
          </button>
        )}
      </div>
      {open && (
        <div className="sheet-bg" onClick={() => setOpen(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="title" style={{ fontSize: 18, marginBottom: 8 }}>{open.title}</div>
            <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5, maxHeight: "60vh", overflowY: "auto" }}>{open.body}</div>
            <button className="btn block" style={{ marginTop: 12 }} onClick={() => setOpen(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

/** One-time announcement popup with optional picture and link (shown once per popup id on this phone) */
export function AppPopup({ popup }: { popup: { id: string; title: string; text: string; image: string; link: string; btn: string } | null }) {
  const key = popup ? `popup_${popup.id}` : "";
  const [gone, setGone] = useState(() => { try { return !!key && !!localStorage.getItem(key); } catch { return false; } });
  if (!popup || gone) return null;
  const close = () => { try { localStorage.setItem(key, "1"); } catch {} setGone(true); };
  return (
    <div className="sheet-bg" onClick={close}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {popup.image && <img src={popup.image} alt="" loading="lazy" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, marginBottom: 10 }} />}
        <div className="title" style={{ fontSize: 18 }}>{popup.title}</div>
        {popup.text && <div className="sub" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{popup.text}</div>}
        <div className="grid2" style={{ marginTop: 12 }}>
          <button className="btn sec" onClick={close}>Close</button>
          {popup.link && <button className="btn" onClick={() => { close(); openLink(popup.link); }}>{popup.btn}</button>}
        </div>
      </div>
    </div>
  );
}

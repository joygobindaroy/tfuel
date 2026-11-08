import { useEffect, useRef, useState } from "react";
// @ts-ignore - react-dom has no bundled types in this project
import { createRoot } from "react-dom/client";

/** In-app replacements for window.confirm / window.prompt (some Telegram phone browsers block those and the button then does nothing). */
interface Opts { text?: string; ok?: string; cancel?: string; danger?: boolean; secret?: boolean; initial?: string; placeholder?: string; hint?: string; maxLength?: number; numeric?: boolean; notice?: boolean }

function Box({ title, o, input, done }: { title: string; o: Opts; input: boolean; done: (v: string | boolean | null) => void }) {
  const [v, setV] = useState(o.initial || "");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input) ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") done(input ? null : false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const yes = () => done(input ? v : true);
  return (
    <div className="sheet-bg" style={{ alignItems: "center", padding: 16 }} onClick={() => done(input ? null : false)}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ borderRadius: 22, maxWidth: 380 }}>
        <div className="title" style={{ fontSize: 17 }}>{title}</div>
        {o.text && <div className="sub" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{o.text}</div>}
        {input && (
          <>
            <input ref={ref} style={{ marginTop: 10 }} type={o.secret ? "password" : "text"} inputMode={o.numeric || o.secret ? "numeric" : undefined} autoComplete="off" maxLength={o.maxLength || (o.secret ? 6 : 300)} placeholder={o.placeholder || ""} value={v}
              onChange={(e) => setV(o.secret || o.numeric ? e.target.value.replace(/\D/g, "") : e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") yes(); }} />
            {o.hint && <div className="xs muted" style={{ marginTop: 6 }}>{o.hint}</div>}
          </>
        )}
        <div className={o.notice ? "" : "grid2"} style={{ marginTop: 14 }}>
          {!o.notice && <button className="btn sec" onClick={() => done(input ? null : false)}>{o.cancel || "Cancel"}</button>}
          <button className={`btn ${o.danger ? "danger" : ""} ${o.notice ? "block" : ""}`} onClick={yes}>{o.ok || "OK"}</button>
        </div>
      </div>
    </div>
  );
}
function open<T>(title: string, o: Opts, input: boolean): Promise<T> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root: any = createRoot(host);
    const done = (v: string | boolean | null) => { root.unmount(); host.remove(); resolve(v as T); };
    root.render(<Box title={title} o={o} input={input} done={done} />);
  });
}
/** Yes / No. Resolves false when cancelled. */
export const askConfirm = (title: string, o: Opts = {}) => open<boolean>(title, o, false);
/** One line of text. Resolves null when cancelled, "" when left empty. */
export const askText = (title: string, o: Opts = {}) => open<string | null>(title, o, true);
/** PIN box (digits, hidden). Resolves null when cancelled, "" when the user has no PIN. */
export const askPin = (title = "Enter your PIN", hint = "Leave empty if you have no PIN.") => open<string | null>(title, { secret: true, hint, ok: "Confirm", placeholder: "PIN" }, true);
/** A message with one OK button. */
export const askNotice = (title: string, text = "") => open<boolean>(title, { text, notice: true }, false);

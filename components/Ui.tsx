import { useEffect, useState } from "react";
import Icon, { IconName } from "@/components/Icons";
import { haptic } from "@/lib/client";

/** কপি বাটন: চাপলে কয়েক সেকেন্ড ✓ দেখায় (toast ছাড়াই) */
export function CopyBtn({ text, label, size = 14, className = "btn sec sm" }: { text: string; label?: string; size?: number; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      className={className}
      aria-label="Copy"
      onClick={(e) => {
        e.stopPropagation();
        try { navigator.clipboard?.writeText(text); } catch {}
        setOk(true);
        setTimeout(() => setOk(false), 1500);
      }}
    >
      <Icon name={ok ? "check" : "copy"} size={size} />{ok ? "Copied" : label}
    </button>
  );
}

/** খালি তালিকার সুন্দর বার্তা */
export function Empty({ icon = "list", title, hint, children }: { icon?: IconName; title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="card nodata">
      <div className="nodata-ico"><Icon name={icon} size={22} /></div>
      <div className="title">{title}</div>
      {hint && <div className="sub">{hint}</div>}
      {children}
    </div>
  );
}

/** Withdraw-এর আগে সারাংশ দেখিয়ে নিশ্চিত করা */
export function ConfirmSheet({ title, rows, warn, busy, confirmLabel = "Confirm", onConfirm, onCancel }: { title: string; rows: [string, string][]; warn?: string; busy?: boolean; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="sheet-bg" onClick={onCancel}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ fontSize: 17, marginBottom: 8 }}>{title}</div>
        <div className="card" style={{ background: "var(--soft)", boxShadow: "none" }}>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div className="sumrow" key={k}><span className="muted">{k}</span><b className="num" style={{ wordBreak: "break-all", textAlign: "right", marginLeft: 12 }}>{v}</b></div>
          ))}
        </div>
        {warn && <div className="banner warn"><Icon name="alert" size={18} /><span>{warn}</span></div>}
        <div className="grid2" style={{ marginTop: 12 }}>
          <button className="btn" disabled={busy} onClick={onConfirm}>{busy ? "Please wait…" : confirmLabel}</button>
          <button className="btn sec" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/** সেকেন্ড গোনা (resend কোড ইত্যাদির জন্য) */
export function useCountdown(): [number, (s: number) => void] {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

/* ---------------- Loading skeletons ---------------- */
export function Skel({ h = 14, w = "100%", r = 8, style }: { h?: number; w?: number | string; r?: number; style?: React.CSSProperties }) {
  return <span className="skel" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}
/** কার্ড-আকৃতির loading placeholder */
export function SkelCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      <Skel h={16} w="45%" style={{ marginBottom: 12 }} />
      {Array.from({ length: rows }).map((_, i) => <Skel key={i} h={12} w={i === rows - 1 ? "70%" : "100%"} style={{ marginBottom: 9 }} />)}
    </div>
  );
}
export function SkelList({ n = 4 }: { n?: number }) {
  return <div className="card" aria-busy="true" aria-label="Loading">{Array.from({ length: n }).map((_, i) => (
    <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "9px 0" }}>
      <Skel h={36} w={36} r={12} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}><Skel h={13} w="60%" style={{ marginBottom: 7 }} /><Skel h={10} w="35%" /></div>
      <Skel h={14} w={54} />
    </div>
  ))}</div>;
}

/* ---------------- Offline bar ---------------- */
export function useOnline() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    setOn(typeof navigator === "undefined" ? true : navigator.onLine);
    const a = () => setOn(true), b = () => setOn(false);
    window.addEventListener("online", a); window.addEventListener("offline", b);
    return () => { window.removeEventListener("online", a); window.removeEventListener("offline", b); };
  }, []);
  return on;
}
export function OfflineBar() {
  const on = useOnline();
  if (on) return null;
  return <div className="offbar" role="status"><Icon name="alert" size={14} /> No connection — showing saved data</div>;
}

/* ---------------- Confetti (tiny, no library) ---------------- */
export function confetti(n = 36) {
  haptic("success");
  try {
    if (typeof document === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const host = document.createElement("div");
    host.className = "confetti";
    const colors = ["#f59e0b", "#16a34a", "#2563eb", "#e5484d", "#a855f7", "#ffd27a"];
    for (let i = 0; i < n; i++) {
      const s = document.createElement("i");
      s.style.setProperty("--x", `${(Math.random() - 0.5) * 320}px`);
      s.style.setProperty("--y", `${-120 - Math.random() * 220}px`);
      s.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = `${Math.random() * 120}ms`;
      host.appendChild(s);
    }
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 1700);
  } catch {}
}

/* ---------------- Amount input with thousands separators ---------------- */
export const fmtAmtInput = (raw: string) => {
  if (!raw) return "";
  const [i, d] = raw.split(".");
  const ii = (i || "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return d === undefined ? ii : `${ii}.${d}`;
};
/** দেখায় 12,500.5 — কিন্তু state-এ থাকে "12500.5" (আগের মতোই) */
export function AmtInput({ value, onChange, max = 8, ...rest }: { value: string; onChange: (v: string) => void; max?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...rest}
      inputMode="decimal"
      autoComplete="off"
      value={fmtAmtInput(value)}
      onChange={(e) => {
        let r = e.target.value.replace(/,/g, "").replace(/[^\d.]/g, "");
        const p = r.split(".");
        if (p.length > 2) r = p[0] + "." + p.slice(1).join("");
        const [i, d] = r.split(".");
        if (d !== undefined && d.length > max) r = `${i}.${d.slice(0, max)}`;
        onChange(r);
      }}
    />
  );
}

/* ---------------- Sticky action bar (stays above the keyboard / tab bar) ---------------- */
export function Cta({ children }: { children: React.ReactNode }) {
  return <div className="cta">{children}</div>;
}

/* ---------------- Pull to refresh ---------------- */
export function usePullRefresh(onRefresh: () => void | Promise<void>) {
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let y0 = -1;
    const ok = (t: EventTarget | null) => !(t as HTMLElement | null)?.closest?.("input,textarea,select,canvas,.chart,.sheet,.modal");
    const start = (e: TouchEvent) => { y0 = window.scrollY <= 0 && ok(e.target) ? e.touches[0].clientY : -1; };
    const move = (e: TouchEvent) => {
      if (y0 < 0) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0 && window.scrollY <= 0) setPull(Math.min(90, dy * 0.5)); else if (dy <= 0) setPull(0);
    };
    const end = async () => {
      if (y0 < 0) return;
      y0 = -1;
      setPull((p) => {
        if (p >= 60) { setBusy(true); Promise.resolve(onRefresh()).finally(() => setTimeout(() => { setBusy(false); setPull(0); }, 600)); return 56; }
        return 0;
      });
    };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: true });
    document.addEventListener("touchend", end);
    return () => { document.removeEventListener("touchstart", start); document.removeEventListener("touchmove", move); document.removeEventListener("touchend", end); };
  }, [onRefresh]);
  return { pull, busy };
}
export function PullIndicator({ pull, busy }: { pull: number; busy: boolean }) {
  if (pull <= 0 && !busy) return null;
  return <div className="ptr" style={{ height: pull }}><span className={busy ? "ptr-spin" : ""} style={{ transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / 50) }}>⟳</span></div>;
}

/** Requested → Review → Paid (payout-এর অবস্থা) */
export function PayStepper({ status }: { status: string }) {
  const bad = status === "rejected";
  const stage = status === "paid" ? 2 : 1;
  const steps = ["Requested", "In review", bad ? "Rejected" : "Paid"];
  return (
    <div className="stepper">
      {steps.map((s, i) => (
        <div key={s} style={{ display: "contents" }}>
          <div className={`s ${bad && i === 2 ? "bad" : i < stage || (stage === 2 && i === 2) ? "done" : i === stage ? "now" : ""}`}><i />{s}</div>
          {i < 2 && <div className={`ln ${i < stage ? "done" : ""}`} />}
        </div>
      ))}
    </div>
  );
}

/** FAQ তালিকা (চাপলে উত্তর খোলে) */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!items.length) return null;
  return (
    <div className="card">
      <div className="title" style={{ marginBottom: 4 }}>Quick answers</div>
      {items.map((f, i) => (
        <div className="faq" key={i}>
          <b onClick={() => setOpen(open === i ? null : i)}>{f.q}</b>
          {open === i && <div className="a">{f.a}</div>}
        </div>
      ))}
    </div>
  );
}

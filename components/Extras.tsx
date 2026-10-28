import { fmtTf, fmtUsd } from "@/lib/client";
import { CopyBtn } from "@/components/Ui";
import { ReceiptActions } from "@/components/SendExtra";
import Icon from "@/components/Icons";

export interface ReceiptItem { id: string; t: string; c: number; u: number; n: string; at: number }

/** Transaction receipt: details + copy/share */
export function ReceiptSheet({ item, label, cpt, onClose }: { item: ReceiptItem; label: string; cpt: number; onClose: () => void }) {
  const say = (m: string) => { try { alert(m); } catch {} };
  const when = new Date(item.at).toLocaleString();
  const amt = [item.c ? `${item.c > 0 ? "+" : ""}${fmtTf(item.c, cpt)} TFUEL` : "", item.u ? `${item.u > 0 ? "+" : ""}${fmtUsd(Math.abs(item.u))} USDT` : ""].filter(Boolean).join("  ");
  const text = `Receipt\n${label}\n${amt}\n${when}\n${(item.n || "").match(/TF[0-9A-F]{40}/) ? "Transaction hash: " + (item.n || "").match(/TF[0-9A-F]{40}/)![0] : "Transaction ID: " + item.id}`;
  const share = () => {
    const w: any = typeof window !== "undefined" ? window : null;
    const url = `https://t.me/share/url?url=${encodeURIComponent(" ")}&text=${encodeURIComponent(text)}`;
    try { w?.Telegram?.WebApp?.openTelegramLink ? w.Telegram.WebApp.openTelegramLink(url) : w?.open(url, "_blank"); } catch {}
  };
  const hash = (item.n || "").match(/TF[0-9A-F]{40}/)?.[0] || "";
  const note = (item.n || "").replace(/\s*·?\s*TF[0-9A-F]{40}/, "").trim();
  const rows: [string, string][] = [["Type", label], ["Amount", amt || "—"], ["Date", when], ["Note", note], ...(hash ? [["Transaction hash", hash] as [string, string]] : [["Transaction ID", item.id] as [string, string]])];
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ fontSize: 17, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}><Icon name="check" size={18} /> Receipt</div>
        <div className="card" style={{ background: "var(--soft)", boxShadow: "none" }}>
          {rows.filter(([, v]) => v).map(([k, v]) => (
            <div className="sumrow" key={k}><span className="muted">{k}</span><span style={{ display: "flex", alignItems: "flex-start", gap: 6, marginLeft: 12, minWidth: 0 }}><b className="num" style={{ wordBreak: "break-all", textAlign: "right", fontSize: k.startsWith("Transaction") ? 12 : undefined }}>{v}</b>{k.startsWith("Transaction") && <CopyBtn text={v} className="btn ghost sm" size={14} />}</span></div>
          ))}
        </div>
        {hash && (item.t === "send" || item.t === "receive") ? <ReceiptActions txid={hash} say={say} /> : <button className="btn sec sm" style={{ marginTop: 12 }} onClick={share}>Share</button>}
        <button className="btn sec" style={{ marginTop: 8, width: "100%" }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

/** "Next reward" strip on the Tap screen */
export function NextReward({ me, cpt, onGo }: { me: any; cpt: number; onGo: () => void }) {
  const r = me?.ret;
  if (!r) return null;
  let text = "", pct = 0;
  if (me.dailyReady) { text = "Your daily reward is ready"; pct = 100; }
  else if (r.weekly && !r.weekly.claimed) { text = `Weekly challenge ${r.weekly.n}/${r.weekly.target} → +${fmtTf(r.weekly.reward, cpt)}`; pct = Math.floor((r.weekly.n / Math.max(1, r.weekly.target)) * 100); }
  else {
    const a = (r.ach || []).filter((x: any) => !x.done).sort((x: any, y: any) => y.value / y.goal - x.value / x.goal)[0];
    if (a) { text = `${a.title}: ${a.value.toLocaleString()}/${a.goal.toLocaleString()} → +${fmtTf(a.reward, cpt)}`; pct = Math.floor((a.value / a.goal) * 100); }
    else if (r.level) { text = `Level ${r.level.level} → ${r.level.pct}% to next`; pct = r.level.pct; }
  }
  if (!text) return null;
  return (
    <div className="card" role="button" style={{ cursor: "pointer" }} onClick={onGo}>
      <div className="t" style={{ fontSize: 13 }}><span><Icon name="target" size={14} /> Next reward</span><span className="muted">{pct}%</span></div>
      <div className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>{text}</div>
      <div className="bar"><div style={{ width: `${Math.min(100, pct)}%` }} /></div>
    </div>
  );
}

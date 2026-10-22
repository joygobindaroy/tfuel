import { db } from "./firebase";
import { sortableId } from "./crypto";
import { getSettings } from "./settings";
import { tgCall } from "./telegram";
import { inboxPush } from "./notify";
import { dayKey } from "./log";

export interface Audience { kind: "all" | "active" | "tag" | "country"; days?: number; tag?: string; country?: string }
export interface BroadcastJob { text: string; url?: string; btn?: string; aud: Audience; inbox?: boolean }
export interface Progress { id: string; status: "queued" | "sending" | "done"; total: number; sent: number; failed: number; created_at: number; done_at?: number; text: string; aud: Audience; cursor: number; ids?: string[]; job: BroadcastJob }

const PER_RUN = 400; // messages per cron run (cron may run every 1–5 min)
const PACE_MS = 40; // ≈25 msgs / second
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Admin-only user data other modules write: user_admin/<uid>/{tags:{VIP:true}, country:"BD"} */
export async function audienceIds(a: Audience): Promise<string[]> {
  const idx = ((await db().ref("user_index").get()).val() || {}) as Record<string, any>;
  let ids = Object.keys(idx);
  if (a.kind === "all") return ids;
  if (a.kind === "active") {
    const since = Date.now() - Math.max(1, Math.min(365, a.days || 7)) * 86400000;
    const users = ((await db().ref("users").get()).val() || {}) as Record<string, any>;
    return ids.filter((id) => (users[id]?.last_seen || 0) >= since && !users[id]?.banned);
  }
  const meta = ((await db().ref("user_admin").get()).val() || {}) as Record<string, any>;
  if (a.kind === "tag") { const t = String(a.tag || "").trim().toLowerCase(); return ids.filter((id) => Object.keys(meta[id]?.tags || {}).some((k) => k.toLowerCase() === t)); }
  if (a.kind === "country") { const c = String(a.country || "").trim().toUpperCase(); return ids.filter((id) => String(meta[id]?.country || "").toUpperCase() === c); }
  return [];
}

export async function startBroadcast(job: BroadcastJob, by: string): Promise<{ id: string; total: number }> {
  const ids = await audienceIds(job.aud);
  const id = sortableId();
  const p: Progress = { id, status: ids.length ? "queued" : "done", total: ids.length, sent: 0, failed: 0, created_at: Date.now(), text: job.text.slice(0, 200), aud: job.aud, cursor: 0, ids, job };
  await db().ref(`broadcasts/${id}`).set({ ...p, by });
  return { id, total: ids.length };
}

/** Sends the next batch of every unfinished broadcast. Never throws. */
export async function pumpBroadcasts(): Promise<{ sent: number; jobs: number }> {
  let sent = 0, jobs = 0;
  try {
    const all = ((await db().ref("broadcasts").get()).val() || {}) as Record<string, Progress>;
    let budget = PER_RUN;
    for (const [id, p] of Object.entries(all)) {
      if (p.status === "done" || budget <= 0) continue;
      jobs++;
      const ids = p.ids || [];
      let cur = p.cursor || 0, ok = p.sent || 0, bad = p.failed || 0;
      const kb = p.job.url ? JSON.stringify({ inline_keyboard: [[{ text: (p.job.btn || "Open").slice(0, 30), url: p.job.url }]] }) : "";
      while (cur < ids.length && budget > 0) {
        const uid = ids[cur++];
        budget--;
        if (p.job.inbox !== false) await inboxPush(uid, p.job.text);
        const params: Record<string, string | number> = { chat_id: uid, text: p.job.text.slice(0, 3500), disable_web_page_preview: "true" };
        if (kb) params.reply_markup = kb;
        const r = await tgCall("sendMessage", params);
        if (r.ok) ok++; else bad++;
        sent++;
        await sleep(PACE_MS);
      }
      const done = cur >= ids.length;
      await db().ref(`broadcasts/${id}`).update({ cursor: cur, sent: ok, failed: bad, status: done ? "done" : "sending", ...(done ? { done_at: Date.now(), ids: null } : {}) });
    }
  } catch (e) { console.error("pumpBroadcasts", e); }
  return { sent, jobs };
}

/** Post to the configured channel */
export async function postToChannel(text: string, force = false): Promise<{ ok: boolean; error?: string }> {
  const s = await getSettings();
  if (!s.autopost_channel) return { ok: false, error: "Set the channel first" };
  if (!force && !s.autopost_enabled) return { ok: false, error: "Auto-post is off" };
  const r = await tgCall("sendMessage", { chat_id: s.autopost_channel, text: text.slice(0, 3800), disable_web_page_preview: "true" });
  return r.ok ? { ok: true } : { ok: false, error: r.description || "Telegram refused" };
}

/** Scheduled items: admin_schedule/<id> = {type:'broadcast'|'announcement', at, done?, ...} */
export async function runSchedule(by = "schedule"): Promise<{ ran: number }> {
  let ran = 0;
  try {
    const list = ((await db().ref("admin_schedule").get()).val() || {}) as Record<string, any>;
    const now = Date.now();
    for (const [id, it] of Object.entries(list)) {
      if (it.done || !(it.at <= now)) continue;
      const claimed = await db().ref(`admin_schedule/${id}/done`).transaction((c: any) => (c ? undefined : now));
      if (!claimed.committed) continue;
      if (it.type === "broadcast") await startBroadcast({ text: it.text, url: it.url, btn: it.btn, aud: it.aud || { kind: "all" } }, by);
      else if (it.type === "announcement") {
        const cur = ((await db().ref("settings").get()).val() || {}) as any;
        await db().ref("settings/announcement").set({ ...(cur.announcement || {}), enabled: !!it.text, text: String(it.text || "").slice(0, 240), kind: it.kind || "info" });
        const { invalidateSettings } = await import("./settings");
        invalidateSettings();
      }
      ran++;
    }
  } catch (e) { console.error("runSchedule", e); }
  return { ran };
}
export { dayKey };

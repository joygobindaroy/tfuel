import type { AdminMod } from "./types";
import { db } from "../firebase";
import { sortableId } from "../crypto";
import { adminLog } from "../log";
import { HttpError } from "../auth";
import { getSettings } from "../settings";
import { startBroadcast, audienceIds, postToChannel, Audience } from "../broadcast";
import { alertAdmins, alertTargets } from "../adminalert";
import { tgCall } from "../telegram";
import { daySummary, summaryText } from "../insights";

const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);
const httpsOrEmpty = (v: any) => { const s = String(v || "").trim(); if (!s) return ""; if (!/^https:\/\/\S+$/i.test(s)) throw new HttpError(400, "Button link must be an https URL"); return s.slice(0, 300); };
function parseAud(a: any): Audience {
  const kind = ["all", "active", "tag", "country"].includes(a?.kind) ? a.kind : "all";
  if (kind === "tag" && !clean(a.tag, 30)) throw new HttpError(400, "Enter a tag");
  if (kind === "country" && !/^[A-Za-z]{2}$/.test(String(a.country || ""))) throw new HttpError(400, "Country must be a 2-letter code (BD, IN…)");
  return { kind, days: Math.min(365, Math.max(1, Math.floor(Number(a?.days)) || 7)), tag: clean(a?.tag, 30), country: String(a?.country || "").toUpperCase().slice(0, 2) };
}
const needSuper = (role: string) => { if (role !== "super") throw new HttpError(403, "Only the Super admin can do this"); };

/** Admin → Comms: broadcast, schedule, channel post, support templates & ticket tags, alerts */
const mod: AdminMod = async (action, b, ctx) => {
  switch (action) {
    case "commsData": {
      const s = await getSettings(true);
      const [bc, sc] = await Promise.all([db().ref("broadcasts").orderByKey().limitToLast(10).get(), db().ref("admin_schedule").get()]);
      const broadcasts: any[] = [];
      bc.forEach((c) => { const v = c.val() || {}; broadcasts.push({ id: c.key, text: v.text, status: v.status, total: v.total, sent: v.sent, failed: v.failed, created_at: v.created_at, aud: v.aud }); });
      const schedule = Object.entries((sc.val() || {}) as Record<string, any>).map(([id, v]) => ({ id, ...v })).filter((x) => !x.done).sort((a, c) => a.at - c.at);
      return {
        broadcasts: broadcasts.reverse(), schedule,
        settings: { alert_chat: s.alert_chat, alert_big_usdt: s.alert_big_usdt, alert_hold: s.alert_hold, alert_ticket: s.alert_ticket, alert_errors: s.alert_errors, autopost_enabled: s.autopost_enabled, autopost_channel: s.autopost_channel, summary_enabled: s.summary_enabled, summary_hour_utc: s.summary_hour_utc, support_templates: s.support_templates },
        targets: alertTargets(s.alert_chat).length,
      };
    }
    case "broadcastCount": {
      return { count: (await audienceIds(parseAud(b.aud))).length };
    }
    case "broadcastSend": {
      needSuper(ctx.role);
      const text = clean(b.text, 3500);
      if (text.length < 3) throw new HttpError(400, "Write a message");
      const job = { text, url: httpsOrEmpty(b.url), btn: clean(b.btn, 30) || "Open", aud: parseAud(b.aud), inbox: b.inbox !== false };
      const at = Number(b.at) || 0;
      if (at > Date.now() + 60000) {
        if (at > Date.now() + 90 * 86400000) throw new HttpError(400, "Schedule at most 90 days ahead");
        const id = sortableId();
        await db().ref(`admin_schedule/${id}`).set({ type: "broadcast", at, ...job, by: ctx.who, created_at: Date.now() });
        await adminLog(ctx.who, "schedule_broadcast", { id, at });
        return { scheduled: id };
      }
      const r = await startBroadcast(job, ctx.who);
      await adminLog(ctx.who, "broadcast", { id: r.id, total: r.total, aud: job.aud.kind });
      return { id: r.id, total: r.total };
    }
    case "scheduleAnnouncement": {
      needSuper(ctx.role);
      const at = Number(b.at) || 0;
      if (!(at > Date.now())) throw new HttpError(400, "Pick a future time");
      const id = sortableId();
      await db().ref(`admin_schedule/${id}`).set({ type: "announcement", at, text: clean(b.text, 240), kind: ["info", "warn", "success"].includes(b.kind) ? b.kind : "info", by: ctx.who, created_at: Date.now() });
      await adminLog(ctx.who, "schedule_announcement", { id, at });
      return { scheduled: id };
    }
    case "scheduleDelete": {
      needSuper(ctx.role);
      const id = clean(b.id, 64);
      if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, "Invalid id");
      await db().ref(`admin_schedule/${id}`).remove();
      return {};
    }
    case "postChannel": {
      needSuper(ctx.role);
      const text = clean(b.text, 3800);
      if (text.length < 3) throw new HttpError(400, "Write the post");
      const r = await postToChannel(text, true);
      if (!r.ok) throw new HttpError(400, r.error || "Could not post");
      await adminLog(ctx.who, "channel_post", { len: text.length });
      return {};
    }
    case "ticketTag": {
      const id = clean(b.id, 64);
      if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, "Invalid id");
      const tag = clean(b.tag, 20).toLowerCase();
      if ((await db().ref(`tickets/${id}/uid`).get()).val() === null) throw new HttpError(404, "Ticket not found");
      await db().ref(`tickets/${id}/tag`).set(tag || null);
      return {};
    }
    case "commsTickets": {
      const snap = await db().ref("tickets").orderByKey().limitToLast(150).get();
      const items: any[] = [];
      snap.forEach((c) => { const x = c.val() || {}; items.push({ id: c.key, uid: x.uid, name: x.name, subject: x.subject, status: x.status, tag: x.tag || "", updated_at: x.updated_at, n: Object.keys(x.msgs || {}).length }); });
      return { items: items.sort((a, c) => c.updated_at - a.updated_at) };
    }
    case "alertTest": {
      needSuper(ctx.role);
      const s = await getSettings(true);
      if (!alertTargets(s.alert_chat).length) throw new HttpError(400, "No alert chat. Enter your numeric Telegram ID (get it from @userinfobot) and save.");
      const ok = await alertAdmins("error", "Test alert from the admin panel. Alerts are working.");
      if (!ok) throw new HttpError(400, "Telegram did not deliver. Open the bot and press Start first.");
      return {};
    }
    case "summaryNow": {
      const s = await getSettings(true);
      const text = summaryText(await daySummary());
      if (b.send) {
        needSuper(ctx.role);
        let ok = false;
        for (const c of alertTargets(s.alert_chat)) ok = !!(await tgCall("sendMessage", { chat_id: c, text })).ok || ok;
        if (!ok) throw new HttpError(400, "Could not send. Set the alert chat first.");
      }
      return { text };
    }
    case "templateList": {
      const v = (await db().ref("admin_cfg/support_templates").get()).val();
      if (Array.isArray(v) || (v && typeof v === "object")) {
        const items = (Array.isArray(v) ? v : Object.values(v)).map((x: any) => ({ title: clean(x?.title, 40), text: clean(x?.text, 800) })).filter((x) => x.title && x.text);
        return { items };
      }
      const s = await getSettings();
      return { items: (s.support_templates || []).map((x) => ({ title: x.title, text: x.text })) };
    }
    case "templateSave": {
      if (!Array.isArray(b.items) || b.items.length > 30) throw new HttpError(400, "At most 30 templates");
      const items = b.items.map((x: any) => ({ title: clean(x?.title, 40), text: String(x?.text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").trim().slice(0, 800) })).filter((x: any) => x.title && x.text);
      await db().ref("admin_cfg/support_templates").set(items.length ? items : null);
      await adminLog(ctx.who, "templates_save", { n: items.length });
      return { items };
    }
    default:
      return undefined;
  }
};
export default mod;

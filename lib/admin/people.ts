import { ServerValue } from "firebase-admin/database";
import { db } from "../firebase";
import { HttpError } from "../auth";
import { adminLog } from "../log";
import { sortableId } from "../crypto";
import { notify, inboxPush } from "../notify";
import { earn, activity } from "../wallet";
import { fromU } from "../market";
import { getSettings } from "../settings";
import type { UserRecord } from "../user";
import type { AdminMod, AdminCtx } from "./types";

const uidRe = /^\d{1,20}$/;
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const PRESET_TAGS = ["vip", "suspicious", "testing"];
const tagNorm = (v: any) => String(v ?? "").toLowerCase().replace(/[^a-z0-9 _-]/g, "").trim().replace(/\s+/g, "-").slice(0, 20);
const uidOf = (v: any) => { const s = String(v || "").trim(); if (!uidRe.test(s)) throw new HttpError(400, "Invalid user id"); return s; };
/** support = read-only on money/ban/freeze/bulk; notes + tags are allowed for everyone */
const needWrite = (ctx: AdminCtx) => { if (ctx.role === "support") throw new HttpError(403, "Your admin role can't do this"); };

let idxCache: { at: number; v: Record<string, any> } | null = null;
async function userIndex() {
  if (idxCache && Date.now() - idxCache.at < 60000) return idxCache.v;
  const v = ((await db().ref("user_index").get()).val() || {}) as Record<string, any>;
  idxCache = { at: Date.now(), v };
  return v;
}

async function rowsFor(ids: string[]) {
  const [us, tg, fr, geo] = await Promise.all([
    Promise.all(ids.map((i) => db().ref(`users/${i}`).get())),
    Promise.all(ids.map((i) => db().ref(`user_tags/${i}`).get())),
    Promise.all(ids.map((i) => db().ref(`frozen/${i}`).get())),
    Promise.all(ids.map((i) => db().ref(`user_prefs/${i}/geo`).get())),
  ]);
  return ids.map((id, i) => {
    const u = (us[i].val() || {}) as UserRecord;
    return {
      id, name: u.name || "", username: u.username || "", balance: Number(u.balance) || 0, usdt: fromU(u.usdt_u || 0),
      banned: !!u.banned, frozen: !!fr[i].val(), tags: Object.keys(tg[i].val() || {}), last_seen: u.last_seen || 0, created_at: u.created_at || 0,
      cc: String((geo[i].val() || {}).cc || ""),
    };
  });
}

/** Scan device hashes / IPs across all users (admin-only, cached 5 min) */
let dupCache: { at: number; v: any } | null = null;
async function scanPrefs() {
  if (dupCache && Date.now() - dupCache.at < 300000) return dupCache.v;
  const all = ((await db().ref("user_prefs").get()).val() || {}) as Record<string, any>;
  const byDev: Record<string, string[]> = {};
  const byIp: Record<string, string[]> = {};
  const byCc: Record<string, number> = {};
  for (const [uid, p] of Object.entries(all)) {
    for (const h of Object.keys(p?.devices || {})) (byDev[h] = byDev[h] || []).push(uid);
    const ip = p?.geo?.ip;
    if (ip) (byIp[ip] = byIp[ip] || []).push(uid);
    const cc = p?.geo?.cc || "??";
    byCc[cc] = (byCc[cc] || 0) + 1;
  }
  const v = { byDev, byIp, byCc, geo: Object.fromEntries(Object.entries(all).map(([u, p]: any) => [u, p?.geo?.cc || ""])) };
  dupCache = { at: Date.now(), v };
  return v;
}

const clipList = (o: Record<string, any> | null | undefined, n: number) =>
  Object.entries(o || {}).sort(([a], [b]) => (a < b ? 1 : -1)).slice(0, n).map(([id, v]) => ({ id, ...(v as any) }));

const mod: AdminMod = async (action, b, ctx) => {
  switch (action) {
    /* ---- search ---- */
    case "uSearch": {
      const q = clean(b.q, 60).toLowerCase().replace(/^@/, "");
      const tag = tagNorm(b.tag);
      const cc = String(b.cc || "").toUpperCase().slice(0, 2);
      const index = await userIndex();
      let ids: string[] = [];
      if (tag) {
        ids = Object.keys(((await db().ref("tags_index/" + tag).get()).val() || {}) as Record<string, any>);
      } else if (q) {
        if (/^[a-z0-9]{10}$/i.test(q) && !uidRe.test(q)) {
          const byCode = (await db().ref(`ref_codes/${clean(b.q, 20).replace(/^@/, "")}`).get()).val();
          if (typeof byCode === "string") ids.push(byCode);
        }
        if (uidRe.test(q) && index[q]) ids.push(q);
        for (const [id, v] of Object.entries(index)) {
          if (ids.includes(id)) continue;
          if (String(v.name || "").toLowerCase().includes(q) || String(v.username || "").toLowerCase().includes(q)) ids.push(id);
          if (ids.length >= 60) break;
        }
      } else {
        ids = Object.entries(index).sort(([, a]: any, [, c]: any) => (c.created_at || 0) - (a.created_at || 0)).slice(0, 40).map(([id]) => id);
      }
      let rows = await rowsFor(ids.slice(0, 60));
      if (cc) rows = rows.filter((r) => r.cc === cc);
      return { users: rows, total: Object.keys(index).length };
    }

    /* ---- full single-page view ---- */
    case "uFull": {
      const uid = uidOf(b.uid);
      const u = (await db().ref(`users/${uid}`).get()).val() as (UserRecord & Record<string, any>) | null;
      if (!u) throw new HttpError(404, "User not found");
      const [fl, pref, sl, act, refs, tick, tags, notes, frz, dep, uw, tr, wd, sent, ucodes] = await Promise.all([
        db().ref(`flags/${uid}`).get(),
        db().ref(`user_prefs/${uid}`).get(),
        db().ref(`sec_log/${uid}`).orderByKey().limitToLast(30).get(),
        db().ref(`activity/${uid}`).orderByKey().limitToLast(30).get(),
        db().ref(`referrals/${uid}`).get(),
        db().ref(`user_tickets/${uid}`).get(),
        db().ref(`user_tags/${uid}`).get(),
        db().ref(`admin_notes/${uid}`).get(),
        db().ref(`frozen/${uid}`).get(),
        db().ref(`users/${uid}/deposits`).get(),
        db().ref(`users/${uid}/usdt_withdrawals`).get(),
        db().ref(`users/${uid}/trades`).get(),
        db().ref(`users/${uid}/withdrawals`).get(),
        db().ref(`send_daily/${uid}`).get(),
        db().ref(`user_prefs/${uid}/refcode`).get(),
      ]);
      const pf = (pref.val() || {}) as any;
      const friends = Object.entries((refs.val() || {}) as Record<string, any>).map(([id, r]) => ({ id, name: r.name, at: r.at, bonus: r.bonus || 0, comm: r.comm || 0 })).sort((a, c) => (c.at || 0) - (a.at || 0));
      const same = await scanPrefs();
      const dupes = new Set<string>();
      for (const h of Object.keys(pf.devices || {})) for (const o of same.byDev[h] || []) if (o !== uid) dupes.add(o);
      if (pf.geo?.ip) for (const o of same.byIp[pf.geo.ip] || []) if (o !== uid) dupes.add(o);
      const f: any = fl.val() || {};
      return {
        user: {
          id: uid, name: u.name || "", username: u.username || "", refcode: ucodes.val() || "",
          balance: Number(u.balance) || 0, usdt: fromU(u.usdt_u || 0),
          banned: !!u.banned, ban_reason: u.ban_reason || "", frozen: frz.val() || null,
          created_at: u.created_at || 0, last_seen: u.last_seen || 0, referred_by: u.referred_by || "",
          ref_count: u.ref_count || 0, ref_earned: u.ref_earned || 0, ref_comm: u.ref_comm || 0,
          tasks_done: Object.keys(u.completed_tasks || {}).length,
          energy: Math.round(Number(u.energy) || 0), streak: u.daily?.streak || 0,
          boosts: Object.values(u.boosts || {}).map((x: any) => x.name),
          stakes: Object.values(u.stakes || {}).filter((x: any) => x.status === "active").length,
        },
        earn: u.earn || {}, spent: u.spent || {},
        usdt_tot: Object.fromEntries(Object.entries(u.usdt_tot || {}).map(([k, v]) => [k, fromU(Number(v))])),
        flags: { too_fast: f.too_fast || 0, bad_codes: f.bad_codes || 0, locked: f.locked || 0, out_of_order: f.out_of_order || 0 },
        deposits: clipList(dep.val(), 50),
        usdt_withdrawals: clipList(uw.val(), 50),
        withdrawals: clipList(wd.val(), 50),
        trades: clipList(tr.val(), 30),
        activity: Object.entries((act.val() || {}) as Record<string, any>).sort(([a], [c]) => (a < c ? 1 : -1)).map(([id, v]) => ({ id, ...v })),
        friends: friends.slice(0, 100), friends_total: friends.length,
        tickets: clipList(tick.val(), 20),
        tags: Object.keys(tags.val() || {}),
        notes: clipList(notes.val(), 100),
        security: {
          email: pf.email?.addr || "", email_verified: !!pf.email?.verified, pin: !!pf.pin, addrs: Object.keys(pf.addrs || {}).length,
          devices: Object.values(pf.devices || {}).map((d: any) => ({ label: d.label, first: d.first, last: d.last })),
          geo: pf.geo || null,
          log: Object.entries((sl.val() || {}) as Record<string, any>).sort(([a], [c]) => (a < c ? 1 : -1)).map(([id, e]) => ({ id, ...e })),
        },
        same_device_or_ip: [...dupes].slice(0, 20),
        send_today: Number((sent.val() || {})[new Date().toISOString().slice(0, 10).replace(/-/g, "")]) || 0,
      };
    }

    /* ---- tags & internal notes (admin-only paths: user_tags, tags_index, admin_notes) ---- */
    case "uTagSet": {
      const uid = uidOf(b.uid);
      const want = Array.from(new Set((Array.isArray(b.tags) ? b.tags : []).map(tagNorm).filter(Boolean))).slice(0, 8) as string[];
      const cur = Object.keys(((await db().ref(`user_tags/${uid}`).get()).val() || {}) as Record<string, any>);
      const upd: Record<string, any> = {};
      for (const t of cur) if (!want.includes(t)) { upd[`user_tags/${uid}/${t}`] = null; upd[`tags_index/${t}/${uid}`] = null; }
      for (const t of want) { upd[`user_tags/${uid}/${t}`] = true; upd[`tags_index/${t}/${uid}`] = true; }
      await db().ref().update(upd);
      await adminLog(ctx.who, "user_tags", { uid, tags: want });
      return { tags: want, preset: PRESET_TAGS };
    }
    case "uNoteAdd": {
      const uid = uidOf(b.uid);
      const text = clean(b.text, 600);
      if (text.length < 2) throw new HttpError(400, "Write a note");
      const id = sortableId();
      await db().ref(`admin_notes/${uid}/${id}`).set({ t: text, by: ctx.who, at: Date.now() });
      return { id };
    }
    case "uNoteDel": {
      const uid = uidOf(b.uid);
      const id = String(b.id || "");
      if (!/^[\w-]{1,64}$/.test(id)) throw new HttpError(400, "Invalid id");
      await db().ref(`admin_notes/${uid}/${id}`).remove();
      return {};
    }
    case "uTagCounts": {
      const all = ((await db().ref("tags_index").get()).val() || {}) as Record<string, Record<string, any>>;
      const counts = Object.fromEntries(Object.entries(all).map(([t, m]) => [t, Object.keys(m || {}).length]));
      return { counts, preset: PRESET_TAGS };
    }

    /* ---- freeze (withdraw / send blocked, user not banned) ---- */
    case "uFreeze": {
      needWrite(ctx);
      const uid = uidOf(b.uid);
      if ((await db().ref(`users/${uid}/balance`).get()).val() === null) throw new HttpError(404, "User not found");
      const on = !!b.frozen;
      const reason = clean(b.reason, 200);
      if (on && reason.length < 3) throw new HttpError(400, "A reason is required");
      await db().ref(`frozen/${uid}`).set(on ? { reason, by: ctx.who, at: Date.now() } : null);
      await adminLog(ctx.who, on ? "freeze" : "unfreeze", { uid, reason });
      return { frozen: on };
    }

    /* ---- duplicates & countries ---- */
    case "uDupes": {
      const s = await scanPrefs();
      const groups: { kind: string; key: string; uids: string[] }[] = [];
      for (const [k, v] of Object.entries(s.byIp as Record<string, string[]>)) if (v.length > 1) groups.push({ kind: "ip", key: k, uids: v });
      for (const [k, v] of Object.entries(s.byDev as Record<string, string[]>)) if (v.length > 1) groups.push({ kind: "device", key: k, uids: v });
      groups.sort((a, c) => c.uids.length - a.uids.length);
      const top = groups.slice(0, 40);
      const index = await userIndex();
      return { groups: top.map((g) => ({ ...g, uids: g.uids.slice(0, 12).map((id) => ({ id, name: index[id]?.name || "", username: index[id]?.username || "" })), total: g.uids.length })), scanned_at: Date.now() };
    }
    case "uCountries": {
      const s = await scanPrefs();
      const st = await getSettings();
      const rows = Object.entries(s.byCc as Record<string, number>).map(([cc, n]) => ({ cc, n })).sort((a, c) => c.n - a.n);
      return { rows, blocked: st.blocked_countries || [] };
    }

    /* ---- bulk actions ---- */
    case "uBulk": {
      needWrite(ctx);
      const uids = Array.from(new Set((Array.isArray(b.uids) ? b.uids : []).map((x: any) => String(x)))).filter((x) => uidRe.test(x as string)) as string[];
      if (!uids.length) throw new HttpError(400, "Select at least one user");
      if (uids.length > 200) throw new HttpError(400, "At most 200 users at a time");
      const op = String(b.op || "");
      const reason = clean(b.reason, 200);
      let done = 0;
      if (op === "bonus") {
        const amt = Math.floor(Number(b.amount));
        if (!Number.isFinite(amt) || amt < 1 || amt > 1e8) throw new HttpError(400, "Invalid amount");
        if (reason.length < 3) throw new HttpError(400, "A reason is required");
        for (const uid of uids) {
          let ok = false;
          await db().ref(`users/${uid}`).transaction((cur: UserRecord | null) => {
            ok = false;
            if (cur === null) return cur;
            cur.balance = (Number(cur.balance) || 0) + amt;
            earn(cur, "adjust", amt);
            ok = true;
            return cur;
          });
          if (ok) { done++; await activity(uid, "adjust", { coins: amt, note: reason }); await notify(uid, `🎁 You received a bonus: ${reason}`); }
        }
      } else if (op === "ban" || op === "unban") {
        if (op === "ban" && reason.length < 3) throw new HttpError(400, "A reason is required");
        for (const uid of uids) {
          if ((await db().ref(`users/${uid}/balance`).get()).val() === null) continue;
          await db().ref().update({ [`users/${uid}/banned`]: op === "ban" ? true : null, [`users/${uid}/ban_reason`]: op === "ban" ? reason : null });
          done++;
        }
      } else if (op === "message") {
        const text = clean(b.text, 300);
        if (text.length < 3) throw new HttpError(400, "Write a message");
        for (const uid of uids) { await inboxPush(uid, text); done++; }
      } else if (op === "tag") {
        const t = tagNorm(b.tag);
        if (!t) throw new HttpError(400, "Enter a tag");
        const upd: Record<string, any> = {};
        for (const uid of uids) { upd[`user_tags/${uid}/${t}`] = true; upd[`tags_index/${t}/${uid}`] = true; done++; }
        await db().ref().update(upd);
      } else throw new HttpError(400, "Unknown bulk action");
      await adminLog(ctx.who, "bulk_" + op, { users: uids.length, done, reason, amount: b.amount });
      return { done };
    }
    default:
      return undefined;
  }
};
void ServerValue;
export default mod;

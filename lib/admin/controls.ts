import type { AdminMod } from "./types";
import { db } from "../firebase";
import { adminLog, dayKey } from "../log";
import { HttpError } from "../auth";
import { rateLimit } from "../api";
import { getSettings, invalidateSettings, parseSettings, Settings } from "../settings";
import { FEATURES, featureOn } from "../features";
import { getCfg2, invalidateCfg2, SECTIONS, Cfg2 } from "../cfg2";
import { VERSION } from "../version";
import { CHANGELOG_HIGHLIGHTS } from "../changelog";
import { ROLE_TABS } from "./roles";
import { adminAccounts, get2fa, get2faPending, set2fa, set2faPending, newTotpSecret, otpauthUrl, totpVerify } from "../adminauth";

const needSuper = (role: string) => { if (role !== "super") throw new HttpError(403, "Only the Super admin can do this"); };
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
/** Settings keys that look like secrets are never exported or imported */
const SECRET_KEY = /key|secret|token|passw|credential/i;
const stripSecrets = (o: any) => Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([k]) => !SECRET_KEY.test(k)));
const short = (v: any) => { const s = JSON.stringify(v ?? null) ?? "null"; return s.length > 120 ? s.slice(0, 117) + "…" : s; };

/** -1 / 0 / 1 for dotted versions like "17.1" vs "18" */
export function versionCmp(a: string, b: string): number {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0), pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d < 0 ? -1 : 1; }
  return 0;
}

const BACKUP_FORMAT = "tfuel-settings-backup";

/** Validate an uploaded backup through the normal sanitizers and work out what would change */
async function planRestore(payload: any) {
  if (!payload || typeof payload !== "object" || payload.format !== BACKUP_FORMAT) throw new HttpError(400, "This is not a settings backup file");
  const cur = await getSettings(true);
  const curC = await getCfg2(true);
  const diff: { area: "settings" | "cfg2"; key: string; from: string; to: string }[] = [];
  const skipped: string[] = [];

  let nextS: Settings | null = null;
  if (payload.settings && typeof payload.settings === "object") {
    const given = payload.settings as Record<string, any>;
    for (const k of Object.keys(given)) if (SECRET_KEY.test(k)) skipped.push(`settings.${k} (secret, never imported)`);
    nextS = parseSettings(stripSecrets(given), cur);
    for (const k of Object.keys(nextS)) if (JSON.stringify((nextS as any)[k]) !== JSON.stringify((cur as any)[k])) diff.push({ area: "settings", key: k, from: short((cur as any)[k]), to: short((nextS as any)[k]) });
  }

  const nextC: Partial<Record<keyof Cfg2, any>> = {};
  if (payload.cfg2 && typeof payload.cfg2 === "object") {
    for (const [k, raw] of Object.entries(payload.cfg2 as Record<string, any>)) {
      if (!Object.prototype.hasOwnProperty.call(SECTIONS, k)) { skipped.push(`cfg2.${k} (unknown section)`); continue; }
      let v = raw;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { skipped.push(`cfg2.${k} (not valid JSON)`); continue; } }
      let cleaned: any;
      try { cleaned = (SECTIONS as any)[k](v, (curC as any)[k]); } catch (e: any) { skipped.push(`cfg2.${k} (${clean(e?.message, 80)})`); continue; }
      if (JSON.stringify(cleaned) !== JSON.stringify((curC as any)[k])) { nextC[k as keyof Cfg2] = cleaned; diff.push({ area: "cfg2", key: k, from: short((curC as any)[k]), to: short(cleaned) }); }
    }
  }
  return { nextS, nextC, diff, skipped };
}

/** Admin → Controls: feature switches, backup/restore, version, security (2FA, logins, roles), rate-limit dashboard */
const mod: AdminMod = async (action, b, ctx) => {
  switch (action) {
    /* ---------- identity ---------- */
    case "whoami": {
      const acc = adminAccounts().some((a) => a.name === ctx.who);
      const secret = acc ? await get2fa(ctx.who) : null;
      const tabs = ROLE_TABS[ctx.role];
      return { who: ctx.who, role: ctx.role, tabs, isAccount: acc, twofa: !!secret };
    }

    /* ---------- (16) feature switches ---------- */
    case "featuresData": {
      const s = await getSettings(true);
      return { features: FEATURES.map((f) => ({ key: f.key, label: f.label, group: f.group, hasFlag: !!f.flag, on: featureOn(s, f.key), msg: s.feature_off?.[f.key] || "" })) };
    }
    case "featureSet": {
      needSuper(ctx.role);
      const f = FEATURES.find((x) => x.key === String(b.key));
      if (!f) throw new HttpError(400, "Unknown feature");
      const on = b.on === true || b.on === "true";
      const msg = clean(b.msg, 200);
      const cur = await getSettings(true);
      const off = { ...(cur.feature_off || {}) };
      const patch: Record<string, any> = {};
      if (on) delete off[f.key];
      else if (f.flag) { if (msg) off[f.key] = msg; else delete off[f.key]; }
      else off[f.key] = msg || " "; // key present = off; blank message falls back to the generic text
      if (f.flag) patch[f.flag as string] = on;
      patch.feature_off = off;
      const next = parseSettings(patch, cur);
      if (!on && !f.flag && next.feature_off[f.key] === "") next.feature_off[f.key] = ""; // keep the key (empty message ⇒ generic text)
      await db().ref("settings").set(next);
      invalidateSettings();
      await adminLog(ctx.who, "feature_switch", { key: f.key, on, msg });
      return { on: featureOn(next, f.key), msg: next.feature_off[f.key] || "" };
    }

    /* ---------- (17) backup / restore ---------- */
    case "backupExport": {
      needSuper(ctx.role);
      const [s, c] = await Promise.all([getSettings(true), getCfg2(true)]);
      await adminLog(ctx.who, "backup_export", {});
      return { backup: { format: BACKUP_FORMAT, version: VERSION, at: Date.now(), settings: stripSecrets(s), cfg2: c } };
    }
    case "backupPreview": {
      needSuper(ctx.role);
      const p = await planRestore(b.backup);
      return { diff: p.diff, skipped: p.skipped };
    }
    case "backupApply": {
      needSuper(ctx.role);
      const p = await planRestore(b.backup);
      if (p.nextS) { await db().ref("settings").set(p.nextS); invalidateSettings(); }
      for (const [k, v] of Object.entries(p.nextC)) await db().ref(`cfg2/${k}`).set(JSON.stringify(v));
      invalidateCfg2();
      await adminLog(ctx.who, "backup_restore", { changed: p.diff.map((d) => `${d.area}.${d.key}`).slice(0, 80), skipped: p.skipped.length });
      return { applied: p.diff.length, skipped: p.skipped };
    }

    /* ---------- (18) version & changelog ---------- */
    case "versionData": {
      const installed = String((await db().ref("admin_cfg/installed_version").get()).val() || "");
      return { version: VERSION, installed, newer: !installed || versionCmp(VERSION, installed) > 0, changelog: CHANGELOG_HIGHLIGHTS };
    }
    case "installedSet": {
      needSuper(ctx.role);
      const v = clean(b.v, 20);
      if (v && !/^[\w.\-]{1,20}$/.test(v)) throw new HttpError(400, "Enter a version like 17.1");
      await db().ref("admin_cfg/installed_version").set(v || null);
      await adminLog(ctx.who, "installed_version", { v });
      return { installed: v, newer: !v || versionCmp(VERSION, v) > 0 };
    }

    /* ---------- (10-12) security ---------- */
    case "securityData": {
      needSuper(ctx.role);
      const accs = adminAccounts();
      const accounts = await Promise.all(accs.map(async (a) => ({ name: a.name, role: a.role, twofa: !!(await get2fa(a.name)) })));
      const tg = (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map((x) => x.trim()).filter(Boolean).length;
      const snap = await db().ref("admin_logins").orderByKey().limitToLast(100).get();
      const logins: any[] = [];
      snap.forEach((c) => { const v = c.val() || {}; logins.push({ id: c.key, at: v.at, name: v.name, role: v.role, ok: !!v.ok, reason: v.reason || "", ip: v.ip, where: v.where, device: v.device, fresh: !!v.fresh }); });
      return { accounts, telegramAdmins: tg, logins: logins.reverse(), me: ctx.who, meIsAccount: accs.some((a) => a.name === ctx.who) };
    }
    case "twofaStart": {
      needSuper(ctx.role);
      if (!adminAccounts().some((a) => a.name === ctx.who)) throw new HttpError(400, "2-step login only applies to password accounts (you signed in through Telegram)");
      if (await get2fa(ctx.who)) throw new HttpError(400, "2-step login is already on. Disable it first to re-enrol.");
      const secret = newTotpSecret();
      await set2faPending(ctx.who, secret);
      return { secret, url: otpauthUrl(ctx.who, secret) };
    }
    case "twofaConfirm": {
      needSuper(ctx.role);
      await rateLimit("adm_" + ctx.who.replace(/[^\w]/g, "_"), "admin-2fa-setup", 8);
      const pending = await get2faPending(ctx.who);
      if (!pending) throw new HttpError(400, "Start the set-up first");
      if (!totpVerify(pending, String(b.code || ""))) throw new HttpError(400, "That code is wrong. Check your phone's clock and try again.");
      await set2fa(ctx.who, pending);
      await set2faPending(ctx.who, null);
      await adminLog(ctx.who, "2fa_enabled", {});
      return {};
    }
    case "twofaDisable": {
      needSuper(ctx.role);
      await rateLimit("adm_" + ctx.who.replace(/[^\w]/g, "_"), "admin-2fa-setup", 8);
      const secret = await get2fa(ctx.who);
      if (!secret) throw new HttpError(400, "2-step login is not on");
      if (!totpVerify(secret, String(b.code || ""))) throw new HttpError(400, "That code is wrong");
      await set2fa(ctx.who, null);
      await set2faPending(ctx.who, null);
      await adminLog(ctx.who, "2fa_disabled", {});
      return {};
    }

    /* ---------- (13) rate-limit dashboard ---------- */
    case "rlStats": {
      needSuper(ctx.role);
      const days: string[] = [];
      for (let i = 0; i < 7; i++) days.push(dayKey(Date.now() - i * 86400000));
      const snaps = await Promise.all(days.map((d) => db().ref(`stats/rl_blocked/${d}`).get()));
      const byKey: Record<string, { key: string; uid: string; action: string; n: number }> = {};
      const perDay = days.map((d, i) => {
        let total = 0;
        const v = (snaps[i].val() || {}) as Record<string, number>;
        for (const [k, n] of Object.entries(v)) {
          const c = Number(n) || 0;
          total += c;
          const at = k.lastIndexOf("~");
          const e = (byKey[k] ||= { key: k, uid: at < 0 ? k : k.slice(0, at), action: at < 0 ? "" : k.slice(at + 1), n: 0 });
          e.n += c;
        }
        return { day: d, total };
      });
      return { days: perDay.reverse(), top: Object.values(byKey).sort((a, c) => c.n - a.n).slice(0, 25) };
    }
    default:
      return undefined;
  }
};
export default mod;

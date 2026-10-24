import type { AdminMod } from "./types";
import { db } from "../firebase";
import { adminLog } from "../log";
import { HttpError } from "../auth";
import { getSettings } from "../settings";
import { getCfg2, setCfg2, SECTIONS } from "../cfg2";
import { campaignStats } from "../growth2";
import { sharedIpGroups } from "../geo";
import { lifetimeEarn } from "../retention";

const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);

/** Admin → Growth & Games: v18 options (cfg2), campaigns, flagged accounts, shared IPs */
const mod: AdminMod = async (action, b, ctx) => {
  if (!action.startsWith("growth")) return undefined;
  if (ctx.role !== "super") throw new HttpError(403, "Only the Super admin can do this");
  switch (action) {
    case "growthData": {
      const s = await getSettings();
      const cfg = await getCfg2(true);
      const [campaigns, ips] = await Promise.all([campaignStats(s).catch(() => []), sharedIpGroups().catch(() => [])]);
      let flagged: { id: string; name: string; at: number; score: number }[] = [];
      try {
        const v = ((await db().ref("users").orderByChild("bot_flagged").startAt(1).limitToFirst(50).get()).val() || {}) as Record<string, any>;
        flagged = Object.entries(v).map(([id, u]) => ({ id, name: u.name || "", at: u.bot_flagged, score: u.bot_score || 0 }));
      } catch {}
      return { cfg, campaigns, ips, flagged, hasLink: !!s.referral_link };
    }
    case "growthSave": {
      const sec = String(b.section || "");
      if (!Object.prototype.hasOwnProperty.call(SECTIONS, sec)) throw new HttpError(400, "Unknown section");
      let v = b.value;
      if (typeof v === "string") { try { v = JSON.parse(v); } catch { throw new HttpError(400, "Not valid JSON"); } }
      try { await setCfg2(sec as any, v); } catch (e: any) { throw new HttpError(400, clean(e?.message, 120) || "Invalid value"); }
      await adminLog(ctx.who, "cfg2_save", { section: sec });
      return { cfg: await getCfg2(true) };
    }
    case "growthCampaignSave": {
      const tag = String(b.tag || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
      if (tag.length < 2) throw new HttpError(400, "Tag must be 2–20 letters/digits");
      await db().ref(`campaign_meta/${tag}`).update({ name: clean(b.name, 40) || tag, created_at: Date.now() });
      await adminLog(ctx.who, "campaign_save", { tag });
      return { campaigns: await campaignStats(await getSettings()) };
    }
    case "growthCampaignDelete": {
      const tag = String(b.tag || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
      if (!tag) throw new HttpError(400, "bad_request");
      await db().ref(`campaign_meta/${tag}`).remove();
      await adminLog(ctx.who, "campaign_delete", { tag });
      return { campaigns: await campaignStats(await getSettings()) };
    }
    case "growthBotClear": {
      const uid = String(b.uid || "");
      if (!/^\d{1,20}$/.test(uid)) throw new HttpError(400, "Invalid user id");
      await db().ref(`users/${uid}`).update({ bot_flagged: null, bot_score: 0 });
      await adminLog(ctx.who, "bot_clear", { uid });
      return {};
    }
    case "growthRisk": {
      const users = ((await db().ref("users").get()).val() || {}) as Record<string, any>;
      const prefs = ((await db().ref("user_prefs").get()).val() || {}) as Record<string, any>;
      const now = Date.now();
      const rows: { id: string; name: string; score: number; why: string[] }[] = [];
      for (const [id, u] of Object.entries(users)) {
        if (u.banned) continue;
        const why: string[] = [];
        let score = 0;
        const life = lifetimeEarn(u);
        const hrs = Math.max(1, (now - (u.created_at || now)) / 3600000);
        const rate = life / hrs;
        if (u.bot_flagged) { why.push("auto-tap flagged"); score += 3; }
        if ((prefs[id]?.ip_shared || 0) >= 3) { why.push(`IP shared with ${prefs[id].ip_shared} accounts`); score += 2; }
        if (hrs >= 6 && rate > Math.max(1, Number(b.rate) || 30000)) { why.push(`earns ${Math.round(rate).toLocaleString("en-US")} coins/hour`); score += 2; }
        if ((u.ref_count || 0) >= 5 && (u.ref_earned || 0) > 0 && life < (u.ref_earned || 0) * 2) { why.push("mostly referral income"); score += 1; }
        if (hrs < 48 && Object.keys(u.usdt_withdrawals || {}).length > 0) { why.push("withdrew within 2 days"); score += 1; }
        if (score >= 2) rows.push({ id, name: u.name || "", score, why });
      }
      rows.sort((x, y) => y.score - x.score);
      return { risk: rows.slice(0, 60), scanned: Object.keys(users).length };
    }
    default: return undefined;
  }
};
export default mod;

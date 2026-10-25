import type { AdminMod } from "./types";
import { db } from "../firebase";
import { adminLog } from "../log";
import { HttpError } from "../auth";
import { getSettings } from "../settings";
import { getCfg2, setCfg2, SECTIONS } from "../cfg2";
import { campaignStats } from "../growth2";
import { sharedIpGroups } from "../geo";
import { scanRisk, riskClear } from "../risk";
import { abStats } from "../abtest";
import { adsAdminList, adsApprove, adsReject, adsFinish } from "../ads";
import { fromU } from "../market";
import { tourAdminList, tourSave, tourCancel } from "../mini";
import { creatorList, creatorSet, plateClear } from "../eng";

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
    case "growthRisk": { const r = await scanRisk(Number(b.rate) || 30000); return { risk: r.rows.slice(0, 60), scanned: r.scanned, auto: ((await db().ref("risk_auto").get()).val() || {}) }; }
    case "growthRiskClear": { const uid = String(b.uid || ""); if (!/^\d{1,20}$/.test(uid)) throw new HttpError(400, "Invalid user id"); await riskClear(uid); await adminLog(ctx.who, "risk_clear", { uid }); return {}; }
    case "growthAb": return await abStats();
    case "growthTours": return { tours: await tourAdminList() };
    case "growthTourSave": { const id = await tourSave(b); await adminLog(ctx.who, "tour_save", { id }); return { tours: await tourAdminList() }; }
    case "growthTourCancel": { const id = String(b.id || ""); if (!/^[\w-]{3,40}$/.test(id)) throw new HttpError(400, "bad_request"); await tourCancel(id); await adminLog(ctx.who, "tour_cancel", { id }); return { tours: await tourAdminList() }; }
    case "growthAds": return await adsAdminList();
    case "growthAdApprove": { const id = String(b.id || ""); await adsApprove(id, ctx.who); await adminLog(ctx.who, "ad_approve", { id }); return await adsAdminList(); }
    case "growthAdReject": { const id = String(b.id || ""); await adsReject(id, clean(b.note, 120), ctx.who); await adminLog(ctx.who, "ad_reject", { id }); return await adsAdminList(); }
    case "growthAdStop": { const id = String(b.id || ""); await adsFinish(id, true, ctx.who); await adminLog(ctx.who, "ad_stop", { id }); return await adsAdminList(); }
    case "growthCreators": return { list: await creatorList() };
    case "growthCreatorSet": {
      const uid = String(b.uid || "");
      if (!/^\d{1,20}$/.test(uid)) throw new HttpError(400, "Invalid user id");
      const st = String(b.status || "");
      if (!["approved", "rejected", "revoked"].includes(st)) throw new HttpError(400, "bad_request");
      await creatorSet(uid, st as any, clean(b.note, 100));
      await adminLog(ctx.who, "creator_" + st, { uid });
      return { list: await creatorList() };
    }
    case "growthPlateClear": {
      const uid = String(b.uid || "");
      if (!/^\d{1,20}$/.test(uid)) throw new HttpError(400, "Invalid user id");
      await plateClear(uid);
      await adminLog(ctx.who, "plate_clear", { uid });
      return {};
    }
    case "growthRevenue": {
      const s = await getSettings();
      const [ads, orders, fees] = await Promise.all([db().ref("stats/ads_day").get(), db().ref("shop_orders").get(), db().ref("stats/send_fees").get()]);
      const adsDay = (ads.val() || {}) as Record<string, number>;
      const days: { day: string; ads: number }[] = [];
      for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); days.push({ day: d, ads: fromU(Number(adsDay[d]) || 0) }); }
      const shopFee = Object.values((orders.val() || {}) as Record<string, any>).reduce((a: number, o: any) => a + (o.status === "paid" ? Number(o.fee_u) || 0 : 0), 0);
      return {
        days,
        ads30: days.reduce((a, d) => a + d.ads, 0),
        adsAll: fromU(Object.values(adsDay).reduce((a, v) => a + (Number(v) || 0), 0)),
        shopFees: fromU(shopFee),
        sendFeesTfuel: (Number(fees.val()) || 0) / (s.coins_per_tfuel || 1000),
      };
    }
    default: return undefined;
  }
};
export default mod;

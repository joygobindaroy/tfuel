import crypto from "crypto";
import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2 } from "./cfg2";
import { getRefCode, resolveRef } from "./refcode";
import { getSettings } from "./settings";
import { sortableId } from "./crypto";
import { dayKey } from "./log";

const val = async (p: string) => (await db().ref(p).get()).val();
const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, n);
export interface Merchant { name: string; on: boolean; amt: number; asset: "tfuel" | "usdt" }

export async function merchantGet(uid: string): Promise<Merchant | null> {
  const m = await val(`merchants/${uid}`);
  return m ? { name: String(m.name || ""), on: !!m.on, amt: Number(m.amt) || 0, asset: m.asset === "usdt" ? "usdt" : "tfuel" } : null;
}
export async function merchantSet(uid: string, b: any): Promise<Merchant> {
  if (!(await getCfg2()).v24.merchant) throw new HttpError(403, "feature_off:Merchant QR is turned off.");
  const name = clean(b?.name, 30);
  if (name.length < 2) throw new HttpError(400, "Enter your shop name (2 or more letters).");
  const asset = b?.asset === "usdt" ? "usdt" : "tfuel";
  const amt = Math.max(0, Math.min(1e9, Math.round(Number(b?.amt || 0) * 1e6) / 1e6)) || 0;
  const m: Merchant = { name, on: !!b?.on, amt, asset };
  await db().ref(`merchants/${uid}`).update({ ...m, at: Date.now() });
  return m;
}
/** What a customer sees after scanning */
export async function merchantPub(code: string) {
  if (!/^[A-Za-z0-9]{10}$/.test(code)) throw new HttpError(400, "bad_code");
  const uid = await resolveRef(code);
  const m = uid ? await merchantGet(uid) : null;
  if (!uid || !m || !m.on || !(await getCfg2()).v24.merchant) throw new HttpError(404, "This shop isn't accepting payments right now.");
  const cat = await (await import("./v30")).catalogPub(code);
  return { name: m.name, amt: m.amt, asset: m.asset, items: cat.items, coupons: cat.coupons };
}
export async function merchantLink(uid: string) {
  const base = (await getSettings()).referral_link;
  return base ? `${base.replace(/\?.*$/, "")}?startapp=mer_${await getRefCode(uid)}` : "";
}
/** Signed picture of the shop's payment poster; the look (dark, light, neon, gold) is added by the app */
export function merchantPosterUrl(name: string, link: string) {
  const n = clean(name, 30);
  const s = crypto.createHmac("sha256", crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex")).update(`sq|${n}|${link}`).digest("hex").slice(0, 20);
  return link && n ? `/api/shopqr?n=${encodeURIComponent(n)}&d=${encodeURIComponent(link)}&s=${s}` : "";
}
/** Called after every completed transfer: if the receiver is an open merchant, record a sale */
export async function merchantSale(toUid: string, fromName: string, asset: "tfuel" | "usdt", amount: number, txid: string, note: string, fromUid = "") {
  const m = await val(`merchants/${toUid}/on`);
  if (!m) return;
  const day = dayKey();
  const cpn = await import("./v30").then((M) => M.cpnApplied(toUid, note)).catch(() => "");
  const sid = sortableId();
  const shop = String((await val(`merchants/${toUid}/name`)) || "Shop");
  await db().ref().update({
    ...(fromUid ? { [`user_purchases/${fromUid}/${sid}`]: { at: Date.now(), a: asset, amt: amount, s: clean(shop, 30), n: clean(note, 40), tx: txid } } : {}),
    [`merchant_sales/${toUid}/${sid}`]: { at: Date.now(), a: asset, amt: amount, who: clean(fromName, 20).replace(/^(.).*$/, (s) => s.slice(0, 1) + "***" + (s.length > 4 ? s.slice(-1) : "")), tx: txid, n: clean(note, 40), ...(fromUid ? { fu: fromUid } : {}), ...(cpn ? { cpn } : {}) },
    [`merchant_tot/${toUid}/${day}/${asset}`]: ServerValue.increment(amount),
    [`merchant_tot/${toUid}/${day}/n`]: ServerValue.increment(1),
    [`merchant_tot/${toUid}/all/${asset}`]: ServerValue.increment(amount),
    [`merchant_tot/${toUid}/all/n`]: ServerValue.increment(1),
  });
}
export async function merchantSales(uid: string) {
  let rows: any[] = [];
  const strip = (o: Record<string, any>) => Object.entries(o).map(([id, x]) => ({ id, ...x, refundable: !!x.fu && !x.rf && Date.now() - x.at < 30 * 864e5, fu: undefined }));
  try { rows = strip(((await db().ref(`merchant_sales/${uid}`).orderByKey().limitToLast(50).get()).val() || {}) as Record<string, any>); }
  catch { rows = strip(((await val(`merchant_sales/${uid}`)) || {}) as Record<string, any>); }
  const t = ((await val(`merchant_tot/${uid}`)) || {}) as any;
  const pick = (x: any) => ({ tfuel: Number(x?.tfuel) || 0, usdt: Number(x?.usdt) || 0, n: Number(x?.n) || 0 });
  return { today: pick(t[dayKey()]), all: pick(t.all), list: rows.sort((a, b) => b.at - a.at).slice(0, 30) };
}

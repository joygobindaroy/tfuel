import crypto from "crypto";
import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { open } from "./secretbox";
import { rateLimit } from "./api";
import { sha256, sortableId, randomToken } from "./crypto";
import { getSettings, Settings } from "./settings";
import { getPrice, toU, fromU } from "./market";
import { spend, usdtTot, activity } from "./wallet";
import { notify } from "./notify";
import { adminLog } from "./log";
import { mailMoney } from "./moneymail";
import type { UserRecord } from "./user";

export interface Shop {
  name: string;
  domain: string; // https://shop.example.com
  login_url: string; // user লগইন হয়ে এখানে ?code=… সহ আসে
  webhook?: string; // পেমেন্ট হলে খবর (ঐচ্ছিক)
  secret: string; // sealed
  enabled: boolean;
  fee_pct: number;
  allow_tfuel: boolean;
  allow_usdt: boolean;
  max_usd: number;
  created_at: number;
}
export interface Order {
  shop: string;
  ref: string;
  usd_u: number;
  title: string;
  uid?: string; // শুধু এই user দিতে পারবে (থাকলে)
  status: "open" | "paying" | "paid" | "refunded" | "expired";
  created_at: number;
  exp: number;
  return_url?: string;
  paid_by?: string;
  paid_at?: number;
  cur?: "tfuel" | "usdt";
  coins?: number;
  usdt_u?: number;
  fee_u?: number;
  webhook_ok?: boolean;
}

export const ORDER_TTL_MS = 30 * 60000;
const SKEW_MS = 5 * 60000;

export const sign = (secret: string, ts: string, body: string) => crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");

export async function rawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > 20000) throw new HttpError(413, "too_large");
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** shop-এর সই-করা server-to-server request যাচাই (বডি parse বন্ধ থাকতে হবে) */
export async function shopAuth(req: NextApiRequest): Promise<{ id: string; shop: Shop; body: any; s: Settings }> {
  if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
  const id = String(req.headers["x-shop-id"] || "");
  const ts = String(req.headers["x-timestamp"] || "");
  const sig = String(req.headers["x-signature"] || "");
  if (!/^[\w-]{1,40}$/.test(id) || !/^\d{10,14}$/.test(ts) || !/^[0-9a-f]{64}$/.test(sig)) throw new HttpError(401, "bad_signature");
  const s = await getSettings();
  const shop = (await db().ref(`shops/${id}`).get()).val() as Shop | null;
  if (!shop || !shop.enabled || !s.shops_enabled) throw new HttpError(403, "shop_unavailable");
  if (Math.abs(Date.now() - Number(ts)) > SKEW_MS) throw new HttpError(401, "timestamp_skew");
  const raw = await rawBody(req);
  const secret = open(shop.secret);
  if (!secret) throw new HttpError(500, "server_error");
  const exp = Buffer.from(sign(secret, ts, raw), "hex");
  const got = Buffer.from(sig, "hex");
  if (exp.length !== got.length || !crypto.timingSafeEqual(exp, got)) throw new HttpError(401, "bad_signature");
  await rateLimit("shop_" + id, "api", 120);
  let body: any = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { throw new HttpError(400, "bad_json"); }
  return { id, shop, body, s };
}

export function wrapShop(handler: (a: { id: string; shop: Shop; body: any; s: Settings }, res: NextApiResponse) => Promise<void>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      await handler(await shopAuth(req), res);
    } catch (e: any) {
      if (e instanceof HttpError) return void res.status(e.status).json({ success: false, error: e.message });
      console.error("shop api", e);
      res.status(500).json({ success: false, error: "server_error" });
    }
  };
}

/** user লগইন কোড (৬০ সেকেন্ড, একবার) */
export async function makeLoginCode(uid: string, shopId: string): Promise<string> {
  const code = randomToken();
  await db().ref(`shop_codes/${sha256(code)}`).set({ uid, shop: shopId, exp: Date.now() + 60000 });
  return code;
}
export async function useLoginCode(code: string, shopId: string): Promise<string> {
  const key = `shop_codes/${sha256(code)}`;
  let uid = "";
  const r = await db().ref(key).transaction((c: any) => {
    uid = "";
    if (!c || c.shop !== shopId || c.exp < Date.now()) return;
    uid = c.uid;
    return null; // একবারই
  });
  if (!r.committed || !uid) throw new HttpError(400, "bad_code");
  return uid;
}

export function quoteFor(o: Order, price: number | null, cpt: number) {
  const usd = fromU(o.usd_u);
  return { usd, usdt: usd, tfuel_coins: price ? Math.ceil((usd / price) * cpt) : null };
}

/** user পেমেন্ট করে: কয়েন/USDT কাটে → order paid → shop-কে webhook */
export async function payOrder(uid: string, name: string, orderId: string, cur: "tfuel" | "usdt"): Promise<{ order: Order; amount: number }> {
  const s = await getSettings(true);
  if (!s.shops_enabled) throw new HttpError(403, "shop_unavailable");
  const oref = db().ref(`shop_orders/${orderId}`);
  const o0 = (await oref.get()).val() as Order | null;
  if (!o0) throw new HttpError(404, "order_not_found");
  const shop = (await db().ref(`shops/${o0.shop}`).get()).val() as Shop | null;
  if (!shop || !shop.enabled) throw new HttpError(403, "shop_unavailable");
  if (cur === "tfuel" ? !shop.allow_tfuel : !shop.allow_usdt) throw new HttpError(400, "currency_off");
  if (o0.uid && o0.uid !== uid) throw new HttpError(403, "order_not_found");
  if (o0.status === "paid") throw new HttpError(409, "order_paid");
  if (o0.status !== "open" || o0.exp < Date.now()) throw new HttpError(410, "order_expired");

  let coins = 0, usdtU = 0;
  if (cur === "tfuel") {
    const p = await getPrice(s);
    if (!p || p.stale) throw new HttpError(503, "price_unavailable");
    coins = quoteFor(o0, p.price, s.coins_per_tfuel).tfuel_coins!;
  } else usdtU = o0.usd_u;

  // 1) order-কে "paying" করে দখল (দুই জায়গা থেকে একসাথে দিলে একজনই)
  const claim = await oref.transaction((o: Order | null) => (o && o.status === "open" && o.exp >= Date.now() ? { ...o, status: "paying", paid_by: uid } : undefined));
  if (!claim.committed) throw new HttpError(409, "order_paid");
  // 2) টাকা কাটা
  let err = "";
  await db().ref(`users/${uid}`).transaction((cu: UserRecord | null) => {
    err = "";
    if (cu === null) { err = "insufficient"; return cu; }
    if (cur === "tfuel") {
      if ((cu.balance || 0) < coins) { err = "insufficient"; return; }
      cu.balance -= coins;
      spend(cu, "shop", coins);
    } else {
      if ((cu.usdt_u || 0) < usdtU) { err = "insufficient_usdt"; return; }
      cu.usdt_u = (cu.usdt_u || 0) - usdtU;
      usdtTot(cu, "shop", usdtU);
    }
    return cu;
  });
  if (err) {
    await oref.transaction((o: Order | null) => (o && o.status === "paying" ? { ...o, status: "open", paid_by: null } : undefined));
    throw new HttpError(409, err);
  }
  // 3) paid
  const fee_u = Math.floor((o0.usd_u * (shop.fee_pct || 0)) / 100);
  const now = Date.now();
  const paid = { ...o0, status: "paid" as const, paid_by: uid, paid_at: now, cur, coins, usdt_u: usdtU, fee_u };
  await db().ref().update({
    [`shop_orders/${orderId}`]: paid,
    [`user_shop/${uid}/${orderId}`]: { shop: o0.shop, shop_name: shop.name, title: o0.title, usd_u: o0.usd_u, cur, coins, usdt_u: usdtU, status: "paid", at: now },
    [`shop_links/${uid}/${o0.shop}`]: { at: now },
  }).catch((e) => console.error("SHOP ORDER WRITE FAILED after debit", orderId, uid, e));
  await activity(uid, "shop", { coins: -coins, usdt_u: -usdtU, note: shop.name });
  await mailMoney(uid, "shop", [["Shop", shop.name], ["Order", o0.title || orderId], ["Paid", cur === "usdt" ? `${fromU(usdtU).toFixed(2)} USDT` : `${coins} coins`]]);
  await notify(uid, `🛍 Paid ${cur === "usdt" ? fromU(usdtU).toFixed(2) + " USDT" : coins + " coins"} to ${shop.name}${o0.title ? " — " + o0.title : ""}.`);
  sendWebhook(o0.shop, shop, orderId, paid, uid).catch(() => {});
  return { order: paid, amount: cur === "usdt" ? fromU(usdtU) : coins };
}

export async function sendWebhook(shopId: string, shop: Shop, orderId: string, o: Order, uid: string) {
  if (!shop.webhook) return;
  const secret = open(shop.secret);
  if (!secret) return;
  const body = JSON.stringify({ event: o.status === "refunded" ? "order.refunded" : "order.paid", order_id: orderId, ref: o.ref, status: o.status, usd: fromU(o.usd_u), currency: o.cur, paid_usdt: o.cur === "usdt" ? fromU(o.usdt_u || 0) : undefined, paid_coins: o.cur === "tfuel" ? o.coins : undefined, user_id: uid });
  const ts = String(Date.now());
  let ok = false;
  try {
    const r = await fetch(shop.webhook, { method: "POST", headers: { "content-type": "application/json", "x-shop-id": shopId, "x-timestamp": ts, "x-signature": sign(secret, ts, body) }, body, signal: AbortSignal.timeout(6000) });
    ok = r.ok;
  } catch {}
  await db().ref().update({ [`shop_orders/${orderId}/webhook_ok`]: ok, [`shop_orders/${orderId}/webhook_at`]: Date.now() }).catch(() => {});
  await db().ref(`shop_orders/${orderId}/webhook_tries`).transaction((c: number | null) => (c || 0) + 1).catch(() => {});
}

/** Re-send one webhook (admin button or automatic retry). Returns whether the shop answered 2xx. */
export async function retryHook(orderId: string): Promise<boolean> {
  const o = (await db().ref(`shop_orders/${orderId}`).get()).val() as Order | null;
  if (!o || (o.status !== "paid" && o.status !== "refunded")) throw new HttpError(409, "not_paid");
  const shop = (await db().ref(`shops/${o.shop}`).get()).val() as Shop | null;
  if (!shop || !shop.webhook) throw new HttpError(400, "No webhook URL set for this shop");
  await sendWebhook(o.shop, shop, orderId, o, o.paid_by || "");
  return !!(await db().ref(`shop_orders/${orderId}/webhook_ok`).get()).val();
}
/** cron: retry failed webhooks of the last 24 h (up to 6 tries, spaced out) */
export async function retryFailedHooks(): Promise<number> {
  const all = ((await db().ref("shop_orders").orderByChild("created_at").limitToLast(200).get().catch(async () => await db().ref("shop_orders").get())).val() || {}) as Record<string, any>;
  let n = 0;
  for (const [id, o] of Object.entries(all)) {
    if (o.webhook_ok !== false || (o.status !== "paid" && o.status !== "refunded")) continue;
    const tries = Number(o.webhook_tries) || 0;
    if (tries >= 6 || Date.now() - (o.paid_at || o.created_at || 0) > 86400000) continue;
    if (Date.now() - (o.webhook_at || 0) < Math.min(3600000, 120000 * 2 ** tries)) continue;
    try { if (await retryHook(id)) n++; } catch {}
  }
  return n;
}

/** পূর্ণ refund (একবারই): যেই currency-তে দিয়েছিল সেটাই ফেরত */
export async function refundOrder(orderId: string, by: string): Promise<Order> {
  const oref = db().ref(`shop_orders/${orderId}`);
  let o: Order | null = null;
  const r = await oref.transaction((x: Order | null) => {
    o = null;
    if (!x || x.status !== "paid") return;
    o = { ...x };
    return { ...x, status: "refunded" };
  });
  if (!r.committed || !o) throw new HttpError(409, "not_refundable");
  const ord = o as Order;
  const uid = ord.paid_by!;
  await db().ref(`users/${uid}`).transaction((cu: UserRecord | null) => {
    if (cu === null) return cu;
    if (ord.cur === "tfuel") { cu.balance += ord.coins || 0; if (cu.spent) cu.spent.shop = Math.max(0, (cu.spent.shop || 0) - (ord.coins || 0)); }
    else { cu.usdt_u = (cu.usdt_u || 0) + (ord.usdt_u || 0); if (cu.usdt_tot) cu.usdt_tot.shop = (cu.usdt_tot.shop || 0) - (ord.usdt_u || 0); }
    return cu;
  });
  await db().ref(`user_shop/${uid}/${orderId}/status`).set("refunded").catch(() => {});
  await activity(uid, "shop_refund", { coins: ord.coins || 0, usdt_u: ord.usdt_u || 0, note: "Refund" });
  await mailMoney(uid, "shop_refund", [["Order", ord.title || orderId], ["Refunded", ord.cur === "tfuel" ? `${ord.coins || 0} coins` : `${fromU(ord.usdt_u || 0).toFixed(2)} USDT`]]);
  await notify(uid, `↩️ Refund received for your order${ord.title ? ` "${ord.title}"` : ""}.`);
  await adminLog(by, "shop_refund", { orderId, uid });
  const shop = (await db().ref(`shops/${ord.shop}`).get()).val() as Shop | null;
  if (shop) sendWebhook(ord.shop, shop, orderId, { ...ord, status: "refunded" }, uid).catch(() => {});
  return { ...ord, status: "refunded" };
}

export const newOrderId = () => sortableId() + randomToken().slice(0, 8);
export { toU };


/** Creates (or returns the same) order for a shop reference. Used by the signed server API and by the public pay button. */
export async function createShopOrder(id: string, shop: Shop, s: Settings, a: { ref: string; usd: number; title: string; uid?: string; ret?: string }) {
  const { ref, usd, uid } = a;
  const title = String(a.title || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80);
  const ret = String(a.ret || "");
  if (!/^[\w.-]{1,64}$/.test(ref)) throw new HttpError(400, "bad_ref");
  if (!Number.isFinite(usd) || usd < 0.01 || usd > shop.max_usd) throw new HttpError(400, "bad_amount");
  if (uid !== undefined && !/^\d{1,20}$/.test(uid)) throw new HttpError(400, "bad_user");
  if (ret && !ret.startsWith(shop.domain + "/") && ret !== shop.domain) throw new HttpError(400, "bad_return_url");
  if (!s.referral_link) throw new HttpError(503, "app_link_not_set");
  if (uid && !(await db().ref(`shop_links/${uid}/${id}`).get()).exists()) throw new HttpError(403, "not_connected");
  const now = Date.now();
  const oid = newOrderId();
  const claim = await db().ref(`shop_orders_ref/${id}/${ref}`).transaction((c: any) => (c === null ? oid : undefined));
  const link = (x: string) => `${s.referral_link}?startapp=pay_${x}`;
  if (!claim.committed) {
    const orderId = String((await db().ref(`shop_orders_ref/${id}/${ref}`).get()).val());
    const ex = (await db().ref(`shop_orders/${orderId}`).get()).val() as Order | null;
    if (ex && Math.abs(ex.usd_u - toU(usd)) > 0) throw new HttpError(409, "ref_conflict");
    if (ex && ex.status === "open" && ex.exp < now) await db().ref(`shop_orders/${orderId}`).update({ exp: now + ORDER_TTL_MS });
    const cur = (await db().ref(`shop_orders/${orderId}`).get()).val() as Order;
    return { order_id: orderId, status: cur.status, pay_url: link(orderId), expires_at: cur.exp };
  }
  const o: Order = { shop: id, ref, usd_u: toU(usd), title, status: "open", created_at: now, exp: now + ORDER_TTL_MS, ...(uid ? { uid } : {}), ...(ret ? { return_url: ret } : {}) };
  await db().ref(`shop_orders/${oid}`).set(o);
  return { order_id: oid, status: "open" as const, pay_url: link(oid), expires_at: o.exp, usd: fromU(o.usd_u) };
}

/** Public (non-secret) key for the pay button; created on first use */
export async function shopPk(id: string): Promise<string> {
  const cur = (await db().ref(`shops/${id}/pk`).get()).val();
  if (typeof cur === "string" && cur) return cur;
  const pk = "pk_" + randomToken().slice(0, 20);
  await db().ref(`shops/${id}/pk`).set(pk);
  await db().ref(`shop_pk/${pk}`).set(id);
  return pk;
}

/** Admin: checklist so a broken connection is easy to find */
export async function shopTest(id: string): Promise<{ ok: boolean; checks: { name: string; ok: boolean; note: string }[] }> {
  const s = await getSettings(true);
  const shop = (await db().ref(`shops/${id}`).get()).val() as Shop | null;
  if (!shop) throw new HttpError(404, "Shop not found");
  const checks: { name: string; ok: boolean; note: string }[] = [];
  const add = (name: string, ok: boolean, note: string) => checks.push({ name, ok, note });
  add("Shop payments switched on", s.shops_enabled && shop.enabled, s.shops_enabled ? (shop.enabled ? "On" : "This shop is switched off") : "The master switch (Enable shop payments) is off");
  add("Bot link set", !!s.referral_link, s.referral_link ? s.referral_link : "Set Settings → Referral link (https://t.me/yourbot/app). Payment links open the Mini App through it.");
  add("Currencies", shop.allow_tfuel || shop.allow_usdt, [shop.allow_tfuel ? "TFUEL" : "", shop.allow_usdt ? "USDT" : ""].filter(Boolean).join(" + ") || "None allowed");
  const probe = async (name: string, url: string, init?: RequestInit) => {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(6000), redirect: "manual" });
      add(name, r.status < 500, `HTTP ${r.status}`);
    } catch (e: any) { add(name, false, "Not reachable: " + String(e?.message || e).slice(0, 80)); }
  };
  await probe("Shop website", shop.domain);
  await probe("Login page", shop.login_url + (shop.login_url.includes("?") ? "&" : "?") + "code=test");
  if (shop.webhook) {
    const secret = open(shop.secret);
    const body = JSON.stringify({ event: "ping", shop: id, at: Date.now() });
    const ts = String(Date.now());
    await probe("Webhook (signed ping)", shop.webhook, { method: "POST", headers: { "content-type": "application/json", "x-shop-id": id, "x-timestamp": ts, "x-signature": sign(secret || "", ts, body) }, body });
  } else add("Webhook", true, "Not set (optional). Without it, check paid orders in Admin → Shops → Orders.");
  return { ok: checks.every((c) => c.ok), checks };
}

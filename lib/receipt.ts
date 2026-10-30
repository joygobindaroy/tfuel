import crypto from "crypto";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getSettings } from "./settings";
import { tgCall } from "./telegram";
import { appBase } from "./mailtpl";
import { rcptStyleOf } from "./styles";
import { getRefCode } from "./refcode";
import { amtStr, displayName, maskName, Asset } from "./transfer";

/** Receipts for user-to-user transfers: a signed page (print / save as PDF), a signed PNG, an email button and an automatic bot message. */
const key = () => crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex");
const hmac = (s: string) => crypto.createHmac("sha256", key()).update(s).digest("hex").slice(0, 20);

export interface RView { txid: string; at: number; asset: Asset; amount: number; fee: number; dir: "out" | "in" | "wd" | "dep"; other: string; otherCode: string; note: string; held: boolean; amtText?: string; st?: string; feeText?: string; netText?: string; created?: number }

/** the receipt as one party sees it; the other party's name is masked for the receiver */
export async function loadReceipt(txid: string, uid: string): Promise<RView> {
  if (/^WD[UT]-[-_A-Za-z0-9]{6,40}$/.test(String(txid || ""))) return loadWithdrawReceipt(String(txid), uid);
  if (/^DEP-[-_A-Za-z0-9]{6,40}$/.test(String(txid || ""))) return loadDepositReceipt(String(txid), uid);
  const tid = String(txid || "").toUpperCase();
  if (!/^TF[0-9A-F]{40}$/.test(tid)) throw new HttpError(400, "bad_request");
  const id = (await db().ref(`transfer_tx/${tid}`).get()).val();
  let t: any = id ? (await db().ref(`transfers/${id}`).get()).val() : null;
  let held = false;
  if (!t) {
    // a held (not yet released) transfer is not in transfer_tx yet: find it through the sender's index
    const idx = ((await db().ref(`user_xfers/${uid}`).get()).val() || {}) as Record<string, any>;
    const hit = Object.entries(idx).find(([, r]: any) => r.tx === tid);
    const h = hit ? (await db().ref(`xfer_hold/${hit[0]}`).get()).val() : null;
    if (h && h.st === "held") { t = { from: h.from, to: h.to, asset: h.asset, amount: h.amount, fee: h.fee, note: h.note, at: h.at }; held = true; }
  }
  if (!t || (t.from !== uid && t.to !== uid)) throw new HttpError(404, "not_found");
  const out = t.from === uid;
  const peer = out ? t.to : t.from;
  const nm = await displayName(peer);
  return { txid: tid, at: t.at, asset: t.asset || "tfuel", amount: t.amount, fee: out ? t.fee : 0, dir: out ? "out" : "in", other: out ? nm : maskName(nm), otherCode: await getRefCode(peer).catch(() => ""), note: String(t.note || ""), held };
}

/** Withdrawal receipt: txid = "WDU-<id>" (USDT) or "WDT-<id>" (TFUEL). Only the owner can load it. */
export async function loadWithdrawReceipt(txid: string, uid: string): Promise<RView> {
  const usdt = txid.startsWith("WDU-");
  const id = txid.slice(4);
  const w = ((await db().ref(`${usdt ? "usdt_withdrawals" : "withdrawals"}/${id}`).get()).val() || null) as any;
  if (!w || String(w.uid) !== uid) throw new HttpError(404, "not_found");
  const cpt = (await getSettings()).coins_per_tfuel || 1000;
  const addr = String(w.address || w.account || "");
  const masked = addr.length > 14 ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : addr;
  const amtText = usdt ? `${w.amount} USDT` : `${Math.round((Number(w.amount) / cpt) * 1000) / 1000} TFUEL`;
  const fee = usdt && w.receive ? Math.max(0, Math.round((Number(w.amount) - Number(w.receive)) * 100) / 100) : 0;
  return { txid, at: Number(w.handled_at || w.created_at) || Date.now(), asset: usdt ? "usdt" : "tfuel", amount: Number(w.amount) || 0, fee: 0, dir: "wd", other: `${w.network_name || w.method || "Wallet"}${masked ? " " + masked : ""}`.slice(0, 44), otherCode: "", note: "", held: false, amtText, st: String(w.status || "pending"), feeText: fee ? `${fee} USDT` : "", netText: usdt && w.receive ? `${w.receive} USDT` : amtText, created: Number(w.created_at) || 0 };
}

/** Deposit receipt: txid = "DEP-<id>" */
export async function loadDepositReceipt(txid: string, uid: string): Promise<RView> {
  const id = txid.slice(4);
  const w = ((await db().ref(`deposits/${id}`).get()).val() || null) as any;
  if (!w || String(w.uid) !== uid) throw new HttpError(404, "not_found");
  const approved = w.status === "approved";
  const amt = approved ? Number(w.credited ?? w.amount) : Number(w.amount);
  const tx = String(w.txid || "");
  return { txid, at: Number(w.handled_at || w.created_at) || Date.now(), asset: "usdt", amount: amt || 0, fee: 0, dir: "dep", other: `${w.network_name || w.network || "Deposit"}${tx ? " " + tx.slice(0, 6) + "..." + tx.slice(-6) : ""}`.slice(0, 44), otherCode: "", note: "", held: false, amtText: `${amt} USDT`, st: approved ? "paid" : String(w.status || "pending"), netText: `${amt} USDT`, created: Number(w.created_at) || 0 };
}

export const pageSig = (txid: string, uid: string) => hmac(`r|${txid}|${uid}`);
export function receiptLinks(r: RView, uid: string, cpt: number, base = appBase(), style = "b", y1 = false) {
  const page = `${base}/receipt?t=${r.txid}&u=${encodeURIComponent(uid)}&s=${pageSig(r.txid, uid)}${style !== "b" || y1 ? `&y=${style}` : ""}`;
  const d = Buffer.from(JSON.stringify({ t: r.txid, at: r.at, v: r.dir === "wd" ? "wd" : r.dir, a: r.amtText || amtStr(r.asset, r.amount, cpt), s: r.st || "", c0: r.created || 0, x: r.netText || "", fe: r.feeText || "", f: r.fee ? amtStr(r.asset, r.fee, cpt) : "", o: r.other, c: r.otherCode, n: r.note, h: r.held ? 1 : 0 })).toString("base64url");
  const img = `${base}/api/receipt-img?d=${d}&s=${hmac("i|" + d)}&y=${style}`;
  return { page, img };
}

/** Sends the receipt picture + "Open receipt" button to the user's bot chat. Skips when the user turned money messages off. */
export async function botReceipt(uid: string, r: RView, cpt: number, force = false): Promise<boolean> {
  try {
    const s = await getSettings();
    if (!force) {
      if (!s.notify_enabled) return false;
      if ((await db().ref(`users/${uid}/notify_off`).get()).val()) return false;
      const pr = ((await db().ref(`user_prefs/${uid}`).get()).val() || {}) as any;
      if (pr.notif && pr.notif.money === false) return false;
    }
    const { page, img } = receiptLinks(r, uid, cpt, appBase(), await rcptStyleOf(uid));
    if (!/^https:\/\//.test(page)) return false;
    const caption = r.dir === "dep" ? `🧾 Deposit receipt · ${r.amtText}\nVia: ${r.other}\nStatus: ${r.st}\nRef: ${r.txid}` : r.dir === "wd" ? `🧾 Withdrawal receipt · ${r.amtText}\nTo: ${r.other}\nStatus: ${r.st}\nRef: ${r.txid}` : `🧾 Receipt · ${r.dir === "out" ? "Sent" : "Received"} ${amtStr(r.asset, r.amount, cpt)}\n${r.dir === "out" ? "To" : "From"}: ${r.other}\nHash: ${r.txid}`;
    const kb = JSON.stringify({ inline_keyboard: [[{ text: "🖨 Print / Save as PDF", url: page }], [{ text: "⬇ Download image", url: img }]] });
    const p = await tgCall("sendPhoto", { chat_id: uid, photo: img, caption, reply_markup: kb });
    if (p.ok) return true;
    const m = await tgCall("sendMessage", { chat_id: uid, text: caption, reply_markup: kb, disable_web_page_preview: "true" });
    return !!m.ok;
  } catch { return false; }
}

export const stmtSig = (uid: string, month: string) => hmac(`st|${uid}|${month}`);
export const stmtUrl = (uid: string, month: string, base = appBase()) => `${base}/statement?u=${encodeURIComponent(uid)}&m=${month}&s=${stmtSig(uid, month)}`;

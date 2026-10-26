import crypto from "crypto";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getSettings } from "./settings";
import { tgCall } from "./telegram";
import { appBase } from "./mailtpl";
import { getRefCode } from "./refcode";
import { amtStr, displayName, maskName, Asset } from "./transfer";

/** Receipts for user-to-user transfers: a signed page (print / save as PDF), a signed PNG, an email button and an automatic bot message. */
const key = () => crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex");
const hmac = (s: string) => crypto.createHmac("sha256", key()).update(s).digest("hex").slice(0, 20);

export interface RView { txid: string; at: number; asset: Asset; amount: number; fee: number; dir: "out" | "in"; other: string; otherCode: string; note: string; held: boolean }

/** the receipt as one party sees it; the other party's name is masked for the receiver */
export async function loadReceipt(txid: string, uid: string): Promise<RView> {
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

export const pageSig = (txid: string, uid: string) => hmac(`r|${txid}|${uid}`);
export function receiptLinks(r: RView, uid: string, cpt: number, base = appBase()) {
  const page = `${base}/receipt?t=${r.txid}&u=${encodeURIComponent(uid)}&s=${pageSig(r.txid, uid)}`;
  const d = Buffer.from(JSON.stringify({ t: r.txid, at: r.at, v: r.dir, a: amtStr(r.asset, r.amount, cpt), f: r.fee ? amtStr(r.asset, r.fee, cpt) : "", o: r.other, c: r.otherCode, n: r.note, h: r.held ? 1 : 0 })).toString("base64url");
  const img = `${base}/api/receipt-img?d=${d}&s=${hmac("i|" + d)}`;
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
    const { page, img } = receiptLinks(r, uid, cpt);
    if (!/^https:\/\//.test(page)) return false;
    const caption = `🧾 Receipt · ${r.dir === "out" ? "Sent" : "Received"} ${amtStr(r.asset, r.amount, cpt)}\n${r.dir === "out" ? "To" : "From"}: ${r.other}\nHash: ${r.txid}`;
    const kb = JSON.stringify({ inline_keyboard: [[{ text: "🧾 Open / print receipt", url: page }]] });
    const p = await tgCall("sendPhoto", { chat_id: uid, photo: img, caption, reply_markup: kb });
    if (p.ok) return true;
    const m = await tgCall("sendMessage", { chat_id: uid, text: caption, reply_markup: kb, disable_web_page_preview: "true" });
    return !!m.ok;
  } catch { return false; }
}

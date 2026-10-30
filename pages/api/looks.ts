import { authenticate, HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { db } from "@/lib/firebase";
import { getSettings } from "@/lib/settings";
import { getRefCode } from "@/lib/refcode";
import { appBase } from "@/lib/mailtpl";
import { cardUrl, earnUrl } from "@/lib/cardsig";
import { CARD_STYLES, cardStyleOk } from "@/lib/cardkit";
import { RCPT_STYLES, rcptStyleOk } from "@/lib/rcptkit";
import { cardStyleOf, rcptStyleOf } from "@/lib/styles";
import { weekIndex } from "@/lib/wallet";
import crypto from "crypto";

/** "Looks": the person's own choice of card and receipt style + ready-to-share pictures */
const key = () => crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex");
const hmac20 = (s: string) => crypto.createHmac("sha256", key()).update(s).digest("hex").slice(0, 20);
function sampleReceipt(base: string, y: string) {
  const d = Buffer.from(JSON.stringify({ t: "WDU-sample0001", at: Date.now(), v: "wd", a: "25 USDT", s: "paid", c0: Date.now() - 540000, x: "24 USDT", fe: "1 USDT", f: "", o: "BEP20 0x12ab...9f3c", c: "", n: "", h: 0 })).toString("base64url");
  return `${base}/api/receipt-img?d=${d}&s=${hmac20("i|" + d)}&y=${y}`;
}

export default route(async (req, res) => {
  const user = authenticate(req);
  await rateLimit(user.id, "looks", 40);
  const b = req.body || {};
  const base = appBase();
  if (b.action === "set") {
    const up: Record<string, any> = {};
    if (b.card !== undefined) up[`user_prefs/${user.id}/card`] = cardStyleOk(b.card);
    if (b.rcpt !== undefined) up[`user_prefs/${user.id}/rcpt`] = rcptStyleOk(b.rcpt);
    if (!Object.keys(up).length) throw new HttpError(400, "bad_request");
    await db().ref().update(up);
  }
  const [card, rcpt, s, code, u] = await Promise.all([cardStyleOf(user.id), rcptStyleOf(user.id), getSettings(), getRefCode(user.id).catch(() => ""), db().ref(`users/${user.id}`).get()]);
  const name = String((u.val() || {}).name || "").replace(/[<>]/g, "").trim().slice(0, 20) || "a friend";
  const link = s.referral_enabled && s.referral_link && code ? `${s.referral_link}?startapp=${code}` : "";
  const https = /^https:\/\//.test(base);
  const wk = Number((await db().ref(`lb/w_${weekIndex()}/${user.id}`).get()).val()) || 0;
  const earned = `${(wk / (s.coins_per_tfuel || 1000)).toLocaleString("en-US", { maximumFractionDigits: 3 })} TFUEL`;
  res.json({
    success: true, card, rcpt,
    cards: CARD_STYLES.map((c) => ({ ...c, url: https && code ? cardUrl(base, code, name, c.id, link) : "" })),
    rcpts: RCPT_STYLES.map((r) => ({ ...r, url: https ? sampleReceipt(base, r.id) : "" })),
    share: { link, card: https && code ? cardUrl(base, code, name, card, link) : "", earn: https ? earnUrl(base, earned, "this week", name, card) : "", earned, text: s.invite_msg || "Join me on TFUEL — tap, earn and invite friends!" },
  });
});

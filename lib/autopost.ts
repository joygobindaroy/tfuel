import { db } from "./firebase";
import { getCfg2, PostRule } from "./cfg2";
import { getSettings, Settings } from "./settings";
import { tgCall } from "./telegram";
import { top, names } from "./leaderboard";
import { weekIndex } from "./wallet";
import { getPrice, getChart } from "./market";
import { cardUrl } from "./cardsig";
import { appBase } from "./mailtpl";
import { BRAND } from "./brand";

const dayIdx = (t = Date.now()) => Math.floor(t / 86400000);
const tf = (c: number, cpt: number) => (c / Math.max(1, cpt)).toLocaleString("en-US", { maximumFractionDigits: 2 });
const link = (s: Settings, p = "") => (s.referral_link ? (p ? `${s.referral_link}?startapp=${p}` : s.referral_link) : "");

export const POST_KINDS: Record<PostRule["kind"], string> = {
  price: "Price update",
  top: "Top earners of the week",
  invite: "Invite card (join banner)",
  tour: "Live tournament",
  custom: "My own message (rotates)",
};

/** Build and send one auto-post to the configured group / channel. Returns an error text or "" when sent. */
export async function sendPost(rule: PostRule, s: Settings): Promise<string> {
  if (!s.autopost_channel) return "Set the channel or group first";
  const cpt = s.coins_per_tfuel;
  let text = "";
  let photo = "";
  let btn = rule.btn || "🚀 Open app";
  let url = link(s);
  if (rule.kind === "price") {
    const p = await getPrice(s).catch(() => null);
    if (!p) return "Price is not available right now";
    const ch = await getChart("1d").then((c) => c.change).catch(() => null);
    const arrow = ch === null ? "" : ch >= 0 ? "▲" : "▼";
    text = `📈 TFUEL price\n\n$${p.price < 1 ? p.price.toFixed(5) : p.price.toFixed(3)} USDT${ch === null ? "" : `\n24h ${arrow} ${Math.abs(ch).toFixed(2)}%`}`;
    btn = rule.btn || "📈 Trade now";
    url = link(s, "go_trade");
  } else if (rule.kind === "top") {
    const rows = (await top(`w_${weekIndex()}`, 5)).filter((x) => x.v > 0);
    if (!rows.length) return "No earnings this week yet";
    const nm = await names(rows.map((x) => x.id));
    const medal = ["🥇", "🥈", "🥉", "4.", "5."];
    text = ["🔥 Top earners this week", "", ...rows.map((x, i) => `${medal[i]} ${nm[x.id]} — ${tf(x.v, cpt)} TFUEL`), "", "Your turn to climb 👇"].join("\n");
  } else if (rule.kind === "invite") {
    text = rule.text || s.invite_msg || "Tap · Earn · Withdraw real TFUEL. Join the squad 👇";
    if (rule.image !== false && /^https:\/\//.test(appBase())) photo = cardUrl(appBase(), "JOIN", BRAND.slice(0, 20));
  } else if (rule.kind === "tour") {
    const all = ((await db().ref("tournaments").get()).val() || {}) as Record<string, any>;
    const now = Date.now();
    const t = Object.values(all).filter((x: any) => !x.cancelled && !x.paid && x.start <= now && x.end > now).sort((a: any, b: any) => a.end - b.end)[0] as any;
    if (!t) return "No live tournament right now";
    const left = Math.max(1, Math.round((t.end - now) / 3600000));
    text = `🏆 ${t.title}\n\nFree entry · ${t.game === "memory" ? "Memory match" : "Crypto trivia"}\nPrizes: ${t.prizes.map((p: number, i: number) => `#${i + 1} ${p}`).join(" · ")} coins\nEnds in ~${left} h`;
    btn = rule.btn || "🎮 Join & play";
  } else {
    const parts = rule.text.split(/\n={3,}\n/).map((x) => x.trim()).filter(Boolean);
    if (!parts.length) return "Write the message first";
    const i = Number((await db().ref(`autopost_idx/${rule.id}`).get()).val()) || 0;
    await db().ref(`autopost_idx/${rule.id}`).set(i + 1).catch(() => {});
    text = parts[i % parts.length];
  }
  const kb = url && /^https:\/\//.test(url) ? JSON.stringify({ inline_keyboard: [[{ text: btn, url }]] }) : undefined;
  const common: Record<string, string | number> = { chat_id: s.autopost_channel, ...(kb ? { reply_markup: kb } : {}) };
  let r: any = null;
  if (photo) r = await tgCall("sendPhoto", { ...common, photo, caption: text.slice(0, 1000) });
  if (!r || !r.ok) r = await tgCall("sendMessage", { ...common, text: text.slice(0, 3800), disable_web_page_preview: "true" });
  return r.ok ? "" : String(r.description || "Telegram refused").slice(0, 120);
}

/** cron: run due rules (each at most once per N days, after its hour in UTC) */
export async function runAutoPosts(s?: Settings): Promise<number> {
  const st = s || (await getSettings());
  if (!st.autopost_enabled || !st.autopost_channel) return 0;
  const rules = (await getCfg2()).posts.rules.filter((r) => r.on);
  const now = new Date();
  const today = dayIdx();
  let n = 0;
  for (const r of rules) {
    if (now.getUTCHours() < r.hour) continue;
    let ok = false;
    const prev = (await db().ref(`autopost_last/${r.id}`).get()).val() as number | null;
    const claim = await db().ref(`autopost_last/${r.id}`).transaction((c: number | null) => { ok = c === null || today - c >= r.every; return ok ? today : undefined; });
    if (!claim.committed) continue;
    const err = await sendPost(r, st).catch((e) => String(e?.message || e));
    if (err) {
      // nothing to post (or Telegram refused): retry next run, but keep the day so we do not spam errors
      await db().ref(`autopost_last/${r.id}`).set(prev ?? null).catch(() => {});
      await db().ref(`autopost_err/${r.id}`).set({ at: Date.now(), err }).catch(() => {});
    } else { n++; await db().ref(`autopost_err/${r.id}`).remove().catch(() => {}); }
  }
  return n;
}

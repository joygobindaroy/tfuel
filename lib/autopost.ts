import { db } from "./firebase";
import { getCfg2, PostRule } from "./cfg2";
import { getSettings, Settings } from "./settings";
import { tgCall } from "./telegram";
import { top, names } from "./leaderboard";
import { weekIndex } from "./wallet";
import { getPrice, getChart } from "./market";
import { cardUrl, bannerUrl } from "./cardsig";
import { sortableId } from "./crypto";
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
    const pr = p.price < 1 ? p.price.toFixed(5) : p.price.toFixed(3);
    text = `📈 TFUEL price\n\n$${pr} USDT${ch === null ? "" : `\n24h ${arrow} ${Math.abs(ch).toFixed(2)}%`}`;
    if (/^https:\/\//.test(appBase())) photo = bannerUrl(appBase(), "price", "TFUEL right now", `$${pr}`, ch === null ? [] : [`24h ${arrow} ${Math.abs(ch).toFixed(2)}%`]);
    btn = rule.btn || "📈 Trade now";
    url = link(s, "go_trade");
  } else if (rule.kind === "top") {
    const rows = (await top(`w_${weekIndex()}`, 5)).filter((x) => x.v > 0);
    if (!rows.length) return "No earnings this week yet";
    const nm = await names(rows.map((x) => x.id));
    const medal = ["🥇", "🥈", "🥉", "4.", "5."];
    text = ["🔥 Top earners this week", "", ...rows.map((x, i) => `${medal[i]} ${nm[x.id]} — ${tf(x.v, cpt)} TFUEL`), "", "Your turn to climb 👇"].join("\n");
    if (/^https:\/\//.test(appBase())) photo = bannerUrl(appBase(), "top", "Top earners this week", "", rows.map((x, i) => `${i + 1}. ${String(nm[x.id]).slice(0, 18)} - ${tf(x.v, cpt)}`));
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
    if (/^https:\/\//.test(appBase())) photo = bannerUrl(appBase(), "tour", String(t.title).slice(0, 40), `${t.prizes[0] || 0} coins`, [`${t.game === "memory" ? "Memory match" : "Crypto trivia"} - free entry`, `ends in ~${left} h`]);
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
  const err = r.ok ? "" : String(r.description || "Telegram refused").slice(0, 120);
  await db().ref(`autopost_log/${sortableId()}`).set({ kind: rule.kind, at: Date.now(), ok: !err, ...(err ? { err } : {}), pic: !!photo && r.ok }).catch(() => {});
  return err;
}

/** A new person joined the official group: greet them (Admin → Communication → Auto-post types) */
export async function welcomeMembers(msg: any): Promise<number> {
  const c = (await getCfg2()).posts.welcome;
  if (!c.enabled || !c.text) return 0;
  const s = await getSettings();
  const ch = msg.chat || {};
  const mine = s.autopost_channel && (String(ch.id) === s.autopost_channel || (ch.username && "@" + ch.username === s.autopost_channel));
  if (!mine) return 0;
  const people = (Array.isArray(msg.new_chat_members) ? msg.new_chat_members : []).filter((m: any) => !m.is_bot).slice(0, 5);
  if (!people.length) return 0;
  const name = people.map((m: any) => String(m.first_name || "friend").slice(0, 24)).join(", ");
  const url = link(s);
  const kb = url && /^https:\/\//.test(url) ? JSON.stringify({ inline_keyboard: [[{ text: "🚀 Open app", url }]] }) : undefined;
  const r = await tgCall("sendMessage", { chat_id: ch.id, text: c.text.replace(/\{name\}/g, name).slice(0, 1000), disable_web_page_preview: "true", ...(kb ? { reply_markup: kb } : {}) });
  return r.ok ? 1 : 0;
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

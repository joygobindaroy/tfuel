import { db } from "./firebase";
import { HttpError } from "./auth";
import { COINS_PER_UNIT, MIN_WITHDRAW, UNIT_LABEL, WITHDRAW_METHODS } from "./config";

export interface DepositNet { id: string; name: string; address: string; min: number; note: string; binance_network?: string }
export interface BotButton { text: string; url: string }
export interface BotMenuItem { k: string; text: string; on: boolean }
export const BOT_MENU_DEFAULT: BotMenuItem[] = [
  { k: "profile", text: "👤 My Profile", on: true }, { k: "tasks", text: "✅ Tasks", on: true },
  { k: "daily", text: "🎁 Daily Reward", on: true }, { k: "spin", text: "🎰 Lucky Spin", on: true }, { k: "missions", text: "🎯 Missions", on: true }, { k: "wallet", text: "💰 Wallet", on: true },
  { k: "leaderboard", text: "🏆 Leaderboard", on: true }, { k: "price", text: "📈 Price", on: true },
  { k: "clan", text: "🛡 Clan", on: true }, { k: "invite", text: "👥 Invite Friends", on: true },
  { k: "help", text: "❓ Help", on: true }, { k: "settings", text: "⚙️ Settings", on: true },
];
/** known keys only, keep admin order + labels, append any missing key (so new buttons never vanish) */
export function normMenu(v: any): BotMenuItem[] {
  const raw = (Array.isArray(v) ? v : Object.values(v || {})) as any[];
  const out: BotMenuItem[] = [];
  for (const x of raw) {
    const d = BOT_MENU_DEFAULT.find((y) => y.k === x?.k);
    if (!d || out.some((o) => o.k === d.k)) continue;
    out.push({ k: d.k, text: String(x.text ?? d.text).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 24) || d.text, on: x.on !== false });
  }
  for (const d of BOT_MENU_DEFAULT) if (!out.some((o) => o.k === d.k)) out.push({ ...d });
  return out;
}
export interface PayoutNet { id: string; name: string; min: number; fee: number; regex: string }

export interface Settings {
  // ---- growth (সব মান unit-এ; ১ TFUEL = coins_per_tfuel unit) ----
  daily_enabled: boolean;
  daily_rewards: number[]; // দিন ১,২,৩… (শেষে আবার প্রথম থেকে)
  referral_enabled: boolean;
  referrer_bonus: number;
  invitee_bonus: number;
  referral_commission_pct: number; // রেফারি-র আয়ের % রেফারার পায় (stake/trade বাদে); ০ = বন্ধ
  referral_max: number; // একজন সর্বোচ্চ কতজনের জন্য bonus পাবে
  referral_link: string; // https://t.me/<bot>/<app>
  mine_cap_hours: number; // auto-mining সর্বোচ্চ কত ঘণ্টা জমে (Collect না করলে)
  // ---- TFUEL market (সব ডিফল্টে বন্ধ; admin চালু করবে) ----
  trade_enabled: boolean;
  buy_enabled: boolean;
  sell_enabled: boolean;
  coins_per_tfuel: number; // ১ TFUEL = কত coin
  trade_fee_pct: number; // প্রতিটা trade-এ %
  min_trade_usdt: number;
  max_trade_usdt: number;
  daily_trade_limit_usdt: number; // ০ = সীমা নেই
  price_override: number; // >0 হলে live দামের বদলে এই দাম (USDT)
  deposit_enabled: boolean;
  deposit_networks: DepositNet[];
  binance_auto: boolean; // Binance deposit history মিলিয়ে নিজে approve
  binance_auto_max: number; // এর বেশি হলে verify হয় কিন্তু admin approve করে (USDT)
  binance_id_enabled: boolean; // Binance ID (internal / Pay transfer) দিয়ে deposit
  binance_id: string; // তোমার Binance Pay ID / UID
  binance_id_min: number;
  shops_enabled: boolean; // partner shop-এ খরচ
  stars_enabled: boolean; // Telegram Stars দিয়ে deposit
  stars_per_usdt: number; // ১ USDT = কত Stars
  stars_min_usdt: number;
  stars_max_usdt: number;
  payout_enabled: boolean;
  payout_networks: PayoutNet[];

  earn_per_tap: number;
  max_energy: number;
  energy_regen: number; // প্রতি সেকেন্ডে ধীরে ধীরে ভরা (০ = শুধু নিচের "খালি হলে পুরো ভরা")
  energy_cost: number; // প্রতি tap-এ কত energy খরচ
  empty_refill_hours: number; // energy খালি হলে এত ঘণ্টা পর পুরো ভরে (০ = বন্ধ)
  maintenance: boolean;
  maintenance_msg: string;
  announcement: { enabled: boolean; text: string; kind: "info" | "warn" | "success" };
  withdraw_enabled: boolean;
  min_withdraw: number;
  withdraw_methods: string[];
  coins_per_unit: number;
  unit_label: string;
  new_user_wait_days: number; // নতুন user এতদিন পর withdraw পারবে (০ = সীমা নেই)
  daily_withdraw_limit: number; // প্রতিদিন সর্বোচ্চ কয়টা অনুরোধ (০ = সীমা নেই)
  bot_welcome: string; // /start বার্তা
  bot_start_label: string; // প্রথম বাটনের লেখা
  bot_menu: BotMenuItem[]; // /start-এর বাটন (চালু/বন্ধ, ক্রম, লেখা)
  bot_photo: string; // /start-এর ওপরে ছবি (https)
  bot_returning: boolean; // পুরনো user-কে সংক্ষিপ্ত স্বাগত (ব্যালেন্স, streak)
  bot_inline: boolean; // @bot inline invite card
  bot_groups: boolean; // গ্রুপে /top /price
  autopost_winners: boolean; // সাপ্তাহিক বিজয়ীদের channel-এ পোস্ট
  streak_warn_hour_utc: number; // streak বিপদের বার্তা (UTC ঘণ্টা; দিন শেষের আগে)
  comeback_msg_days: number; // এতদিন না এলে "আমরা মিস করছি" (০ = বন্ধ)
  event_announce: boolean; // নতুন ইভেন্ট শুরু হলে সবাইকে বার্তা
  dm_enabled: boolean; // আজকের মিশন
  dm_taps: number;
  dm_tasks: number;
  dm_bonus: number; // তিনটা শেষ করলে বোনাস (coin)
  refpass_enabled: boolean; // Referral boost pass
  refpass_price: number; // coin
  refpass_days: number;
  refpass_bonus_pct: number; // কমিশনের সাথে যোগ হয়
  confirm_bot_usdt: number; // এর সমান/বেশি USDT withdraw বটে নিশ্চিত করতে হয় (০ = বন্ধ)
  bot_sponsor_text: string; // বটের মেনুর নিচে স্পনসরড বাটন
  bot_sponsor_url: string;
  feed_enabled: boolean; // Community activity feed
  mail_socials: { kind: string; url: string }[]; // email footer social icons
  bot_buttons: BotButton[]; // Channel / Chat / Twitter ইত্যাদি লিংক বাটন
  hold_new_hours: number; // নতুন account-এর withdraw এত ঘণ্টা HOLD (০ = বন্ধ)
  hold_amount_usdt: number; // এর সমান/বেশি amount HOLD (০ = বন্ধ)
  hold_first_withdraw: boolean; // প্রথম withdraw HOLD
  terms_enabled: boolean; // প্রথম খোলায় Terms & Privacy সম্মতি
  terms_version: number; // বাড়ালে সবাইকে আবার জিজ্ঞাসা
  terms_text: string;
  terms_url: string;
  send_enabled: boolean; // user → user TFUEL পাঠানো
  send_fee_pct: number;
  send_min: number; // coin
  send_daily_limit: number; // coin / দিন (০ = সীমা নেই)
  send_min_age_hours: number; // পাঠানোর জন্য account-এর বয়স
  email_money: boolean; // লেনদেনের (deposit, trade, send…) ইমেইল
  faq: { q: string; a: string }[];
  bdt_rate: number; // 1 USDT = ? BDT (user-এর approx display; 0 = বন্ধ)
  remind_hour_utc: number; // daily reward reminder কখন (UTC ঘণ্টা)
  email_enabled: boolean; // user email যাচাই করতে পারবে
  email_required: boolean; // চালু থাকলে withdraw ও সংবেদনশীল বদলে verified email + ৬ ডিজিট কোড লাগে
  addr_cooldown_hours: number; // নতুন ঠিকানায় প্রথম withdraw-এর আগে অপেক্ষা (০ = নেই)
  withdraw_whitelist_only: boolean; // শুধু Saved addresses-এ withdraw
  // ---- engagement ----
  notify_enabled: boolean; // bot-এর মাধ্যমে user-কে বার্তা
  orders_enabled: boolean; // limit / stop order
  max_open_orders: number;
  max_alerts: number;
  spin_enabled: boolean;
  spin_prizes: { coins: number; weight: number }[];
  spin_free_per_day: number;
  lb_enabled: boolean;
  lb_prizes: number[]; // সাপ্তাহিক top N-এর prize (coin)
  ads_enabled: boolean;
  ads_block_id: string; // Adsgram block id
  ads_provider: "monetag" | "adsgram";
  ads_monetag_zone: string; // Monetag zone id (যেমন 12010944)
  ads_monetag_format: "interstitial" | "popup"; // reward-এর বিজ্ঞাপনের ধরন
  ads_inapp: boolean; // Monetag in-app interstitial (নিজে নিজে মাঝেমধ্যে)
  ads_coins: number; // একটা ad দেখলে bonus
  ads_coins_per_day: number;
  ads_energy_per_day: number; // ad দেখে energy refill দিনে কতবার
  ads_spin_per_day: number; // ad দেখে extra spin দিনে কতবার
  // ---- v17: retention ----
  streak_freeze_enabled: boolean; // user streak freeze কিনতে পারে
  streak_freeze_price: number; // coin
  streak_freeze_max: number; // একসাথে সর্বোচ্চ কয়টা রাখা যায়
  ach_enabled: boolean; // Achievements
  comeback_enabled: boolean;
  comeback_days: number; // এতদিন না এলে ফিরলে বোনাস
  comeback_bonus: number;
  weekly_enabled: boolean; // Weekly challenge
  weekly_target: number; // সপ্তাহে কতটা কাজ (task/article/daily)
  weekly_reward: number;
  anniv_enabled: boolean;
  anniv_bonus: number; // প্রতি বছর (এবং ৩০ দিনে) join-এর দিনে
  events: GameEvent[]; // Seasonal events
  milestones: { count: number; bonus: number }[]; // Invite milestone
  invite_msg: string; // share-এর লেখা
  whatsnew: { enabled: boolean; version: number; text: string };
  feature_off: Record<string, string>; // feature key → message shown while switched off (Admin → Controls → Feature switches)
  latest_version_note: string; // admin reminder: newer zip available
  limit_enabled: boolean; // user নিজের খরচ/withdraw সীমা ঠিক করতে পারে
  energy_full_notify: boolean; // energy full হলে bot বার্তা (user opt-in)
  // ---- v17: admin ----
  alert_chat: string; // admin alert-এর Telegram chat id
  alert_big_usdt: number; // এর বেশি withdraw হলে alert (০ = বন্ধ)
  alert_hold: boolean;
  alert_ticket: boolean;
  alert_errors: boolean;
  autopost_enabled: boolean; // channel-এ auto-post
  autopost_channel: string; // @channel বা -100…
  blocked_countries: string[]; // ISO কোড (BD, IN…) — এই দেশ থেকে নতুন ঢোকা বন্ধ
  support_templates: { title: string; text: string }[];
  summary_enabled: boolean; // রোজ সকালে সারসংক্ষেপ admin chat-এ
  summary_hour_utc: number;
  queue_old_hours: number; // withdraw "পুরনো" ধরা হবে এত ঘণ্টা পর
  queue_big_usdt: number; // withdraw "বড়" ধরা হবে এর সমান/বেশি
}

export interface GameEvent { id: string; name: string; text: string; start: number; end: number; tap_mult: number; daily_mult: number; bonus: number }

export const DEFAULTS: Settings = {
  daily_enabled: true,
  daily_rewards: [50, 100, 150, 200, 300, 400, 600],
  referral_enabled: true,
  referrer_bonus: 500,
  invitee_bonus: 200,
  referral_commission_pct: 3,
  referral_max: 100,
  referral_link: process.env.NEXT_PUBLIC_BOT_LINK || "",
  mine_cap_hours: 8,
  trade_enabled: false,
  buy_enabled: true,
  sell_enabled: true,
  coins_per_tfuel: 1000,
  trade_fee_pct: 1,
  min_trade_usdt: 1,
  max_trade_usdt: 500,
  daily_trade_limit_usdt: 1000,
  price_override: 0,
  deposit_enabled: false,
  deposit_networks: [],
  binance_auto: false,
  binance_auto_max: 200,
  binance_id_enabled: false,
  binance_id: "",
  binance_id_min: 1,
  shops_enabled: false,
  stars_enabled: false,
  stars_per_usdt: 77,
  stars_min_usdt: 1,
  stars_max_usdt: 100,
  payout_enabled: false,
  payout_networks: [],
  earn_per_tap: 1,
  max_energy: 1000,
  energy_regen: 0,
  energy_cost: 1.5,
  empty_refill_hours: 3,
  maintenance: false,
  maintenance_msg: "We're making improvements. Please check back soon.",
  announcement: { enabled: false, text: "", kind: "info" },
  withdraw_enabled: true,
  min_withdraw: MIN_WITHDRAW,
  withdraw_methods: WITHDRAW_METHODS,
  coins_per_unit: COINS_PER_UNIT,
  unit_label: "USDT",
  new_user_wait_days: 0,
  daily_withdraw_limit: 0,
  bot_welcome: "👋 Welcome to TFUEL — Let's Start Mining! ⛏\n\nHey Miner! We're so happy you're here! 🚀\n\nYour TFUEL mining adventure starts right now! 💎\nMine tokens, boost your power, invite friends and earn amazing rewards every day! ⚡\n\nWhat you can do inside:\n⛏ Tap to Mine TFUEL effortlessly\n🚀 Boost your mining power & earn faster\n👥 Invite friends & get bonus rewards\n🎁 Claim daily rewards & surprises\n\n👇 Tap ⛏ Start Mining below to open the TFUEL App and begin earning!",
  bot_start_label: "⛏ Start Mining 🚀",
  bot_menu: BOT_MENU_DEFAULT,
  bot_photo: "",
  bot_returning: true,
  bot_inline: true,
  bot_groups: true,
  autopost_winners: true,
  streak_warn_hour_utc: 21,
  comeback_msg_days: 3,
  event_announce: true,
  dm_enabled: true,
  dm_taps: 200,
  dm_tasks: 1,
  dm_bonus: 300,
  refpass_enabled: false,
  refpass_price: 20000,
  refpass_days: 7,
  refpass_bonus_pct: 3,
  confirm_bot_usdt: 0,
  bot_sponsor_text: "",
  bot_sponsor_url: "",
  feed_enabled: true,
  bot_buttons: [],
  mail_socials: [],
  hold_new_hours: 0,
  hold_amount_usdt: 0,
  hold_first_withdraw: false,
  terms_enabled: false,
  terms_version: 1,
  terms_text: "By using TFUEL you agree to our Terms of Use and Privacy Policy. Rewards, balances and prices can change, nothing here is financial advice, and accounts that break the rules may be restricted.",
  terms_url: "",
  send_enabled: true,
  send_fee_pct: 1,
  send_min: 1000,
  send_daily_limit: 100000,
  send_min_age_hours: 24,
  email_money: true,
  faq: [
    { q: "How do I earn TFUEL?", a: "Tap the coin, finish tasks, read article sites, claim your daily reward, spin the wheel and invite friends. Boosts increase what you earn." },
    { q: "How long do deposits take?", a: "Crypto deposits are approved after the network confirms them (usually a few minutes). Stars and Binance ID deposits are credited automatically." },
    { q: "How do withdrawals work?", a: "Request a USDT withdrawal from Profile → Withdraw. We review it and send it manually. Large or first withdrawals may take longer for safety checks." },
    { q: "Why do I need to verify my email?", a: "A 6-digit code sent to your email protects withdrawals and account changes, so nobody can take your money even if your Telegram is compromised." },
    { q: "How do referrals work?", a: "Share your invite link. You get a bonus when a friend joins and completes a task, plus a share of their earnings for life." },
  ],
  bdt_rate: 0,
  remind_hour_utc: 12,
  email_enabled: false,
  email_required: false,
  addr_cooldown_hours: 0,
  withdraw_whitelist_only: false,
  notify_enabled: true,
  orders_enabled: true,
  max_open_orders: 5,
  max_alerts: 5,
  spin_enabled: true,
  spin_prizes: [
    { coins: 20, weight: 40 },
    { coins: 50, weight: 28 },
    { coins: 100, weight: 15 },
    { coins: 200, weight: 9 },
    { coins: 500, weight: 5 },
    { coins: 1000, weight: 2.5 },
    { coins: 5000, weight: 0.5 },
  ],
  spin_free_per_day: 1,
  lb_enabled: true,
  lb_prizes: [5000, 3000, 2000, 1000, 1000],
  ads_enabled: false,
  ads_block_id: "",
  ads_provider: "monetag",
  ads_monetag_zone: "12010944",
  ads_monetag_format: "interstitial",
  ads_inapp: false,
  ads_coins: 200,
  ads_coins_per_day: 5,
  ads_energy_per_day: 2,
  ads_spin_per_day: 3,
  streak_freeze_enabled: true,
  streak_freeze_price: 500,
  streak_freeze_max: 2,
  ach_enabled: true,
  comeback_enabled: true,
  comeback_days: 3,
  comeback_bonus: 500,
  weekly_enabled: true,
  weekly_target: 10,
  weekly_reward: 2000,
  anniv_enabled: true,
  anniv_bonus: 1000,
  events: [],
  milestones: [{ count: 5, bonus: 1000 }, { count: 10, bonus: 3000 }, { count: 25, bonus: 10000 }],
  invite_msg: "Join me on TFUEL and start mining! ⛏ Tap, read articles and earn real TFUEL every day.",
  whatsnew: { enabled: false, version: 1, text: "" },
  feature_off: {},
  latest_version_note: "",
  limit_enabled: true,
  energy_full_notify: true,
  alert_chat: "",
  alert_big_usdt: 100,
  alert_hold: true,
  alert_ticket: true,
  alert_errors: true,
  autopost_enabled: false,
  autopost_channel: "",
  blocked_countries: [],
  support_templates: [
    { title: "Deposit pending", text: "Hi! We can see your deposit and are checking it. It is usually credited within a few minutes after network confirmation. Thank you for waiting." },
    { title: "Withdrawal in review", text: "Hi! Your withdrawal is in review. Payouts are sent manually, usually within 24 hours. We'll message you as soon as it is paid." },
  ],
  summary_enabled: false,
  summary_hour_utc: 3,
  queue_old_hours: 24,
  queue_big_usdt: 100,
};

let cache: { at: number; v: Settings } | null = null;

function merge(stored: any): Settings {
  const s = stored && typeof stored === "object" ? stored : {};
  const methods = Array.isArray(s.withdraw_methods)
    ? s.withdraw_methods.map((x: any) => String(x)).filter(Boolean)
    : Object.values(s.withdraw_methods || {}).map((x: any) => String(x));
  const arr = (v: any) => (Array.isArray(v) ? v : Object.values(v || {})).filter(Boolean);
  return {
    ...DEFAULTS,
    ...s,
    spin_prizes: arr(s.spin_prizes).length ? arr(s.spin_prizes) : DEFAULTS.spin_prizes,
    lb_prizes: s.lb_prizes === undefined ? DEFAULTS.lb_prizes : arr(s.lb_prizes).map(Number),
    daily_rewards: Array.isArray(s.daily_rewards) ? s.daily_rewards : Object.values(s.daily_rewards || {}).length ? Object.values(s.daily_rewards) : DEFAULTS.daily_rewards,
    deposit_networks: arr(s.deposit_networks),
    bot_buttons: arr(s.bot_buttons),
    mail_socials: arr(s.mail_socials),
    bot_menu: normMenu(s.bot_menu),
    faq: s.faq === undefined ? DEFAULTS.faq : arr(s.faq),
    payout_networks: arr(s.payout_networks),
    events: arr(s.events),
    milestones: s.milestones === undefined ? DEFAULTS.milestones : arr(s.milestones),
    support_templates: s.support_templates === undefined ? DEFAULTS.support_templates : arr(s.support_templates),
    blocked_countries: arr(s.blocked_countries).map((x: any) => String(x)),
    whatsnew: { ...DEFAULTS.whatsnew, ...(s.whatsnew || {}) },
    feature_off: s.feature_off && typeof s.feature_off === "object" ? s.feature_off : {},
    announcement: { ...DEFAULTS.announcement, ...(s.announcement || {}) },
    withdraw_methods: methods.length ? methods : s.withdraw_methods === undefined ? DEFAULTS.withdraw_methods : [],
  };
}

export async function getSettings(fresh = false): Promise<Settings> {
  const now = Date.now();
  if (!fresh && cache && now - cache.at < 15000) return cache.v;
  const v = merge((await db().ref("settings").get()).val());
  cache = { at: now, v };
  return v;
}

export function invalidateSettings() {
  cache = null;
}

const num = (v: any, f: string, min: number, max: number, cur: number) => {
  if (v === undefined || v === null || v === "") return cur;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Invalid ${f}`);
  return n;
};
const str = (v: any, max: number, cur: string) =>
  v === undefined ? cur : String(v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/** admin-এর পাঠানো মান যাচাই করে বর্তমান settings-এর ওপর বসায় */
export function parseSettings(b: any, cur: Settings): Settings {
  const a = b.announcement || {};
  const kind = ["info", "warn", "success"].includes(a.kind) ? a.kind : cur.announcement.kind;
  let methods = cur.withdraw_methods;
  if (b.withdraw_methods !== undefined) {
    const raw: string[] = Array.isArray(b.withdraw_methods) ? b.withdraw_methods : String(b.withdraw_methods).split(",");
    methods = Array.from(new Set(raw.map((x) => String(x).trim().slice(0, 40)).filter(Boolean))).slice(0, 20);
  }
  const slug = (x: any) => String(x || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  const txt = (x: any, n: number) => String(x ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
  const n0 = (x: any, f: string, max = 1e9) => {
    const v = Number(x);
    if (!Number.isFinite(v) || v < 0 || v > max) throw new HttpError(400, `Invalid ${f}`);
    return v;
  };
  let dnets = cur.deposit_networks;
  if (b.deposit_networks !== undefined) {
    if (!Array.isArray(b.deposit_networks) || b.deposit_networks.length > 10) throw new HttpError(400, "Invalid deposit networks");
    dnets = b.deposit_networks.map((x: any) => {
      const name = txt(x.name, 30);
      const address = txt(x.address, 100);
      if (!name || address.length < 10) throw new HttpError(400, "Each deposit network needs a name and an address");
      const bn = txt(x.binance_network, 12).toUpperCase();
      if (bn && !/^[A-Z0-9]{2,12}$/.test(bn)) throw new HttpError(400, "Binance network code looks wrong (e.g. TRX, BSC, ETH)");
      return { id: slug(name), name, address, min: n0(x.min, "deposit min", 1e6), note: txt(x.note, 120), binance_network: bn };
    });
    if (new Set(dnets.map((d: DepositNet) => d.id)).size !== dnets.length) throw new HttpError(400, "Duplicate deposit network names");
  }
  let pnets = cur.payout_networks;
  if (b.payout_networks !== undefined) {
    if (!Array.isArray(b.payout_networks) || b.payout_networks.length > 10) throw new HttpError(400, "Invalid payout networks");
    pnets = b.payout_networks.map((x: any) => {
      const name = txt(x.name, 30);
      if (!name) throw new HttpError(400, "Each payout network needs a name");
      const regex = txt(x.regex, 120);
      if (regex) {
        try {
          new RegExp(regex);
        } catch {
          throw new HttpError(400, `Bad address pattern for ${name}`);
        }
      }
      return { id: slug(name), name, min: n0(x.min, "payout min", 1e6), fee: n0(x.fee, "payout fee", 1e6), regex };
    });
    if (new Set(pnets.map((d: PayoutNet) => d.id)).size !== pnets.length) throw new HttpError(400, "Duplicate payout network names");
  }
  let daily = cur.daily_rewards;
  if (b.daily_rewards !== undefined) {
    if (!Array.isArray(b.daily_rewards) || b.daily_rewards.length < 1 || b.daily_rewards.length > 31) throw new HttpError(400, "Invalid daily rewards");
    daily = b.daily_rewards.map((x: any) => Math.floor(n0(x, "daily reward", 1e9)));
  }
  let link = cur.referral_link;
  if (b.referral_link !== undefined) {
    link = txt(b.referral_link, 100).replace(/\/+$/, "");
    if (link && !/^https:\/\/t\.me\/[A-Za-z0-9_]{4,}(\/[A-Za-z0-9_]+)?$/.test(link)) throw new HttpError(400, "Referral link must look like https://t.me/yourbot/app");
  }
  let spin = cur.spin_prizes;
  if (b.spin_prizes !== undefined) {
    if (!Array.isArray(b.spin_prizes) || b.spin_prizes.length < 2 || b.spin_prizes.length > 12) throw new HttpError(400, "Spin needs 2 to 12 prizes");
    spin = b.spin_prizes.map((x: any) => {
      const coins = Math.floor(Number(x.coins));
      const weight = Number(x.weight);
      if (!Number.isFinite(coins) || coins < 1 || coins > 1e9 || !Number.isFinite(weight) || weight <= 0 || weight > 1e6) throw new HttpError(400, "Invalid spin prize");
      return { coins, weight };
    });
  }
  let lbp = cur.lb_prizes;
  if (b.lb_prizes !== undefined) {
    if (!Array.isArray(b.lb_prizes) || b.lb_prizes.length > 20) throw new HttpError(400, "Invalid leaderboard prizes");
    lbp = b.lb_prizes.map((x: any) => Math.floor(n0(x, "leaderboard prize", 1e9)));
  }
  let bbtn = cur.bot_buttons;
  if (b.bot_buttons !== undefined) {
    if (!Array.isArray(b.bot_buttons) || b.bot_buttons.length > 8) throw new HttpError(400, "At most 8 bot buttons");
    bbtn = b.bot_buttons.filter((x: any) => txt(x?.text, 40) || txt(x?.url, 200)).map((x: any) => {
      const text = txt(x.text, 40);
      const url = txt(x.url, 200);
      if (!text || !/^https:\/\/[^\s]+$/.test(url)) throw new HttpError(400, "Each bot button needs a text and an https:// link");
      return { text, url };
    });
  }
  let msoc = cur.mail_socials;
  if (b.mail_socials !== undefined) {
    if (!Array.isArray(b.mail_socials) || b.mail_socials.length > 8) throw new HttpError(400, "At most 8 social links");
    msoc = b.mail_socials.filter((x: any) => txt(x?.url, 200)).map((x: any) => {
      const kind = String(x.kind || "");
      const url = txt(x.url, 200);
      if (!/^(telegram|x|youtube|instagram|facebook|discord|tiktok|whatsapp)$/.test(kind) || !/^https:\/\/[^\s]+$/.test(url)) throw new HttpError(400, "Each social link needs a network and an https:// link");
      return { kind, url };
    });
  }
  const bool = (k: keyof Settings) => (b[k] === undefined ? (cur as any)[k] : !!b[k]);
  return {
    daily_enabled: bool("daily_enabled"),
    daily_rewards: daily,
    referral_enabled: bool("referral_enabled"),
    referrer_bonus: Math.floor(num(b.referrer_bonus, "referrer_bonus", 0, 1e9, cur.referrer_bonus)),
    invitee_bonus: Math.floor(num(b.invitee_bonus, "invitee_bonus", 0, 1e9, cur.invitee_bonus)),
    referral_max: Math.floor(num(b.referral_max, "referral_max", 0, 100000, cur.referral_max)),
    referral_commission_pct: num(b.referral_commission_pct, "referral_commission_pct", 0, 50, cur.referral_commission_pct),
    referral_link: link,
    mine_cap_hours: num(b.mine_cap_hours, "mine_cap_hours", 1, 168, cur.mine_cap_hours),
    trade_enabled: bool("trade_enabled"),
    buy_enabled: bool("buy_enabled"),
    sell_enabled: bool("sell_enabled"),
    coins_per_tfuel: Math.floor(num(b.coins_per_tfuel, "coins_per_tfuel", 1, 1e9, cur.coins_per_tfuel)),
    trade_fee_pct: num(b.trade_fee_pct, "trade_fee_pct", 0, 20, cur.trade_fee_pct),
    min_trade_usdt: num(b.min_trade_usdt, "min_trade_usdt", 0.01, 1e6, cur.min_trade_usdt),
    max_trade_usdt: num(b.max_trade_usdt, "max_trade_usdt", 0.01, 1e7, cur.max_trade_usdt),
    daily_trade_limit_usdt: num(b.daily_trade_limit_usdt, "daily_trade_limit_usdt", 0, 1e7, cur.daily_trade_limit_usdt),
    price_override: num(b.price_override, "price_override", 0, 1e6, cur.price_override),
    deposit_enabled: bool("deposit_enabled"),
    deposit_networks: dnets,
    binance_auto: bool("binance_auto"),
    binance_auto_max: num(b.binance_auto_max, "binance_auto_max", 0, 1e6, cur.binance_auto_max),
    binance_id_enabled: bool("binance_id_enabled"),
    binance_id: (() => { const v = str(b.binance_id, 20, cur.binance_id); if (v && !/^\d{5,20}$/.test(v)) throw new HttpError(400, "Binance ID must be digits only"); return v; })(),
    binance_id_min: num(b.binance_id_min, "binance_id_min", 0.01, 1e6, cur.binance_id_min),
    shops_enabled: bool("shops_enabled"),
    stars_enabled: bool("stars_enabled"),
    stars_per_usdt: num(b.stars_per_usdt, "stars_per_usdt", 1, 100000, cur.stars_per_usdt),
    stars_min_usdt: num(b.stars_min_usdt, "stars_min_usdt", 0.01, 1e5, cur.stars_min_usdt),
    stars_max_usdt: num(b.stars_max_usdt, "stars_max_usdt", 0.01, 1e5, cur.stars_max_usdt),
    payout_enabled: bool("payout_enabled"),
    payout_networks: pnets,
    earn_per_tap: Math.floor(num(b.earn_per_tap, "earn_per_tap", 1, 1000, cur.earn_per_tap)),
    max_energy: Math.floor(num(b.max_energy, "max_energy", 10, 100000, cur.max_energy)),
    energy_regen: num(b.energy_regen, "energy_regen", 0, 1000, cur.energy_regen),
    energy_cost: num(b.energy_cost, "energy_cost", 0.1, 100, cur.energy_cost),
    empty_refill_hours: num(b.empty_refill_hours, "empty_refill_hours", 0, 72, cur.empty_refill_hours),
    maintenance: b.maintenance === undefined ? cur.maintenance : !!b.maintenance,
    maintenance_msg: str(b.maintenance_msg, 200, cur.maintenance_msg),
    announcement: {
      enabled: a.enabled === undefined ? cur.announcement.enabled : !!a.enabled,
      text: str(a.text, 240, cur.announcement.text),
      kind,
    },
    withdraw_enabled: b.withdraw_enabled === undefined ? cur.withdraw_enabled : !!b.withdraw_enabled,
    min_withdraw: Math.floor(num(b.min_withdraw, "min_withdraw", 1, 1e9, cur.min_withdraw)),
    withdraw_methods: methods,
    coins_per_unit: Math.floor(num(b.coins_per_unit, "coins_per_unit", 1, 1e9, cur.coins_per_unit)),
    unit_label: str(b.unit_label, 10, cur.unit_label) || cur.unit_label,
    new_user_wait_days: Math.floor(num(b.new_user_wait_days, "new_user_wait_days", 0, 365, cur.new_user_wait_days)),
    daily_withdraw_limit: Math.floor(num(b.daily_withdraw_limit, "daily_withdraw_limit", 0, 100, cur.daily_withdraw_limit)),
    bot_welcome: (() => { const v = b.bot_welcome === undefined ? cur.bot_welcome : String(b.bot_welcome).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 1500); return v || cur.bot_welcome; })(),
    bot_start_label: str(b.bot_start_label, 40, cur.bot_start_label) || cur.bot_start_label,
    bot_buttons: bbtn,
    mail_socials: msoc,
    bot_menu: b.bot_menu === undefined ? cur.bot_menu : normMenu(b.bot_menu),
    bot_photo: (() => { if (b.bot_photo === undefined) return cur.bot_photo; const v = txt(b.bot_photo, 300); if (v && !/^https:\/\/[^\s]+$/.test(v)) throw new HttpError(400, "Banner must be an https:// image link"); return v; })(),
    bot_returning: bool("bot_returning"),
    bot_inline: bool("bot_inline"),
    bot_groups: bool("bot_groups"),
    autopost_winners: bool("autopost_winners"),
    streak_warn_hour_utc: Math.floor(num(b.streak_warn_hour_utc, "streak_warn_hour_utc", 0, 23, cur.streak_warn_hour_utc)),
    comeback_msg_days: Math.floor(num(b.comeback_msg_days, "comeback_msg_days", 0, 90, cur.comeback_msg_days)),
    event_announce: bool("event_announce"),
    dm_enabled: bool("dm_enabled"),
    dm_taps: Math.floor(num(b.dm_taps, "dm_taps", 1, 100000, cur.dm_taps)),
    dm_tasks: Math.floor(num(b.dm_tasks, "dm_tasks", 1, 100, cur.dm_tasks)),
    dm_bonus: Math.floor(num(b.dm_bonus, "dm_bonus", 0, 1e9, cur.dm_bonus)),
    refpass_enabled: bool("refpass_enabled"),
    refpass_price: Math.floor(num(b.refpass_price, "refpass_price", 1, 1e10, cur.refpass_price)),
    refpass_days: Math.floor(num(b.refpass_days, "refpass_days", 1, 365, cur.refpass_days)),
    refpass_bonus_pct: num(b.refpass_bonus_pct, "refpass_bonus_pct", 0, 50, cur.refpass_bonus_pct),
    confirm_bot_usdt: num(b.confirm_bot_usdt, "confirm_bot_usdt", 0, 1e7, cur.confirm_bot_usdt),
    bot_sponsor_text: str(b.bot_sponsor_text, 30, cur.bot_sponsor_text),
    bot_sponsor_url: (() => { if (b.bot_sponsor_url === undefined) return cur.bot_sponsor_url; const v = txt(b.bot_sponsor_url, 300); if (v && !/^https:\/\/[^\s]+$/.test(v)) throw new HttpError(400, "Sponsor link must be https://"); return v; })(),
    feed_enabled: bool("feed_enabled"),
    hold_new_hours: num(b.hold_new_hours, "hold_new_hours", 0, 8760, cur.hold_new_hours),
    hold_amount_usdt: num(b.hold_amount_usdt, "hold_amount_usdt", 0, 1e7, cur.hold_amount_usdt),
    hold_first_withdraw: bool("hold_first_withdraw"),
    terms_enabled: bool("terms_enabled"),
    terms_version: Math.floor(num(b.terms_version, "terms_version", 1, 1e6, cur.terms_version)),
    terms_text: (() => { const v = b.terms_text === undefined ? cur.terms_text : String(b.terms_text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 4000); return v || cur.terms_text; })(),
    terms_url: (() => { const v = str(b.terms_url, 200, cur.terms_url); if (v && !/^https:\/\/[^\s]+$/.test(v)) throw new HttpError(400, "Terms link must start with https://"); return v; })(),
    send_enabled: bool("send_enabled"),
    send_fee_pct: num(b.send_fee_pct, "send_fee_pct", 0, 20, cur.send_fee_pct),
    send_min: Math.floor(num(b.send_min, "send_min", 1, 1e12, cur.send_min)),
    send_daily_limit: Math.floor(num(b.send_daily_limit, "send_daily_limit", 0, 1e13, cur.send_daily_limit)),
    send_min_age_hours: num(b.send_min_age_hours, "send_min_age_hours", 0, 720, cur.send_min_age_hours),
    email_money: bool("email_money"),
    faq: (() => {
      if (b.faq === undefined) return cur.faq;
      if (!Array.isArray(b.faq) || b.faq.length > 30) throw new HttpError(400, "At most 30 FAQ items");
      return b.faq.map((x: any) => ({ q: txt(x.q, 120), a: txt(x.a, 800) })).filter((x: any) => x.q && x.a);
    })(),
    bdt_rate: num(b.bdt_rate, "bdt_rate", 0, 10000, cur.bdt_rate),
    remind_hour_utc: Math.floor(num(b.remind_hour_utc, "remind_hour_utc", 0, 23, cur.remind_hour_utc)),
    email_enabled: bool("email_enabled"),
    email_required: bool("email_required"),
    addr_cooldown_hours: num(b.addr_cooldown_hours, "addr_cooldown_hours", 0, 720, cur.addr_cooldown_hours),
    withdraw_whitelist_only: bool("withdraw_whitelist_only"),
    notify_enabled: bool("notify_enabled"),
    orders_enabled: bool("orders_enabled"),
    max_open_orders: Math.floor(num(b.max_open_orders, "max_open_orders", 0, 50, cur.max_open_orders)),
    max_alerts: Math.floor(num(b.max_alerts, "max_alerts", 0, 50, cur.max_alerts)),
    spin_enabled: bool("spin_enabled"),
    spin_prizes: spin,
    spin_free_per_day: Math.floor(num(b.spin_free_per_day, "spin_free_per_day", 0, 50, cur.spin_free_per_day)),
    lb_enabled: bool("lb_enabled"),
    lb_prizes: lbp,
    ads_enabled: bool("ads_enabled"),
    ads_block_id: str(b.ads_block_id, 40, cur.ads_block_id),
    ads_provider: ["monetag", "adsgram"].includes(b.ads_provider) ? b.ads_provider : cur.ads_provider,
    ads_monetag_zone: (() => { const z = str(b.ads_monetag_zone, 12, cur.ads_monetag_zone); if (z && !/^\d{4,12}$/.test(z)) throw new HttpError(400, "Monetag zone must be digits only"); return z; })(),
    ads_monetag_format: ["interstitial", "popup"].includes(b.ads_monetag_format) ? b.ads_monetag_format : cur.ads_monetag_format,
    ads_inapp: bool("ads_inapp"),
    ads_coins: Math.floor(num(b.ads_coins, "ads_coins", 0, 1e9, cur.ads_coins)),
    ads_coins_per_day: Math.floor(num(b.ads_coins_per_day, "ads_coins_per_day", 0, 100, cur.ads_coins_per_day)),
    ads_energy_per_day: Math.floor(num(b.ads_energy_per_day, "ads_energy_per_day", 0, 100, cur.ads_energy_per_day)),
    ads_spin_per_day: Math.floor(num(b.ads_spin_per_day, "ads_spin_per_day", 0, 100, cur.ads_spin_per_day)),
    streak_freeze_enabled: bool("streak_freeze_enabled"),
    streak_freeze_price: Math.floor(num(b.streak_freeze_price, "streak_freeze_price", 0, 1e9, cur.streak_freeze_price)),
    streak_freeze_max: Math.floor(num(b.streak_freeze_max, "streak_freeze_max", 0, 10, cur.streak_freeze_max)),
    ach_enabled: bool("ach_enabled"),
    comeback_enabled: bool("comeback_enabled"),
    comeback_days: Math.floor(num(b.comeback_days, "comeback_days", 1, 365, cur.comeback_days)),
    comeback_bonus: Math.floor(num(b.comeback_bonus, "comeback_bonus", 0, 1e9, cur.comeback_bonus)),
    weekly_enabled: bool("weekly_enabled"),
    weekly_target: Math.floor(num(b.weekly_target, "weekly_target", 1, 1000, cur.weekly_target)),
    weekly_reward: Math.floor(num(b.weekly_reward, "weekly_reward", 0, 1e9, cur.weekly_reward)),
    anniv_enabled: bool("anniv_enabled"),
    anniv_bonus: Math.floor(num(b.anniv_bonus, "anniv_bonus", 0, 1e9, cur.anniv_bonus)),
    events: (() => {
      if (b.events === undefined) return cur.events;
      if (!Array.isArray(b.events) || b.events.length > 20) throw new HttpError(400, "At most 20 events");
      return b.events.map((x: any) => {
        const start = Math.floor(n0(x.start, "event start", 4e12));
        const end = Math.floor(n0(x.end, "event end", 4e12));
        if (end <= start) throw new HttpError(400, "Event end must be after start");
        const name = txt(x.name, 40);
        if (!name) throw new HttpError(400, "Each event needs a name");
        return { id: slug(x.id || name) || "ev", name, text: txt(x.text, 160), start, end, tap_mult: Math.max(1, Math.min(10, Number(x.tap_mult) || 1)), daily_mult: Math.max(1, Math.min(10, Number(x.daily_mult) || 1)), bonus: Math.floor(n0(x.bonus || 0, "event bonus", 1e9)) };
      });
    })(),
    milestones: (() => {
      if (b.milestones === undefined) return cur.milestones;
      if (!Array.isArray(b.milestones) || b.milestones.length > 12) throw new HttpError(400, "At most 12 milestones");
      return b.milestones.map((x: any) => ({ count: Math.floor(n0(x.count, "milestone count", 1e6)), bonus: Math.floor(n0(x.bonus, "milestone bonus", 1e9)) })).filter((x: any) => x.count > 0).sort((p: any, q: any) => p.count - q.count);
    })(),
    invite_msg: (() => { const v = b.invite_msg === undefined ? cur.invite_msg : txt(b.invite_msg, 300); return v || cur.invite_msg; })(),
    feature_off: b.feature_off === undefined ? cur.feature_off : Object.fromEntries(Object.entries(b.feature_off || {}).filter(([k]) => /^[a-z_]{1,32}$/.test(k)).map(([k, v]) => [k, String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 200)])),
    latest_version_note: str(b.latest_version_note, 200, cur.latest_version_note),
    whatsnew: b.whatsnew === undefined ? cur.whatsnew : { enabled: !!b.whatsnew.enabled, version: Math.floor(n0(b.whatsnew.version ?? cur.whatsnew.version, "whatsnew version", 1e6)), text: String(b.whatsnew.text ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, 800) },
    limit_enabled: bool("limit_enabled"),
    energy_full_notify: bool("energy_full_notify"),
    alert_chat: (() => { const v = str(b.alert_chat, 20, cur.alert_chat); if (v && !/^-?\d{4,20}$/.test(v)) throw new HttpError(400, "Alert chat id must be a number (use @userinfobot)"); return v; })(),
    alert_big_usdt: num(b.alert_big_usdt, "alert_big_usdt", 0, 1e7, cur.alert_big_usdt),
    alert_hold: bool("alert_hold"),
    alert_ticket: bool("alert_ticket"),
    alert_errors: bool("alert_errors"),
    autopost_enabled: bool("autopost_enabled"),
    autopost_channel: (() => { const v = str(b.autopost_channel, 40, cur.autopost_channel); if (v && !/^(@[A-Za-z0-9_]{4,}|-100\d{6,})$/.test(v)) throw new HttpError(400, "Channel must be @name or -100… id"); return v; })(),
    blocked_countries: (() => {
      if (b.blocked_countries === undefined) return cur.blocked_countries;
      const raw: string[] = Array.isArray(b.blocked_countries) ? b.blocked_countries : String(b.blocked_countries).split(/[\s,]+/);
      return Array.from(new Set(raw.map((x) => String(x).trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)))).slice(0, 100);
    })(),
    support_templates: (() => {
      if (b.support_templates === undefined) return cur.support_templates;
      if (!Array.isArray(b.support_templates) || b.support_templates.length > 30) throw new HttpError(400, "At most 30 templates");
      return b.support_templates.map((x: any) => ({ title: txt(x.title, 40), text: txt(x.text, 800) })).filter((x: any) => x.title && x.text);
    })(),
    summary_enabled: bool("summary_enabled"),
    summary_hour_utc: Math.floor(num(b.summary_hour_utc, "summary_hour_utc", 0, 23, cur.summary_hour_utc)),
    queue_old_hours: num(b.queue_old_hours, "queue_old_hours", 1, 720, cur.queue_old_hours),
    queue_big_usdt: num(b.queue_big_usdt, "queue_big_usdt", 0, 1e7, cur.queue_big_usdt),
  };
}

// শুধু browser-এ চলে
declare global {
  interface Window {
    Telegram?: { WebApp?: any };
  }
}

export function tg() {
  return typeof window !== "undefined" ? window.Telegram?.WebApp : undefined;
}

/** Telegram haptic feedback (Settings-এ বন্ধ করা যায়; এই ডিভাইসে সেভ থাকে) */
export const hapticOn = () => { try { return localStorage.getItem("haptic_off") !== "1"; } catch { return true; } };
export const setHapticOn = (on: boolean) => { try { localStorage.setItem("haptic_off", on ? "0" : "1"); } catch {} };
export function haptic(kind: "light" | "success" | "error" = "light") {
  try {
    if (!hapticOn()) return;
    const h = tg()?.HapticFeedback;
    if (!h) return;
    if (kind === "light") h.impactOccurred("light");
    else h.notificationOccurred(kind);
  } catch {}
}

export async function api<T = any>(path: string, body: Record<string, any> = {}): Promise<T> {
  const initData = tg()?.initData || "";
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${initData}` };
  try {
    const adm = typeof window !== "undefined" ? sessionStorage.getItem("adm") : null;
    if (adm) headers["x-admin-token"] = adm;
  } catch {}
  let r: Response;
  try {
    r = await fetch(`/api/${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  } catch {
    const err: any = new Error("network");
    err.status = 0;
    throw err;
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.success === false) {
    const err: any = new Error(data.error || `Error ${r.status}`);
    err.data = data; // attempts_left, retry_at, min ইত্যাদি
    err.status = r.status;
    throw err;
  }
  return data as T;
}

/* ---------- cache-first loading: history/details show instantly from this device, then refresh ---------- */
const CACHE_TTL = 14 * 86400000;
const ckey = (path: string, body: Record<string, any>) => {
  let uid = "0";
  try { uid = String(tg()?.initDataUnsafe?.user?.id || "0"); } catch {}
  return `c1:${uid}:${path}:${JSON.stringify(body)}`;
};
export function cacheRead<T>(path: string, body: Record<string, any> = {}): T | null {
  try {
    const r = JSON.parse(localStorage.getItem(ckey(path, body)) || "null") as { v: T; at: number } | null;
    return r && Date.now() - r.at < CACHE_TTL ? r.v : null;
  } catch { return null; }
}
function cacheWrite(path: string, body: Record<string, any>, v: unknown) {
  try { localStorage.setItem(ckey(path, body), JSON.stringify({ v, at: Date.now() })); } catch {}
}
/** আগে সেভ করা কপি থাকলে সাথে সাথে onData-তে দেয়, তারপর নতুন ডেটা এনে আপডেট ও সেভ করে। নেটওয়ার্ক ব্যর্থ হলে error throw করে (পুরনো কপি দেখানো থাকে) */
export async function cachedApi<T = any>(path: string, body: Record<string, any>, onData: (d: T) => void): Promise<T> {
  const c = cacheRead<T>(path, body);
  if (c) onData(c);
  const fresh = await api<T>(path, body);
  cacheWrite(path, body, fresh);
  onData(fresh);
  return fresh;
}

export function openLink(url: string) {
  const w = tg();
  if (w?.openLink) w.openLink(url);
  else window.open(url, "_blank");
}

export function openTgLink(url: string) {
  const w = tg();
  if (w?.openTelegramLink && /^https:\/\/t\.me\//.test(url)) w.openTelegramLink(url);
  else openLink(url);
}

/** 1 TFUEL = cpt coin; দেখানো হয় সবসময় TFUEL (দশমিকসহ) ও USDT মূল্য */
export const tfDecimals = (cpt: number) => Math.min(6, Math.max(0, Math.round(Math.log10(Math.max(1, cpt)))));
/** device-এ সেভ করা UI পছন্দ (Settings → Appearance / Sound) */
export const getUi = (k: string, def = ""): string => { try { return localStorage.getItem("ui_" + k) ?? def; } catch { return def; } };
export const setUi = (k: string, v: string) => { try { localStorage.setItem("ui_" + k, v); } catch {} };
let actx: any = null;
/** ছোট tap/claim শব্দ (WebAudio; haptic থেকে আলাদা, ডিফল্ট বন্ধ) */
export function tick(freq = 520) {
  try {
    if (getUi("sound") !== "1") return;
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    actx = actx || new AC();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.06, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + 0.08);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + 0.09);
  } catch {}
}
export function fmtTf(coins: number, cpt: number): string {
  const d = tfDecimals(cpt);
  const tf = coins / cpt;
  if (Math.abs(tf) >= 10000 && getUi("numfmt") === "compact") {
    const u: [number, string][] = [[1e9, "B"], [1e6, "M"], [1e3, "K"]];
    for (const [v, x] of u) if (Math.abs(tf) >= v) return (tf / v).toLocaleString("en-US", { maximumFractionDigits: 2 }) + x;
  }
  return (coins / cpt).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function fmtUsd(v: number): string {
  if (!v) return "$0.00";
  if (v < 0.01) return "<$0.01";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ERR: Record<string, string> = {
  bot_not_started: "Open our bot in Telegram and press Start first, then try again.",
  reset_expired: "That code has expired. Request a new one.",
  reset_wrong: "Wrong code. Please check and try again.",
  wait_a_minute: "Please wait a minute before asking for another code.",
  no_pin: "You haven't set a PIN.",
  ticket_limit: "You have too many open tickets. Wait for a reply first.",
  shop_unavailable: "This shop isn't available right now.",
  shop_not_connected: "Connect this shop first.",
  order_not_found: "This payment request wasn't found.",
  order_expired: "This payment request has expired. Go back to the shop and try again.",
  order_paid: "This order has already been paid.",
  currency_off: "This currency isn't accepted by this shop.",
  no_site_available: "No article site is available right now. Please try again later.",
  cooldown: "This site isn't ready yet. Try another one or come back later.",
  no_active_run: "Start an article site first.",
  finish_articles_first: "Read all the articles in order to get your code.",
  code_expired: "That code has expired. Go to the last article and get a new one.",
  wrong_code: "Wrong code. Please check and try again.",
  locked: "Too many wrong attempts. Please start the site again.",
  already_claimed: "This code has already been used.",
  code_must_be_6_digits: "Enter the 6-digit code.",
  below_minimum: "Amount is below the minimum.",
  insufficient: "You don't have enough TFUEL.",
  bad_method: "Choose a withdrawal method.",
  bad_account: "Enter your account or wallet address.",
  verify_unavailable: "We couldn't check this right now. Please try again in a little while.",
  not_joined: "We couldn't confirm you've joined yet. Join the channel, then tap Verify again.",
  account_banned: "Your account has been suspended.",
  maintenance: "We're making improvements. Please check back soon.",
  withdraw_disabled: "Withdrawals are temporarily paused.",
  too_new: "New accounts can withdraw after a short waiting period.",
  daily_limit: "You've reached today's withdrawal limit.",
  trade_disabled: "Trading is currently paused.",
  trade_side_disabled: "This type of trade is currently unavailable.",
  price_unavailable: "Live price is temporarily unavailable. Please try again shortly.",
  price_changed: "The price just moved. Please review and try again.",
  bad_amount: "Enter a valid amount.",
  below_min_trade: "Amount is below the minimum per trade.",
  above_max_trade: "Amount is above the maximum per trade.",
  daily_trade_limit: "You've reached today's trading limit.",
  insufficient_usdt: "You don't have enough USDT.",
  ad_title: "Give your promotion a short title (3+ characters).",
  ad_url: "Enter a valid https:// link.",
  ad_blocked: "This content isn't allowed in promotions. Please change the title, text or link.",
  ad_too_many: "You already have 5 promotions waiting or running.",
  ad_full: "This slot is full right now. Try another slot or come back later.",
  ad_goal: "The number of completions is outside the allowed range.",
  ad_not_pending: "This promotion can't be cancelled any more.",
  collect_max: "You already own this item.",
  gift_not_friend: "You can only gift friends you invited (or who invited you).",
  gift_too_new: "Your account must be at least a day old to send gifts.",
  gift_limit: "You've already gifted this friend today, or reached today's gift limit.",
  ms_not_ready: "Invite more friends to unlock this reward.",
  creator_min: "You need more followers to apply right now.",
  creator_exists: "You already applied.",
  pass_inactive: "You need an active season pass.",
  plate_bad: "Use 3+ letters, numbers or emoji. Links and @names aren't allowed.",
  plate_same: "That's already your tag.",
  tip_clan_only: "You can tip members of your own clan.",
  clan_ann_wait: "You can post one announcement per hour.",
  deposit_disabled: "Deposits are temporarily unavailable.",
  bad_network: "Choose a network.",
  bad_txid: "That transaction ID doesn't look right.",
  below_min_deposit: "Amount is below the minimum deposit for this network.",
  txid_used: "This transaction ID has already been submitted.",
  lb_failed: "The leaderboard is temporarily unavailable. Please try again soon.",
  need_intent: "Tap “Get exact amount” first, then send exactly that amount.",
  try_again: "Please try again in a moment.",
  boost_blocked: "You can't switch plans right now (a plan is already queued, or your current one is permanent).",
  email_required: "Verify your email in Settings first.",
  email_unavailable: "Email is not available right now.",
  email_failed: "We couldn't send the email. Please try again.",
  bad_request: "Please check the details and try again.",
  account_frozen: "Withdrawals and transfers are paused on your account. Please contact support.",
  country_blocked: "Withdrawals are not available in your country.",
  send_disabled: "Sending TFUEL is turned off right now.",
  send_self: "You can't send TFUEL to yourself.",
  send_min: "Amount is below the minimum you can send.",
  send_no_user: "We couldn't find that user. Check the code.",
  send_bad_code: "That code doesn't look right (10 letters/numbers).",
  send_limit: "You've reached today's sending limit.",
  send_too_new: "Your account is too new to send TFUEL yet.",
  send_failed: "Something went wrong. Your balance was not changed.",
  request_not_found: "This payment request doesn't exist.",
  request_closed: "This payment request was already paid, cancelled or expired.",
  link_not_found: "This money link isn't valid.",
  claim_closed: "This money link was already claimed, cancelled or expired.",
  claim_own: "You can't claim your own link. Cancel it to get your money back.",
  feature_off: "This feature is turned off right now.",
  mini_limit: "You have used all plays for today. Come back tomorrow!",
  mini_no_game: "This game has ended. Start a new one.",
  tour_over: "This tournament has ended.",
  too_many_requests: "You have too many open requests. Cancel some first.",
  too_many_links: "You have too many open money links. Cancel some first.",
  too_many_contacts: "You can save up to 50 contacts.",
  xfer_not_found: "Transfer not found.",
  xfer_not_cancellable: "This transfer can't be cancelled any more.",
  not_found: "Not found.",
  bad_email: "That email address doesn't look right.",
  email_taken: "This email is already used by another account.",
  ecode_required: "Enter the 6-digit code from your email.",
  ecode_wrong: "Wrong code. Please try again.",
  ecode_expired: "That code has expired. Request a new one.",
  addr_not_saved: "Withdrawals are only allowed to addresses saved in Settings.",
  addr_cooldown: "This address is new. For your safety it can be used after a short waiting period.",
  pin_required: "Enter your withdraw PIN.",
  pin_wrong: "Wrong PIN. Please try again.",
  pin_locked: "Too many wrong PINs. Try again in 15 minutes.",
  bad_pin: "PIN must be 4 to 6 digits.",
  too_many_addrs: "You can save up to 10 addresses.",
  too_many_pending: "You have too many deposits waiting for review.",
  bad_address: "That wallet address isn't valid for this network.",
  below_min_usdt: "Amount is below the minimum withdrawal.",
  withdraw_failed: "Something went wrong. Your balance was not changed.",
  boost_active: "This boost is already active.",
  plan_unavailable: "This plan is no longer available.",
  nothing_to_collect: "Nothing to collect yet.",
  bad_stake_amount: "Amount is outside this plan's limits.",
  pool_full: "This staking plan is full right now.",
  too_many_stakes: "You have too many active stakes.",
  stake_not_ready: "This stake hasn't matured yet.",
  ret_claimed: "Already claimed.",
  ret_not_ready: "Not ready to claim yet.",
  ret_disabled: "This feature is turned off right now.",
  max_freezes: "You already have the maximum number of streak freezes.",
  already_claimed_today: "You've already claimed today's reward.",
  daily_disabled: "Daily rewards are paused.",
  promo_invalid: "That promo code isn't valid.",
  promo_expired: "This promo code has expired.",
  promo_exhausted: "This promo code has been fully used.",
  promo_used: "You've already used this promo code.",
  no_spins: "No spins left right now. Watch an ad or come back tomorrow.",
  spin_disabled: "Lucky Spin is paused.",
  ads_disabled: "Ads are unavailable right now.",
  ads_limit: "You've reached today's limit for this.",
  ad_invalid: "That ad couldn't be verified. Please try again.",
  ad_too_fast: "Please watch the full ad.",
  ad_unverified: "We couldn't verify the ad yet. Try again in a moment.",
  alerts_full: "You've reached the alert limit. Remove one first.",
  alert_too_close: "Pick a price a little further from the current price.",
  bad_price: "Enter a valid price.",
  orders_full: "You've reached the open order limit. Cancel one first.",
  orders_disabled: "Limit orders are unavailable right now.",
  limit_wrong_side: "Sell limits must be above the current price; buy limits below it.",
  order_not_open: "This order is no longer open.",
  "Too fast": "Slow down a little.",
  "Not enough energy": "Out of energy. It refills over time.",
  "Too many requests": "Too many requests. Please wait a moment.",
  "Already claimed": "You've already claimed this reward.",
  "Too early": "Please wait a bit longer.",
  "Session expired, reopen the app": "Session expired. Please reopen the app.",
};

/** error code → friendly English message */
export function errText(e: any): string {
  const m = String(e?.message || "");
  try { sessionStorage.setItem("last_err", m.slice(0, 60)); } catch {}
  if (m.startsWith("feature_off:")) return m.slice(12) || "This feature is temporarily unavailable.";
  if (ERR[m]) return ERR[m];
  if (m === "network" || e?.status === 0) return "No connection. Check your internet and try again.";
  if (e?.status === 401) return "Session expired. Please reopen the app.";
  if (e?.status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (e?.status >= 500) return "We're having trouble right now. Please try again in a moment.";
  if (/^[A-Z][^_]{8,110}[.!]?$/.test(m) && /\s/.test(m) && !/^Error \d+/.test(m)) return m; // already a readable server sentence
  return /^[a-z][a-z0-9_:]{2,40}$/.test(m) ? `Something went wrong (${m}). Please try again.` : "Something went wrong. Please try again.";
}

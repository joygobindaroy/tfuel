import { HttpError } from "./auth";
import type { Settings } from "./settings";

export interface Feature { key: string; label: string; group: string; flag?: keyof Settings }

/** Every switchable feature. `flag` = existing boolean in settings; without it the switch is a pure "off + message" switch (settings.feature_off). */
export const FEATURES: Feature[] = [
  { key: "daily", label: "Daily reward", group: "Earn", flag: "daily_enabled" },
  { key: "spin", label: "Lucky Spin", group: "Earn", flag: "spin_enabled" },
  { key: "mining", label: "Auto-mining collect", group: "Earn" },
  { key: "ads", label: "Rewarded ads", group: "Earn", flag: "ads_enabled" },
  { key: "promo", label: "Promo codes", group: "Earn" },
  { key: "referral", label: "Referral program", group: "Earn", flag: "referral_enabled" },
  { key: "streak_freeze", label: "Streak freeze", group: "Retention", flag: "streak_freeze_enabled" },
  { key: "achievements", label: "Achievements", group: "Retention", flag: "ach_enabled" },
  { key: "comeback", label: "Comeback bonus", group: "Retention", flag: "comeback_enabled" },
  { key: "weekly", label: "Weekly challenge", group: "Retention", flag: "weekly_enabled" },
  { key: "anniversary", label: "Anniversary bonus", group: "Retention", flag: "anniv_enabled" },
  { key: "leaderboard", label: "Leaderboard", group: "Social", flag: "lb_enabled" },
  { key: "send", label: "Send TFUEL", group: "Wallet", flag: "send_enabled" },
  { key: "deposit", label: "Deposits", group: "Wallet", flag: "deposit_enabled" },
  { key: "stars", label: "Telegram Stars deposit", group: "Wallet", flag: "stars_enabled" },
  { key: "binance_id", label: "Binance ID deposit", group: "Wallet", flag: "binance_id_enabled" },
  { key: "withdraw", label: "TFUEL withdrawals", group: "Wallet", flag: "withdraw_enabled" },
  { key: "payout", label: "USDT withdrawals", group: "Wallet", flag: "payout_enabled" },
  { key: "staking", label: "Staking", group: "Wallet" },
  { key: "trade", label: "Trading", group: "Market", flag: "trade_enabled" },
  { key: "orders", label: "Limit / stop orders", group: "Market", flag: "orders_enabled" },
  { key: "clans", label: "Clans & raid boss", group: "Social" },
  { key: "rigs", label: "Mining rigs", group: "Earn" },
  { key: "puzzle", label: "Daily word puzzle", group: "Earn" },
  { key: "collectibles", label: "Collectibles", group: "Spend" },
  { key: "autoconv", label: "Auto-convert", group: "Market" },
  { key: "shops", label: "Partner shops", group: "Spend", flag: "shops_enabled" },
  { key: "boosts", label: "Boost shop", group: "Spend" },
  { key: "email", label: "Email verification", group: "Security", flag: "email_enabled" },
  { key: "notify", label: "Bot notifications", group: "Messaging", flag: "notify_enabled" },
];

/** Is the feature on? (settings flag AND not switched off by the admin) */
export function featureOn(s: Settings, key: string): boolean {
  if (s.feature_off && Object.prototype.hasOwnProperty.call(s.feature_off, key)) return false;
  const f = FEATURES.find((x) => x.key === key);
  return f?.flag ? !!s[f.flag] : true;
}

/** Message to show when the admin switched it off (falls back to a generic one) */
export const featureMsg = (s: Settings, key: string) => s.feature_off?.[key] || "This feature is temporarily unavailable.";

/** Use in API routes: throws 503 "feature_off" (with the admin's message in the error text) */
export function requireFeature(s: Settings, key: string) {
  if (s.feature_off && Object.prototype.hasOwnProperty.call(s.feature_off, key)) throw new HttpError(503, `feature_off:${featureMsg(s, key)}`);
}

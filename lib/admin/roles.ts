import type { AdminRole } from "./types";

/**
 * Central role gate. super = everything. Others only the actions below (anything not listed is super-only → safe default).
 * Patterns are matched against body.action.
 */
const COMMON = [/^whoami$/, /^stats$/, /^getSettings$/];
const SUPPORT: RegExp[] = [...COMMON, /^support/, /^userNotes?$|^userNote|^userTag|^userDetail|^userSearch|^users$|^user$|^userFull|^userView/, /^ticket|^reply|^template|^supportTpl/];
const FINANCE: RegExp[] = [
  ...COMMON,
  /^(withdrawals|usdtWithdrawals|deposits|trades|payWithdrawal|rejectWithdrawal|approveDeposit|rejectDeposit|payUsdt|rejectUsdt|adjustUsdt|releaseHold|binanceStatus|binanceRecheck|marketStatus)$/,
  /^(ops|money|liab|queue|recon|pnl|finance|payout|bulkPay|bulkReject|withdraw)/i,
  /^user$|^users$|^userDetail|^userView|^userFull/,
];

export function roleAllows(role: AdminRole, action: string): boolean {
  if (role === "super") return true;
  const list = role === "support" ? SUPPORT : FINANCE;
  return list.some((r) => r.test(action));
}

/** Tabs each role sees in the admin shell */
export const ROLE_TABS: Record<AdminRole, string[] | "all"> = {
  super: "all",
  finance: ["dashboard", "withdrawals", "ops", "usdt", "users", "insights"],
  support: ["dashboard", "users", "support", "comms"],
};

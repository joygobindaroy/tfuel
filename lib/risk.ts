import { db } from "./firebase";
import { getCfg2 } from "./cfg2";
import { lifetimeEarn } from "./retention";
import { alertAdmins } from "./adminalert";

export interface RiskRow { id: string; name: string; score: number; why: string[] }

/** Scores every account for suspicious patterns (admin Risk report and auto-ban use the same rules) */
export async function scanRisk(rateLimit = 30000): Promise<{ rows: RiskRow[]; scanned: number }> {
  const users = ((await db().ref("users").get()).val() || {}) as Record<string, any>;
  const prefs = ((await db().ref("user_prefs").get()).val() || {}) as Record<string, any>;
  const ok = ((await db().ref("risk_ok").get()).val() || {}) as Record<string, any>;
  const now = Date.now();
  const rows: RiskRow[] = [];
  for (const [id, u] of Object.entries(users)) {
    if (u.banned || ok[id]) continue;
    const why: string[] = [];
    let score = 0;
    const life = lifetimeEarn(u);
    const hrs = Math.max(1, (now - (u.created_at || now)) / 3600000);
    const rate = life / hrs;
    if (u.bot_flagged) { why.push("auto-tap flagged"); score += 3; }
    if ((prefs[id]?.ip_shared || 0) >= 3) { why.push(`IP shared with ${prefs[id].ip_shared} accounts`); score += 2; }
    if (hrs >= 6 && rate > Math.max(1, rateLimit)) { why.push(`earns ${Math.round(rate).toLocaleString("en-US")} coins/hour`); score += 2; }
    if ((u.ref_count || 0) >= 5 && (u.ref_earned || 0) > 0 && life < (u.ref_earned || 0) * 2) { why.push("mostly referral income"); score += 1; }
    if (hrs < 48 && Object.keys(u.usdt_withdrawals || {}).length > 0) { why.push("withdrew within 2 days"); score += 1; }
    if (score >= 2) rows.push({ id, name: u.name || "", score, why });
  }
  rows.sort((x, y) => y.score - x.score);
  return { rows, scanned: Object.keys(users).length };
}

/** Cron: freezes money-out (or only flags) accounts whose risk score reaches the admin's limit. Never touches an account an admin cleared. */
export async function runAutoBan(): Promise<number> {
  const cfg = await getCfg2();
  if (!cfg.autoban.enabled) return 0;
  const { rows } = await scanRisk();
  const done = ((await db().ref("risk_auto").get()).val() || {}) as Record<string, any>;
  let n = 0;
  for (const r of rows) {
    if (n >= cfg.autoban.max_per_run) break;
    if (r.score < cfg.autoban.min_score || done[r.id]) continue;
    const reason = `Auto: ${r.why.join("; ")}`.slice(0, 200);
    const upd: Record<string, any> = { [`risk_auto/${r.id}`]: { at: Date.now(), score: r.score, action: cfg.autoban.action } };
    if (cfg.autoban.action === "freeze" && !(await db().ref(`frozen/${r.id}`).get()).exists()) upd[`frozen/${r.id}`] = { reason, by: "auto-risk", at: Date.now() };
    await db().ref().update(upd);
    n++;
  }
  if (n > 0) await alertAdmins("error", `Risk rules ${cfg.autoban.action === "freeze" ? "froze money-out for" : "flagged"} ${n} account(s). Review in Admin → Growth & Games → Risk report.`);
  return n;
}

/** Admin cleared an account: unfreeze (if frozen automatically) and never auto-act on it again */
export async function riskClear(uid: string) {
  const f = (await db().ref(`frozen/${uid}`).get()).val();
  await db().ref().update({ [`risk_ok/${uid}`]: Date.now(), [`risk_auto/${uid}`]: null, ...(f && f.by === "auto-risk" ? { [`frozen/${uid}`]: null } : {}) });
}

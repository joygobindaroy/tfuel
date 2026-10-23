import { db } from "./firebase";
import { sha256 } from "./crypto";
import { getCfg2 } from "./cfg2";
import { alertAdmins } from "./adminalert";

/** Country / shared-IP rules → extra HOLD reasons for withdrawals */
export async function geoHold(uid: string): Promise<string> {
  try {
    const cfg = await getCfg2();
    const p = ((await db().ref(`user_prefs/${uid}`).get()).val() || {}) as any;
    const why: string[] = [];
    const cc = String(p.geo?.cc || "").toUpperCase();
    if (cc && cfg.geo.hold_countries.includes(cc)) why.push(`country ${cc} needs review`);
    if (p.ip_shared && cfg.geo.ip_action === "hold") why.push(`IP shared with ${p.ip_shared} accounts`);
    return why.join("; ");
  } catch { return ""; }
}

/** Remember which accounts use an IP; too many accounts on one IP → flag (and optionally HOLD withdrawals) */
export async function trackIp(uid: string, ip: string) {
  try {
    if (!ip) return;
    const cfg = await getCfg2();
    if (!(cfg.geo.ip_limit > 0)) return;
    const key = sha256(ip).slice(0, 16);
    await db().ref(`ip_idx/${key}/${uid}`).set(Date.now());
    const ids = Object.keys(((await db().ref(`ip_idx/${key}`).get()).val() || {}) as Record<string, number>);
    if (ids.length <= cfg.geo.ip_limit) return;
    const up: Record<string, any> = {};
    for (const id of ids) up[`user_prefs/${id}/ip_shared`] = ids.length;
    await db().ref().update(up);
    const seen = await db().ref(`ip_alerted/${key}`).transaction((c: number | null) => (c === null ? Date.now() : undefined));
    if (seen.committed) await alertAdmins("error", `Shared IP: ${ids.length} accounts use the same IP (limit ${cfg.geo.ip_limit}). Open Admin → Growth → Trust to review.`);
  } catch {}
}

/** Admin: groups of accounts sharing an IP */
export async function sharedIpGroups() {
  const all = ((await db().ref("ip_idx").get()).val() || {}) as Record<string, Record<string, number>>;
  const cfg = await getCfg2();
  const lim = Math.max(1, cfg.geo.ip_limit || 1);
  return Object.entries(all).filter(([, v]) => Object.keys(v).length > lim).map(([k, v]) => ({ key: k, users: Object.keys(v) })).slice(0, 100);
}

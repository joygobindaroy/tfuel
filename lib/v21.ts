import { db } from "./firebase";
import { HttpError } from "./auth";
import { checkPin } from "./prefs";
import { getRefCode } from "./refcode";
import { top, names } from "./leaderboard";
import { getCfg2 } from "./cfg2";
import { alertTargets } from "./adminalert";
import { tgCall } from "./telegram";
import { dayKey } from "./log";
import { weekIndex } from "./wallet";

const val = async (path: string) => (await db().ref(path).get()).val();

/** Everything we hold about the person, as one JSON file (no secrets: PIN hash, e-mail code hashes, device hashes are left out). */
export async function exportData(uid: string) {
  const [u, xf, ref, contacts, prefs, email] = await Promise.all([val(`users/${uid}`), val(`user_xfers/${uid}`), val(`referrals/${uid}`), val(`contacts/${uid}`), val(`user_prefs/${uid}`), val(`user_prefs/${uid}/email`)]);
  const { pin, devices, refcode, ...rest } = (prefs || {}) as any;
  const user = { ...(u || {}) } as any;
  delete user.devices; delete user.ip; delete user.bot_score;
  return { exported_at: new Date().toISOString(), id: uid, refcode: await getRefCode(uid).catch(() => ""), email: email?.addr || null, account: user, settings: { ...rest, email: undefined }, transfers: xf || {}, invited_friends: ref || {}, contacts: contacts || {} };
}

const pending = (m: any) => Object.values((m || {}) as Record<string, any>).some((w: any) => ["pending", "processing", "queued", "held"].includes(String(w?.status || "")));

/** Delete account: removes personal data and locks the account for good. Balance is forfeited (the person must confirm). */
export async function deleteAccount(uid: string, pin: unknown, confirm: string, ack: boolean) {
  if (confirm !== "DELETE" || !ack) throw new HttpError(400, "Type DELETE and tick the box to continue.");
  await checkPin(uid, pin);
  const u = (await val(`users/${uid}`)) as any;
  if (!u) throw new HttpError(404, "Account not found");
  if (pending(u.withdrawals) || pending(u.usdt_withdrawals)) throw new HttpError(409, "You still have a withdrawal in progress. Wait until it finishes, then try again.");
  const code = await getRefCode(uid).catch(() => "");
  const upd: Record<string, any> = {
    [`users/${uid}/banned`]: true, [`users/${uid}/deleted_at`]: Date.now(), [`users/${uid}/name`]: "Deleted user", [`users/${uid}/username`]: null,
    [`user_prefs/${uid}/email`]: null, [`user_prefs/${uid}/pin`]: null, [`user_prefs/${uid}/nick`]: null, [`user_prefs/${uid}/addresses`]: null,
    [`user_prefs/${uid}/pv`]: null, [`weekly_users/${uid}`]: null, [`contacts/${uid}`]: null,
    [`deleted_accounts/${uid}`]: Date.now(),
  };
  if (code) upd[`contacts_hidden/${code}`] = true;
  await db().ref().update(upd);
}

type Node = { name: string; at: number; bonus: number; comm: number; kids?: number };
/** Two invite levels: the people I invited, and the people they invited, plus what I earned from level 1. */
export async function inviteTree(uid: string) {
  const l1 = ((await val(`referrals/${uid}`)) || {}) as Record<string, any>;
  const ids = Object.keys(l1).slice(0, 200);
  const out: (Node & { id: string; sub: Node[] })[] = [];
  let l2n = 0;
  for (const id of ids) {
    const sub = ((await val(`referrals/${id}`)) || {}) as Record<string, any>;
    const subs = Object.values(sub).slice(0, 20).map((x: any) => ({ name: String(x.name || "User").slice(0, 20), at: x.at || 0, bonus: 0, comm: 0 }));
    l2n += Object.keys(sub).length;
    out.push({ id, name: String(l1[id].name || "User").slice(0, 20), at: l1[id].at || 0, bonus: Number(l1[id].bonus) || 0, comm: Number(l1[id].comm) || 0, sub: subs });
  }
  out.sort((a, b) => b.comm + b.bonus - (a.comm + a.bonus));
  return { level1: out.slice(0, 50).map(({ id, ...r }) => r), n1: ids.length, n2: l2n, earned: out.reduce((a, x) => a + x.comm + x.bonus, 0) };
}

/** Leaderboard of only the people I invited, the person who invited me, and me. */
export async function friendsBoard(uid: string, board: "d" | "w" | "all") {
  const key = board === "d" ? `d_${dayKey(Date.now())}` : board === "all" ? "all" : `w_${weekIndex(Date.now())}`;
  const kids = Object.keys(((await val(`referrals/${uid}`)) || {}) as object);
  const by = (await val(`users/${uid}/referred_by`)) as string | null;
  const ids = Array.from(new Set([uid, ...kids, ...(by ? [by] : [])])).slice(0, 300);
  const vals = await Promise.all(ids.map(async (id) => ({ id, v: Number(await val(`lb/${key}/${id}`)) || 0 })));
  const t = vals.sort((a, b) => b.v - a.v).slice(0, 20);
  const nm = await names(t.map((x) => x.id));
  return t.map((x, i) => ({ rank: i + 1, name: nm[x.id], v: x.v, me: x.id === uid }));
}

/** Once a day: what the admins changed in the last 24 hours, sent to the admin chat(s). */
export async function runAdminDigest(): Promise<number> {
  const c = await getCfg2();
  if (!c.v21.digest) return 0;
  const day = dayKey(Date.now());
  const g = await db().ref("stats/digest_day").transaction((x: string | null) => (x === day ? undefined : day));
  if (!g.committed) return 0;
  const since = Date.now() - 864e5;
  let rows: any[] = [];
  try { rows = Object.values(((await db().ref("admin_logs").orderByKey().limitToLast(400).get()).val() || {}) as Record<string, any>); }
  catch { rows = Object.values(((await db().ref("admin_logs").get()).val() || {}) as Record<string, any>); }
  rows = rows.filter((r) => r.at >= since);
  if (!rows.length) return 0;
  const who = new Map<string, Map<string, number>>();
  for (const r of rows) { const m = who.get(String(r.by)) || new Map(); m.set(String(r.action), (m.get(String(r.action)) || 0) + 1); who.set(String(r.by), m); }
  const lines = [...who.entries()].map(([by, m]) => `• ${by}: ${[...m.entries()].map(([a, n]) => `${a}${n > 1 ? " ×" + n : ""}`).join(", ")}`);
  const text = `📋 Admin activity, last 24 h (${rows.length} changes)\n${lines.join("\n")}`.slice(0, 3500);
  let n = 0;
  for (const chat of alertTargets("").slice(0, 3)) { await tgCall("sendMessage", { chat_id: chat, text, disable_web_page_preview: "true" }).catch(() => {}); n++; }
  return n;
}

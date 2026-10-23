import { ServerValue } from "firebase-admin/database";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { sortableId } from "./crypto";
import { getCfg2 } from "./cfg2";
import { weekIndex, weekStart } from "./wallet";
import { top } from "./leaderboard";
import { chargeCoins, creditCoins } from "./coins";
import { notify } from "./notify";

const memo = new Map<string, { at: number; id: string }>();
export const clanOf = async (uid: string): Promise<string> => {
  const m = memo.get(uid);
  if (m && Date.now() - m.at < 60000) return m.id;
  const id = String((await db().ref(`users/${uid}/clan`).get()).val() || "");
  memo.set(uid, { at: Date.now(), id });
  if (memo.size > 20000) memo.clear();
  return id;
};
const setMemo = (uid: string, id: string) => memo.set(uid, { at: Date.now(), id });

/** called from lbAdd: every coin a member earns counts for the clan's weekly score */
export async function clanAdd(uid: string, coins: number) {
  try {
    const id = await clanOf(uid);
    if (!id) return;
    const w = weekIndex();
    await db().ref().update({ [`lb/clan_w_${w}/${id}`]: ServerValue.increment(coins), [`clan_w/${id}/${w}/${uid}`]: ServerValue.increment(coins) });
  } catch {}
}

const nameOk = (v: any) => String(v ?? "").replace(/\s+/g, " ").trim();
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 _.-]{2,19}$/;
const TAG_RE = /^[A-Za-z0-9]{2,5}$/;

export async function clanCreate(uid: string, nameIn: any, tagIn: any) {
  const cfg = await getCfg2();
  if (!cfg.clan.enabled) throw new HttpError(403, "feature_off");
  const name = nameOk(nameIn), tag = String(tagIn || "").trim().toUpperCase();
  if (!NAME_RE.test(name)) throw new HttpError(400, "clan_bad_name");
  if (!TAG_RE.test(tag)) throw new HttpError(400, "clan_bad_tag");
  if (await clanOf(uid)) throw new HttpError(409, "clan_already");
  const id = sortableId().slice(-10);
  const nk = name.toLowerCase().replace(/\s+/g, "_");
  const got = await db().ref(`clan_names/${nk}`).transaction((c: string | null) => (c === null ? id : undefined));
  if (!got.committed) throw new HttpError(409, "clan_name_taken");
  try {
    if (cfg.clan.create_cost > 0) await chargeCoins(uid, cfg.clan.create_cost, "shop", (cur: any) => (cur.clan ? "clan_already" : null));
    const u = (await db().ref(`users/${uid}/name`).get()).val();
    await db().ref().update({
      [`clans/${id}`]: { name, tag, owner: uid, owner_name: String(u || "").slice(0, 24), created_at: Date.now(), members: 1 },
      [`clan_members/${id}/${uid}`]: Date.now(),
      [`users/${uid}/clan`]: id,
    });
    setMemo(uid, id);
  } catch (e) { await db().ref(`clan_names/${nk}`).remove().catch(() => {}); throw e; }
  return id;
}

export async function clanJoin(uid: string, id: string) {
  const cfg = await getCfg2();
  if (!cfg.clan.enabled) throw new HttpError(403, "feature_off");
  if (!/^[\w-]{3,20}$/.test(id)) throw new HttpError(400, "bad_request");
  if (await clanOf(uid)) throw new HttpError(409, "clan_already");
  let err = "";
  await db().ref(`clans/${id}`).transaction((c: any) => {
    err = "";
    if (c === null) return c;
    if ((c.members || 0) >= cfg.clan.max_members) { err = "clan_full"; return; }
    c.members = (c.members || 0) + 1;
    return c;
  });
  if (err) throw new HttpError(409, err);
  if (!(await db().ref(`clans/${id}`).get()).exists()) throw new HttpError(404, "not_found");
  await db().ref().update({ [`clan_members/${id}/${uid}`]: Date.now(), [`users/${uid}/clan`]: id });
  setMemo(uid, id);
}

async function removeMember(id: string, uid: string) {
  await db().ref().update({ [`clan_members/${id}/${uid}`]: null, [`users/${uid}/clan`]: null });
  await db().ref(`clans/${id}/members`).transaction((n: number | null) => Math.max(0, (n || 1) - 1));
  setMemo(uid, "");
}
export async function clanLeave(uid: string) {
  const id = await clanOf(uid);
  if (!id) throw new HttpError(409, "clan_none");
  const c = (await db().ref(`clans/${id}`).get()).val();
  const members = Object.entries(((await db().ref(`clan_members/${id}`).get()).val() || {}) as Record<string, number>).sort((a, b) => a[1] - b[1]);
  await removeMember(id, uid);
  if (c?.owner === uid) {
    const next = members.find(([m]) => m !== uid);
    if (next) await db().ref(`clans/${id}`).update({ owner: next[0] });
    else {
      await db().ref().update({ [`clans/${id}`]: null, [`clan_members/${id}`]: null, [`clan_names/${String(c.name).toLowerCase().replace(/\s+/g, "_")}`]: null });
    }
  }
}
export async function clanKick(uid: string, target: string) {
  const id = await clanOf(uid);
  const c = id ? (await db().ref(`clans/${id}`).get()).val() : null;
  if (!c || c.owner !== uid) throw new HttpError(403, "clan_owner_only");
  if (target === uid || !(await db().ref(`clan_members/${id}/${target}`).get()).exists()) throw new HttpError(400, "bad_request");
  await removeMember(id, target);
  await notify(target, "👥 You were removed from your clan.");
}

export function bossInfo(cfg: Awaited<ReturnType<typeof getCfg2>>, members: number, score: number) {
  const b = cfg.clan.boss;
  if (!b.enabled) return null;
  const hp = b.hp_base + b.hp_per_member * members;
  return { name: b.name, emoji: b.emoji, hp, damage: Math.min(score, hp), pct: Math.min(100, Math.floor((score / hp) * 100)), defeated: score >= hp, reward: b.reward };
}

export async function clanView(uid: string) {
  const cfg = await getCfg2();
  const w = weekIndex();
  const id = await clanOf(uid);
  const topClans = await top(`clan_w_${w}`, 10);
  let all: Record<string, any>;
  try { all = ((await db().ref("clans").orderByChild("members").limitToLast(30).get()).val() || {}) as Record<string, any>; }
  catch { all = Object.fromEntries(Object.entries(((await db().ref("clans").get()).val() || {}) as Record<string, any>).sort(([, a], [, b]) => (b.members || 0) - (a.members || 0)).slice(0, 30)); }
  for (const t of topClans) if (!all[t.id]) { const c = (await db().ref(`clans/${t.id}`).get()).val(); if (c) all[t.id] = { ...c, _x: 1 }; }
  const list = Object.entries(all).filter(([, c]) => !c._x).map(([cid, c]) => ({ id: cid, name: c.name, tag: c.tag, members: c.members || 0, full: (c.members || 0) >= cfg.clan.max_members })).sort((a, b) => b.members - a.members);
  const ranks = topClans.map((t, i) => ({ rank: i + 1, id: t.id, name: all[t.id]?.name, tag: all[t.id]?.tag, v: t.v }));
  const out: any = { enabled: cfg.clan.enabled, createCost: cfg.clan.create_cost, maxMembers: cfg.clan.max_members, prizes: cfg.clan.prizes, list, ranks, endsAt: weekStart(w + 1), mine: null };
  if (id) {
    const c = (await db().ref(`clans/${id}`).get()).val();
    if (!c) { await db().ref(`users/${uid}/clan`).remove(); setMemo(uid, ""); return out; }
    const mem = ((await db().ref(`clan_members/${id}`).get()).val() || {}) as Record<string, number>;
    const contrib = ((await db().ref(`clan_w/${id}/${w}`).get()).val() || {}) as Record<string, number>;
    const names = await Promise.all(Object.keys(mem).map(async (m) => [m, String((await db().ref(`users/${m}/name`).get()).val() || "Player").slice(0, 20)] as const));
    const score = Number((await db().ref(`lb/clan_w_${w}/${id}`).get()).val()) || 0;
    const claimed = !!(await db().ref(`clan_boss_claim/${w}/${uid}`).get()).val();
    const rank = topClans.findIndex((t) => t.id === id);
    out.mine = {
      id, name: c.name, tag: c.tag, owner: c.owner === uid, members: Object.keys(mem).length, score, rank: rank >= 0 ? rank + 1 : null,
      roster: names.map(([m, n]) => ({ id: m, name: n, v: contrib[m] || 0, owner: m === c.owner, me: m === uid })).sort((a, b) => b.v - a.v),
      boss: bossInfo(cfg, Object.keys(mem).length, score), bossClaimed: claimed, myContribution: contrib[uid] || 0,
    };
  }
  return out;
}

export async function bossClaim(uid: string) {
  const cfg = await getCfg2();
  const v = await clanView(uid);
  const m = v.mine;
  if (!m?.boss?.defeated) throw new HttpError(409, "boss_alive");
  if (!(m.myContribution > 0)) throw new HttpError(409, "boss_no_damage");
  const w = weekIndex();
  const r = await db().ref(`clan_boss_claim/${w}/${uid}`).transaction((c: number | null) => (c === null ? Date.now() : undefined));
  if (!r.committed) throw new HttpError(409, "already_claimed");
  const ok = await creditCoins(uid, cfg.clan.boss.reward, "prize", "prize", `${cfg.clan.boss.name} defeated`, false);
  if (!ok) await db().ref(`clan_boss_claim/${w}/${uid}`).remove();
  return cfg.clan.boss.reward;
}

/** Cron: last week's top clans — each prize is split between the members who contributed (once per week) */
export async function payClanWeek(idx = weekIndex() - 1): Promise<number> {
  const cfg = await getCfg2();
  if (!cfg.clan.enabled || !cfg.clan.prizes.length || idx < 0) return 0;
  let first = false;
  await db().ref(`lb_paid/clan_w_${idx}`).transaction((c: number | null) => { first = c === null; return c === null ? Date.now() : undefined; });
  if (!first) return 0;
  const t = (await top(`clan_w_${idx}`, cfg.clan.prizes.length)).filter((x) => x.v > 0);
  let n = 0;
  for (let i = 0; i < t.length; i++) {
    const contrib = ((await db().ref(`clan_w/${t[i].id}/${idx}`).get()).val() || {}) as Record<string, number>;
    const ids = Object.keys(contrib).filter((k) => contrib[k] > 0);
    if (!ids.length) continue;
    const each = Math.floor(cfg.clan.prizes[i] / ids.length);
    for (const uid of ids) if (await creditCoins(uid, each, "prize", "prize", `Clan rank #${i + 1}`, false)) { n++; await notify(uid, `🏆 Your clan finished #${i + 1} last week! +${each} coins were added.`); }
  }
  return n;
}

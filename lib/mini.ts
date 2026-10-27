import crypto from "crypto";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2 } from "./cfg2";
import { getSettings } from "./settings";
import { dayKey } from "./log";
import { creditCoins } from "./coins";
import { displayName } from "./transfer";
import { notify } from "./notify";
import { sortableId } from "./crypto";
import { questTick, questView } from "./plus";
import { tgCall } from "./telegram";
import { appBase } from "./mailtpl";
import { winUrl } from "./cardsig";

/* Free-to-play mini games: no stake, small coin rewards, daily limits (set in Admin → Growth & Games → Mini games). */
const SYMS = ["🚀", "💎", "🔥", "⭐", "🍀", "🎯", "🧩", "🏆", "🎲", "🌙"];
const rnd = (n: number) => crypto.randomInt(0, n);
const shuffle = <T,>(a: T[]) => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = rnd(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };

async function useToday(uid: string, game: "memory" | "trivia" | "hunt", max: number): Promise<void> {
  let over = false;
  await db().ref(`mini_day/${uid}/${dayKey()}/${game}`).transaction((c: number | null) => {
    over = false;
    if ((c || 0) >= max) { over = true; return; }
    return (c || 0) + 1;
  });
  if (over) throw new HttpError(429, "mini_limit");
}

export async function miniView(uid: string) {
  const c = (await getCfg2()).mini;
  if (!c.enabled) return { enabled: false };
  const day = ((await db().ref(`mini_day/${uid}/${dayKey()}`).get()).val() || {}) as Record<string, number>;
  const tours = await tourList(uid);
  return {
    enabled: true,
    memory: c.memory.enabled ? { reward: c.memory.reward, pairs: c.memory.pairs, max_moves: c.memory.max_moves, left: Math.max(0, c.memory.per_day - (day.memory || 0)) } : null,
    trivia: c.trivia.enabled ? { per_correct: c.trivia.per_correct, rounds: c.trivia.rounds, left: Math.max(0, c.trivia.per_day - (day.trivia || 0)) } : null,
    hunt: c.hunt.enabled ? { min: c.hunt.min, max: c.hunt.max, left: Math.max(0, c.hunt.per_day - (day.hunt || 0)) } : null,
    tours,
    quest: await questView(uid).catch(() => null),
  };
}

/* ───────── Memory match: the server keeps the board, the phone only asks to flip a card ───────── */
interface MemSess { id: string; layout: string[]; open: number | null; matched: number[]; moves: number; start: number; done: boolean }
export async function memStart(uid: string) {
  const c = (await getCfg2()).mini;
  if (!c.enabled || !c.memory.enabled) throw new HttpError(403, "feature_off");
  const old = (await db().ref(`mini_sess/${uid}/mem`).get()).val() as MemSess | null;
  if (old && !old.done && Date.now() - old.start < 10 * 60000) return { id: old.id, cards: old.layout.length, matched: old.matched, moves: old.moves, symbols: old.matched.map((i) => [i, old.layout[i]]) };
  await useToday(uid, "memory", c.memory.per_day);
  const syms = shuffle(SYMS).slice(0, c.memory.pairs);
  const s: MemSess = { id: sortableId(), layout: shuffle([...syms, ...syms]), open: null, matched: [], moves: 0, start: Date.now(), done: false };
  await db().ref(`mini_sess/${uid}/mem`).set(s);
  return { id: s.id, cards: s.layout.length, matched: [], moves: 0, symbols: [] };
}
export async function memFlip(uid: string, id: string, idx: number) {
  const c = (await getCfg2()).mini;
  const s = (await db().ref(`mini_sess/${uid}/mem`).get()).val() as MemSess | null;
  if (!s || s.id !== id || s.done) throw new HttpError(409, "mini_no_game");
  s.matched = s.matched || [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= s.layout.length || s.matched.includes(idx) || s.open === idx) throw new HttpError(400, "bad_request");
  const sym = s.layout[idx];
  if (s.open === null || s.open === undefined) {
    await db().ref(`mini_sess/${uid}/mem/open`).set(idx);
    return { sym, phase: "first" as const };
  }
  const first = s.open;
  const match = s.layout[first] === sym;
  const moves = (s.moves || 0) + 1;
  const matched = match ? [...s.matched, first, idx] : s.matched;
  const finished = matched.length === s.layout.length;
  await db().ref(`mini_sess/${uid}/mem`).update({ open: null, moves, matched, done: finished });
  if (!finished) return { sym, phase: "second" as const, match, first, firstSym: s.layout[first], moves };
  const ms = Date.now() - s.start;
  const pairs = s.layout.length / 2;
  const tooFast = ms < pairs * 1500;
  const reward = tooFast ? 0 : moves <= c.memory.max_moves ? c.memory.reward : Math.max(Math.floor(c.memory.reward * 0.25), Math.floor((c.memory.reward * c.memory.max_moves) / moves));
  if (reward > 0) await creditCoins(uid, reward, "tasks", "game", "Memory match");
  await tourScore(uid, "memory", { moves, ms });
  const quest = await questTick(uid).catch(() => null);
  return { sym, phase: "done" as const, match, first, firstSym: s.layout[first], moves, ms, reward, quest };
}

/* ───────── Crypto trivia ───────── */
interface TriSess { id: string; qs: number[]; ord: number[][]; i: number; correct: number; start: number; done: boolean }
const qView = (q: { q: string; a: string[] }, ord: number[]) => ({ q: q.q, opts: ord.map((k) => q.a[k]) });
export async function triStart(uid: string) {
  const c = (await getCfg2()).mini;
  if (!c.enabled || !c.trivia.enabled) throw new HttpError(403, "feature_off");
  const qs = c.trivia.questions;
  const old = (await db().ref(`mini_sess/${uid}/tri`).get()).val() as TriSess | null;
  if (old && !old.done && Date.now() - old.start < 15 * 60000) return { id: old.id, n: old.qs.length, i: old.i, ...qView(qs[old.qs[old.i]], old.ord[old.i]) };
  await useToday(uid, "trivia", c.trivia.per_day);
  const pick = shuffle(qs.map((_, i) => i)).slice(0, Math.min(c.trivia.rounds, qs.length));
  const ord = pick.map((qi) => shuffle(qs[qi].a.map((_, k) => k)));
  const s: TriSess = { id: sortableId(), qs: pick, ord, i: 0, correct: 0, start: Date.now(), done: false };
  await db().ref(`mini_sess/${uid}/tri`).set(s);
  return { id: s.id, n: pick.length, i: 0, ...qView(qs[pick[0]], ord[0]) };
}
export async function triAnswer(uid: string, id: string, choice: number) {
  const c = (await getCfg2()).mini;
  const s = (await db().ref(`mini_sess/${uid}/tri`).get()).val() as TriSess | null;
  if (!s || s.id !== id || s.done) throw new HttpError(409, "mini_no_game");
  const q = c.trivia.questions[s.qs[s.i]];
  if (!q || !Number.isInteger(choice) || choice < 0 || choice >= s.ord[s.i].length) throw new HttpError(400, "bad_request");
  const right = s.ord[s.i][choice] === q.c;
  const rightIdx = s.ord[s.i].findIndex((k) => k === q.c);
  const correct = s.correct + (right ? 1 : 0);
  const i = s.i + 1;
  const done = i >= s.qs.length;
  await db().ref(`mini_sess/${uid}/tri`).update({ i, correct, done });
  if (!done) return { right, answer: rightIdx, correct, next: { i, n: s.qs.length, ...qView(c.trivia.questions[s.qs[i]], s.ord[i]) } };
  const ms = Date.now() - s.start;
  const reward = ms < s.qs.length * 1200 ? 0 : correct * c.trivia.per_correct;
  if (reward > 0) await creditCoins(uid, reward, "tasks", "game", "Crypto trivia");
  await tourScore(uid, "trivia", { correct, ms });
  const quest = await questTick(uid).catch(() => null);
  return { right, answer: rightIdx, correct, done: true, n: s.qs.length, reward, quest };
}

/* ───────── Treasure hunt (free picks, small prize) ───────── */
export async function huntPlay(uid: string, tile: number) {
  const c = (await getCfg2()).mini;
  if (!c.enabled || !c.hunt.enabled) throw new HttpError(403, "feature_off");
  if (!Number.isInteger(tile) || tile < 0 || tile > 8) throw new HttpError(400, "bad_request");
  await useToday(uid, "hunt", c.hunt.per_day);
  const empty = rnd(100) < 20;
  const reward = empty ? 0 : c.hunt.min + rnd(Math.max(1, c.hunt.max - c.hunt.min + 1));
  const board = Array.from({ length: 9 }, (_, i) => (i === tile ? reward : rnd(100) < 25 ? 0 : c.hunt.min + rnd(Math.max(1, c.hunt.max - c.hunt.min + 1))));
  if (reward > 0) await creditCoins(uid, reward, "tasks", "game", "Treasure hunt");
  const quest = await questTick(uid).catch(() => null);
  return { reward, board, quest };
}

/* ───────── Free-entry tournaments (prize pool paid by the platform) ───────── */
export interface Tour { title: string; game: "memory" | "trivia"; start: number; end: number; prizes: number[]; paid?: boolean; cancelled?: boolean; created: number }
const tourScoreNum = (game: string, r: { moves?: number; ms: number; correct?: number }) => (game === "memory" ? (1000 - Math.min(999, r.moves || 999)) * 1e7 - Math.min(9999999, r.ms) : (r.correct || 0) * 1e7 - Math.min(9999999, r.ms));
async function tourScore(uid: string, game: "memory" | "trivia", r: { moves?: number; ms: number; correct?: number }) {
  const all = ((await db().ref("tournaments").get()).val() || {}) as Record<string, Tour>;
  const now = Date.now();
  for (const [id, t] of Object.entries(all)) {
    if (t.game !== game || t.cancelled || t.paid || now < t.start || now > t.end) continue;
    if (!(await db().ref(`tour_join/${id}/${uid}`).get()).exists()) continue;
    const score = tourScoreNum(game, r);
    await db().ref(`tour_score/${id}/${uid}`).transaction((c: any) => (c && c.score >= score ? undefined : { score, moves: r.moves ?? null, correct: r.correct ?? null, ms: r.ms, at: now }));
  }
}
export async function tourList(uid: string) {
  const all = ((await db().ref("tournaments").get()).val() || {}) as Record<string, Tour>;
  const now = Date.now();
  const out = [];
  for (const [id, t] of Object.entries(all)) {
    if (t.cancelled || (t.paid && now - t.end > 3 * 86400000)) continue;
    const joined = (await db().ref(`tour_join/${id}/${uid}`).get()).exists();
    const mine = (await db().ref(`tour_score/${id}/${uid}`).get()).val();
    out.push({ id, title: t.title, game: t.game, start: t.start, end: t.end, prizes: t.prizes, paid: !!t.paid, joined, mine: mine ? { moves: mine.moves, correct: mine.correct, ms: mine.ms } : null, state: now < t.start ? "soon" : now > t.end ? "ended" : "live" });
  }
  return out.sort((a, b) => a.end - b.end);
}
export async function tourJoin(uid: string, id: string) {
  const t = (await db().ref(`tournaments/${id}`).get()).val() as Tour | null;
  if (!t || t.cancelled) throw new HttpError(404, "not_found");
  if (Date.now() > t.end) throw new HttpError(409, "tour_over");
  await db().ref(`tour_join/${id}/${uid}`).set(Date.now());
}
export async function tourBoard(id: string) {
  const t = (await db().ref(`tournaments/${id}`).get()).val() as Tour | null;
  if (!t) throw new HttpError(404, "not_found");
  const sc = ((await db().ref(`tour_score/${id}`).get()).val() || {}) as Record<string, any>;
  const top = Object.entries(sc).sort((a, b) => b[1].score - a[1].score).slice(0, 20);
  const names = await Promise.all(top.map(([u]) => displayName(u)));
  return top.map(([u, v], i) => ({ rank: i + 1, name: names[i], moves: v.moves, correct: v.correct, ms: v.ms, prize: t.prizes[i] || 0, uid: u }));
}
/** cron: pay finished tournaments once */
export async function settleTours(): Promise<number> {
  const all = ((await db().ref("tournaments").get()).val() || {}) as Record<string, Tour>;
  let n = 0;
  for (const [id, t] of Object.entries(all)) {
    if (t.paid || t.cancelled || Date.now() < t.end) continue;
    const claim = await db().ref(`tournaments/${id}/paid`).transaction((c: boolean | null) => (c ? undefined : true));
    if (!claim.committed) continue;
    const board = await tourBoard(id);
    for (const r of board) {
      if (!r.prize) continue;
      await creditCoins(r.uid, r.prize, "prize", "prize", `Tournament: ${t.title} (#${r.rank})`).catch(() => {});
      await notify(r.uid, `🏆 You finished #${r.rank} in "${t.title}" and won ${r.prize.toLocaleString("en-US")} coins!`).catch(() => {});
      try {
        const base = appBase();
        if (base) await tgCall("sendPhoto", { chat_id: r.uid, photo: winUrl(base, t.title, r.rank, r.prize, r.name), caption: `🏆 #${r.rank} · ${t.title} — share your win!` });
      } catch {}
    }
    try {
      const top1 = board.find((r) => r.rank === 1 && r.prize);
      const base = appBase();
      if (top1 && base && (await getCfg2()).posts.winpost) {
        const st = await getSettings();
        if (st.autopost_channel) await tgCall("sendPhoto", { chat_id: st.autopost_channel, photo: winUrl(base, t.title, 1, top1.prize, top1.name), caption: `🏆 ${top1.name} won "${t.title}" — ${top1.prize.toLocaleString("en-US")} coins!` });
      }
    } catch {}
    n++;
  }
  return n;
}
/** cron: remind joined players one hour before a tournament ends */
export async function remindTours(): Promise<number> {
  const c = (await getCfg2()).plus;
  if (!c.tour_remind) return 0;
  const all = ((await db().ref("tournaments").get()).val() || {}) as Record<string, Tour & { reminded?: boolean }>;
  let n = 0;
  for (const [id, t] of Object.entries(all)) {
    if (t.paid || t.cancelled || t.reminded || t.end < Date.now() || t.end - Date.now() > 3600000) continue;
    const claim = await db().ref(`tournaments/${id}/reminded`).transaction((x: boolean | null) => (x ? undefined : true));
    if (!claim.committed) continue;
    const joined = Object.keys(((await db().ref(`tour_join/${id}`).get()).val() || {}));
    for (const u of joined) { await notify(u, `⏰ "${t.title}" ends in less than an hour. Play now to improve your score!`).catch(() => {}); n++; }
  }
  return n;
}
export async function tourSave(b: any): Promise<string> {
  const title = String(b.title || "").replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, 50);
  if (title.length < 3) throw new HttpError(400, "Title is required");
  const game = b.game === "trivia" ? "trivia" : "memory";
  const start = Number(b.start), end = Number(b.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= Math.max(start, Date.now())) throw new HttpError(400, "End time must be in the future, after the start");
  const prizes = (Array.isArray(b.prizes) ? b.prizes : String(b.prizes || "").split(/[\s,]+/)).map((x: any) => Math.floor(Number(x))).filter((x: number) => x > 0 && x <= 1e9).slice(0, 10);
  if (!prizes.length) throw new HttpError(400, "Enter at least one prize amount (coins)");
  const id = String(b.id || "") || sortableId();
  const cur = (await db().ref(`tournaments/${id}`).get()).val() as Tour | null;
  if (cur?.paid) throw new HttpError(409, "Already paid out");
  await db().ref(`tournaments/${id}`).set({ title, game, start, end, prizes, created: cur?.created || Date.now(), ...(cur?.cancelled ? { cancelled: true } : {}) });
  return id;
}
export async function tourCancel(id: string) { await db().ref(`tournaments/${id}/cancelled`).set(true); }
export async function tourAdminList() {
  const all = ((await db().ref("tournaments").get()).val() || {}) as Record<string, Tour>;
  const out = [];
  for (const [id, t] of Object.entries(all)) {
    const n = Object.keys(((await db().ref(`tour_join/${id}`).get()).val() || {})).length;
    out.push({ id, ...t, players: n });
  }
  return out.sort((a, b) => b.created - a.created).slice(0, 30);
}

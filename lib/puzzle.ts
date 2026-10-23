import crypto from "crypto";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { getCfg2 } from "./cfg2";
import { dayKey } from "./log";
import { creditCoins } from "./coins";

const secret = () => process.env.SERVER_SECRET || "dev";
/** Each user gets a different word each day (HMAC of uid+day), so answers can't be shared */
function pick(uid: string, day: string, words: string[]) {
  const h = crypto.createHmac("sha256", secret()).update(`pz:${uid}:${day}`).digest();
  const word = words[h.readUInt32BE(0) % words.length];
  const letters = word.split("");
  for (let i = letters.length - 1; i > 0; i--) { const j = h[4 + (i % 20)] % (i + 1); [letters[i], letters[j]] = [letters[j], letters[i]]; }
  let scr = letters.join("");
  if (scr === word) scr = word.slice(1) + word[0];
  return { word, scr };
}
interface St { tries: number; solved?: boolean }

export async function puzzleView(uid: string) {
  const cfg = await getCfg2();
  const day = dayKey();
  if (!cfg.puzzle.enabled || !cfg.puzzle.words.length) return { enabled: false };
  const st = ((await db().ref(`puzzle/${uid}/${day}`).get()).val() || { tries: 0 }) as St;
  const { word, scr } = pick(uid, day, cfg.puzzle.words);
  const left = Math.max(0, cfg.puzzle.tries - st.tries);
  return { enabled: true, reward: cfg.puzzle.reward, len: word.length, scr: scr.toUpperCase(), left, solved: !!st.solved, hint: st.tries >= 1 && !st.solved ? word[0].toUpperCase() : "", answer: !st.solved && left === 0 ? word.toUpperCase() : "" };
}

export async function puzzleGuess(uid: string, guess: any) {
  const cfg = await getCfg2();
  if (!cfg.puzzle.enabled || !cfg.puzzle.words.length) throw new HttpError(403, "feature_off");
  const g = String(guess || "").toLowerCase().replace(/[^a-z]/g, "");
  if (g.length < 2 || g.length > 12) throw new HttpError(400, "bad_request");
  const day = dayKey();
  const { word } = pick(uid, day, cfg.puzzle.words);
  let err = "";
  let ok = false;
  await db().ref(`puzzle/${uid}/${day}`).transaction((c: St | null) => {
    err = ""; ok = false;
    const s: St = c || { tries: 0 };
    if (s.solved) { err = "puzzle_done"; return; }
    if (s.tries >= cfg.puzzle.tries) { err = "puzzle_out"; return; }
    s.tries += 1;
    if (g === word) { s.solved = true; ok = true; }
    return s;
  });
  if (err) throw new HttpError(409, err);
  if (ok) await creditCoins(uid, cfg.puzzle.reward, "tasks", "task", "Daily word puzzle");
  return { correct: ok, reward: ok ? cfg.puzzle.reward : 0, view: await puzzleView(uid) };
}

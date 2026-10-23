import type { Settings } from "./settings";
import { getCfg2 } from "./cfg2";

const STOP = new Set("the a an and or to of is are was were be been do does did can could would should i me my we you your it its in on at for with how what when where why who which this that there from by as if so not no yes please hi hello hey tell about get give want need have has had will just".split(" "));
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");
const toks = (t: string) => t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);

/** Best FAQ entry for a question (keyword overlap; question words count double). Returns null when nothing is close enough. */
export function matchFaq(text: string, faq: { q: string; a: string }[], minScore: number): { q: string; a: string; score: number } | null {
  const t = new Set(toks(text));
  if (!t.size) return null;
  let best: { q: string; a: string; score: number } | null = null;
  for (const f of faq) {
    const qs = new Set(toks(f.q)), as = new Set(toks(f.a));
    let sc = 0;
    t.forEach((w) => { if (qs.has(w)) sc += 2; else if (as.has(w)) sc += 1; });
    if (!best || sc > best.score) best = { ...f, score: sc };
  }
  return best && best.score >= minScore ? best : null;
}

async function askAi(text: string, faq: { q: string; a: string }[], model: string): Promise<string | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 9000);
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, max_tokens: 300,
        messages: [
          { role: "system", content: "You are the support assistant of a Telegram tap-to-earn app (TFUEL). Answer ONLY from the FAQ below, in 1-3 short sentences, in the user's language. If the answer is not in the FAQ, reply exactly: NO_ANSWER. Never promise money, never ask for passwords, PIN or codes.\n\nFAQ:\n" + faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n").slice(0, 6000) },
          { role: "user", content: text.slice(0, 500) },
        ],
      }),
    });
    clearTimeout(to);
    const j: any = await r.json();
    const out = String(j?.choices?.[0]?.message?.content || "").trim();
    return out && !/NO_ANSWER/i.test(out) ? out.slice(0, 800) : null;
  } catch { return null; }
}

/** Reply text for a free-text message sent to the bot, or null when the bot shouldn't answer */
export async function faqReply(text: string, s: Settings): Promise<{ text: string; found: boolean } | null> {
  const cfg = await getCfg2();
  if (!cfg.faqbot.enabled || !s.faq?.length) return null;
  const hit = matchFaq(text, s.faq, cfg.faqbot.min_score);
  if (hit) return { text: `${hit.a}`, found: true };
  if (cfg.faqbot.ai) { const a = await askAi(text, s.faq, cfg.faqbot.model); if (a) return { text: a, found: true }; }
  return { text: "I couldn't find an answer to that. Open the app → Profile → Support to talk to our team.", found: false };
}

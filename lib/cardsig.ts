import crypto from "crypto";
/** Signed share-card URL: the image endpoint (edge) only draws names/codes that the bot signed, so nobody can make fake cards with our domain. */
const key = () => crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex");
export const cardSig = (code: string, name: string) => crypto.createHmac("sha256", key()).update(`${code}|${name}`).digest("hex").slice(0, 16);
export const cardUrl = (base: string, code: string, name: string) => `${base}/api/card?c=${encodeURIComponent(code)}&n=${encodeURIComponent(name)}&s=${cardSig(code, name)}`;
export const winUrl = (base: string, title: string, rank: number, prize: number, name: string) => {
  const t = title.slice(0, 50), r = String(rank), p = String(prize), n = name.slice(0, 24);
  const sig = crypto.createHmac("sha256", key()).update(`win|${t}|${r}|${p}|${n}`).digest("hex").slice(0, 16);
  return `${base}/api/win?t=${encodeURIComponent(t)}&r=${r}&p=${p}&n=${encodeURIComponent(n)}&s=${sig}`;
};

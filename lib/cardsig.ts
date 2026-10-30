import crypto from "crypto";
/** Signed share-card URL: the image endpoint (edge) only draws names/codes that the bot signed, so nobody can make fake cards with our domain. */
const key = () => crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex");
export const cardSig = (code: string, name: string) => crypto.createHmac("sha256", key()).update(`${code}|${name}`).digest("hex").slice(0, 16);
export const cardUrl = (base: string, code: string, name: string, style = "1", link = "") => {
  const ls = link ? crypto.createHmac("sha256", key()).update(`l|${code}|${link}`).digest("hex").slice(0, 16) : "";
  return `${base}/api/card?c=${encodeURIComponent(code)}&n=${encodeURIComponent(name)}&s=${cardSig(code, name)}&v=${style}${link ? `&l=${encodeURIComponent(link)}&ls=${ls}` : ""}`;
};
export const winUrl = (base: string, title: string, rank: number, prize: number, name: string, style = "1") => {
  const t = title.slice(0, 50), r = String(rank), p = String(prize), n = name.slice(0, 24);
  const sig = crypto.createHmac("sha256", key()).update(`win|${t}|${r}|${p}|${n}`).digest("hex").slice(0, 16);
  return `${base}/api/win?t=${encodeURIComponent(t)}&r=${r}&p=${p}&n=${encodeURIComponent(n)}&s=${sig}&v=${style}`;
};

export const bannerUrl = (base: string, kind: "price" | "top" | "tour", title: string, big: string, rows: string[]) => {
  const t = title.slice(0, 60), a = big.slice(0, 24), r = rows.map((x) => x.replace(/\|/g, " ")).join("|").slice(0, 400);
  const sig = crypto.createHmac("sha256", key()).update(`ban|${kind}|${t}|${a}|${r}`).digest("hex").slice(0, 16);
  return `${base}/api/banner?k=${kind}&t=${encodeURIComponent(t)}&a=${encodeURIComponent(a)}&r=${encodeURIComponent(r)}&s=${sig}`;
};

export const earnUrl = (base: string, amount: string, period: string, name: string, style = "1") => {
  const a = amount.slice(0, 24), p = period.slice(0, 20), n = name.slice(0, 24);
  const sig = crypto.createHmac("sha256", key()).update(`earn|${a}|${p}|${n}`).digest("hex").slice(0, 16);
  return `${base}/api/earn?a=${encodeURIComponent(a)}&p=${encodeURIComponent(p)}&n=${encodeURIComponent(n)}&s=${sig}&v=${style}`;
};

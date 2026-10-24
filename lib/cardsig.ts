import crypto from "crypto";
/** Signed share-card URL: the image endpoint (edge) only draws names/codes that the bot signed, so nobody can make fake cards with our domain. */
const key = () => crypto.createHash("sha256").update("card:" + (process.env.BOT_TOKEN || "dev")).digest("hex");
export const cardSig = (code: string, name: string) => crypto.createHmac("sha256", key()).update(`${code}|${name}`).digest("hex").slice(0, 16);
export const cardUrl = (base: string, code: string, name: string) => `${base}/api/card?c=${encodeURIComponent(code)}&n=${encodeURIComponent(name)}&s=${cardSig(code, name)}`;

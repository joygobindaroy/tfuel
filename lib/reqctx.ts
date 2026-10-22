import type { NextApiRequest } from "next";

export interface ReqCtx { device: string; ip: string; where: string; at: string }

function device(ua: string) {
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Unknown OS";
  const app = /Telegram/i.test(ua) ? "Telegram" : /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/(\d+)/.test(ua) ? `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}` : /Safari/i.test(ua) ? "Safari" : "Browser";
  return `${app} (${os})`;
}
const dec = (s: unknown) => { try { return decodeURIComponent(String(s || "")); } catch { return String(s || ""); } };

/** কোন ডিভাইস / IP / কোথা থেকে (Vercel geo header) — ইমেইলে দেখানোর জন্য */
export function reqCtx(req: NextApiRequest): ReqCtx {
  const ua = String(req.headers["user-agent"] || "").slice(0, 300);
  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim().slice(0, 64);
  const city = dec(req.headers["x-vercel-ip-city"]);
  const cc = String(req.headers["x-vercel-ip-country"] || "").toUpperCase();
  let country = cc;
  try { if (cc) country = new Intl.DisplayNames(["en"], { type: "region" }).of(cc) || cc; } catch {}
  const where = [city, country].filter(Boolean).join(", ");
  const at = new Date().toISOString().replace("T", " ").slice(0, 19) + " (UTC)";
  return { device: device(ua), ip, where: where || "Unknown", at };
}
export const ctxRows = (c?: ReqCtx): [string, string][] => (c ? [["Device", c.device], ["IP location", c.where], ["IP address", c.ip], ["Time", c.at]] : []);

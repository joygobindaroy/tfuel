import crypto from "crypto";
import type { NextApiRequest } from "next";
import { db } from "./firebase";
import { sortableId, sha256, passwordMatches } from "./crypto";
import { seal, open } from "./secretbox";
import { reqCtx } from "./reqctx";
import { tgCall } from "./telegram";
import type { AdminRole } from "./admin/types";

export interface AdminAccount { name: string; password: string; role: AdminRole }

/**
 * ADMIN_ACCOUNTS: JSON `[{"name":"sara","password":"...","role":"support"}]` or `sara:pass:support,rafi:pass2:finance`.
 * ADMIN_PASSWORD (single, super) always keeps working as account "admin".
 */
export function adminAccounts(): AdminAccount[] {
  const out: AdminAccount[] = [];
  const raw = (process.env.ADMIN_ACCOUNTS || "").trim();
  const okRole = (r: any): AdminRole => (r === "finance" || r === "support" ? r : "super");
  if (raw) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) for (const a of j) if (a?.name && a?.password) out.push({ name: String(a.name), password: String(a.password), role: okRole(a.role) });
    } catch {
      for (const part of raw.split(",")) {
        const [name, password, role] = part.split(":").map((x) => x.trim());
        if (name && password) out.push({ name, password, role: okRole(role) });
      }
    }
  }
  const main = process.env.ADMIN_PASSWORD;
  if (main && main.length >= 8) out.push({ name: "admin", password: main, role: "super" });
  return out.filter((a) => a.password.length >= 8 && /^[\w.-]{1,32}$/.test(a.name));
}

/** Matches `password` (and optional `name`) against the configured accounts */
export function matchAccount(password: string, name?: string): AdminAccount | null {
  let hit: AdminAccount | null = null;
  for (const a of adminAccounts()) {
    const ok = passwordMatches(password, a.password); // always compare all (no early exit)
    if (ok && (!name || name === a.name) && !hit) hit = a;
  }
  return hit;
}

/* ---------- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ---------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function b32encode(buf: Buffer): string {
  let bits = 0, val = 0, out = "";
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
export function b32decode(s: string): Buffer {
  let bits = 0, val = 0; const out: number[] = [];
  for (const c of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}
export function totpAt(secret: string, t = Date.now()): string {
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = crypto.createHmac("sha1", b32decode(secret)).update(ctr).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, "0");
}
export function totpVerify(secret: string, code: string, t = Date.now()): boolean {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return false;
  let ok = false;
  for (const d of [-1, 0, 1]) if (crypto.timingSafeEqual(Buffer.from(totpAt(secret, t + d * 30000)), Buffer.from(c))) ok = true;
  return ok;
}
export const newTotpSecret = () => b32encode(crypto.randomBytes(20));
export const otpauthUrl = (name: string, secret: string) => `otpauth://totp/${encodeURIComponent("TFUEL Admin")}:${encodeURIComponent(name)}?secret=${secret}&issuer=${encodeURIComponent("TFUEL Admin")}&digits=6&period=30`;

const key = (who: string) => who.replace(/[^\w.-]/g, "_");
export async function get2fa(who: string): Promise<string | null> {
  const v = (await db().ref(`admin_2fa/${key(who)}/secret`).get()).val();
  return v ? open(String(v)) : null;
}
export async function set2fa(who: string, secret: string | null) {
  await db().ref(`admin_2fa/${key(who)}`).set(secret ? { secret: seal(secret), at: Date.now() } : null);
}
export const get2faPending = async (who: string) => {
  const v = (await db().ref(`admin_2fa_pending/${key(who)}`).get()).val();
  return v ? open(String(v)) : null;
};
export const set2faPending = (who: string, secret: string | null) => db().ref(`admin_2fa_pending/${key(who)}`).set(secret ? seal(secret) : null);

/* ---------- login history + unknown-IP alert ---------- */
export async function adminAlert(text: string) {
  const ids = (process.env.ADMIN_TELEGRAM_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (const id of ids) await tgCall("sendMessage", { chat_id: id, text }).catch(() => {});
}

export async function recordLogin(req: NextApiRequest, name: string, role: string, ok: boolean, reason = "") {
  try {
    const c = reqCtx(req);
    const ipH = sha256("ip:" + c.ip).slice(0, 16);
    let fresh = false;
    if (ok) {
      const known = ((await db().ref(`admin_ips/${key(name)}`).get()).val() || {}) as Record<string, number>;
      fresh = !known[ipH];
      await db().ref(`admin_ips/${key(name)}/${ipH}`).set(Date.now());
      if (fresh && Object.keys(known).length > 0) await adminAlert(`🔐 Admin login from a new IP\nUser: ${name} (${role})\nIP: ${c.ip}\nPlace: ${c.where}\nDevice: ${c.device}`);
    } else if (reason !== "rate") {
      const n = (await db().ref(`admin_fail/${key(name || "?")}`).get()).val() || {};
      const recent = Date.now() - (n.at || 0) < 3600000 ? (n.n || 0) + 1 : 1;
      await db().ref(`admin_fail/${key(name || "?")}`).set({ n: recent, at: Date.now() });
      if (recent === 5) await adminAlert(`⚠️ 5 failed admin logins in the last hour\nAccount: ${name || "?"}\nLast IP: ${c.ip} (${c.where})`);
    }
    await db().ref(`admin_logins/${sortableId()}`).set({ at: Date.now(), name: name || "?", role, ok, reason, ip: c.ip, where: c.where, device: c.device, fresh: ok ? fresh : false });
  } catch (e) {
    console.error("recordLogin", e);
  }
}

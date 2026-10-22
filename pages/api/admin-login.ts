import { HttpError } from "@/lib/auth";
import { route, rateLimit } from "@/lib/api";
import { signAdminToken } from "@/lib/crypto";
import { adminAccounts, matchAccount, get2fa, totpVerify, recordLogin } from "@/lib/adminauth";

/** Browser admin login: password (and name, for extra accounts) → signed 12 h token carrying who + role; asks for the 2FA code when enrolled */
export default route(async (req, res) => {
  if (!adminAccounts().length) throw new HttpError(403, "ADMIN_PASSWORD is not set (at least 8 characters)");

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  try {
    await rateLimit("ip_" + ip.replace(/[^\w]/g, "_"), "admin-login", 8);
  } catch (e) {
    await recordLogin(req, String(req.body?.name || ""), "-", false, "rate");
    throw e;
  }

  const name = String(req.body?.name || "").trim().slice(0, 32);
  const acc = matchAccount(String(req.body?.password || ""), name || undefined);
  if (!acc) {
    await new Promise((r) => setTimeout(r, 800));
    await recordLogin(req, name || "?", "-", false, "password");
    throw new HttpError(401, "Wrong password");
  }
  const secret = await get2fa(acc.name);
  if (secret) {
    const code = String(req.body?.code || "").trim();
    if (!code) return void res.json({ success: true, need2fa: true });
    await rateLimit("adm_" + acc.name.replace(/[^\w]/g, "_"), "admin-2fa", 6);
    if (!totpVerify(secret, code)) {
      await new Promise((r) => setTimeout(r, 800));
      await recordLogin(req, acc.name, acc.role, false, "2fa");
      throw new HttpError(401, "Wrong 2FA code");
    }
  }
  await recordLogin(req, acc.name, acc.role, true);
  res.json({ success: true, token: signAdminToken(acc.name, acc.role), role: acc.role });
});

import crypto from "crypto";
import { db } from "./firebase";
import { HttpError } from "./auth";
import { sendMail, mailReady } from "./mailer";
import { getSettings } from "./settings";
import { renderMailS, MailSpec } from "./mailtpl";
import { ReqCtx, ctxRows } from "./reqctx";

const secret = () => {
  const s = process.env.SERVER_SECRET;
  if (!s || s.length < 16) throw new Error("SERVER_SECRET missing or too short");
  return s;
};
const hash = (uid: string, purpose: string, email: string, code: string, bind: string) => crypto.createHmac("sha256", secret()).update(`ec:${uid}:${purpose}:${email}:${bind}:${code}`).digest("hex");
export type Purpose = "verify" | "withdraw" | "send" | "pin" | "pinreset" | "address" | "email";
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export interface Details { amount?: number; asset?: string; network?: string; address?: string; label?: string }

/** কোডটা কোন ঠিকানা/পরিমাণের জন্য — বদলালে কোড অচল (withdraw-এ ঠিকানা বদলে নেওয়া আটকায়) */
export const bindOf = (purpose: Purpose, d?: Details) => (purpose === "withdraw" || purpose === "send" ? `${String(d?.address || "").replace(/\s/g, "").toLowerCase()}|${(Math.round((Number(d?.amount) || 0) * 1000) / 1000)}` : purpose === "address" ? String(d?.address || "").replace(/\s/g, "").toLowerCase() : "");

export async function getEmail(uid: string): Promise<{ addr: string; verified: boolean } | null> {
  const e = (await db().ref(`user_prefs/${uid}/email`).get()).val();
  return e && e.addr ? { addr: e.addr, verified: !!e.verified } : null;
}

const money = (d: Details) => (d.amount ? `${d.amount} ${d.asset || ""}`.trim() : "");

function codeMail(purpose: Purpose, email: string, code: string, ctx?: ReqCtx, d: Details = {}): { subject: string; spec: MailSpec } {
  const base = { code, rows: [] as [string, string][] };
  const c = ctxRows(ctx);
  switch (purpose) {
    case "verify":
      return { subject: "[TFUEL] Verify your email", spec: { ...base, title: "Verify your email", intro: "Use the code below to verify the email address for your TFUEL account.", tone: "info", rows: [["Email", email], ...c] } };
    case "email":
      return { subject: "[TFUEL] Confirm email change", spec: { ...base, title: "Confirm your email change", intro: "You asked to change the email on your TFUEL account. Enter this code to continue.", tone: "warn", rows: c, warning: "If you didn't ask for this, someone may be trying to take over your account." } };
    case "pin":
      return { subject: "[TFUEL] Confirm PIN change", spec: { ...base, title: "Confirm your PIN change", intro: "Enter this code in the app to confirm changing your Withdraw PIN.", tone: "warn", rows: c, warning: "If you didn't ask for this, don't share the code with anyone." } };
    case "pinreset":
      return { subject: "[TFUEL] Reset your Withdraw PIN", spec: { ...base, title: "Reset your Withdraw PIN", intro: "You asked to reset your Withdraw PIN. Enter this code in the app to choose a new one.", tone: "danger", rows: c, warning: "If you didn't ask for this, ignore this email. Your PIN has not been changed." } };
    case "address":
      return { subject: "[TFUEL] Confirm new withdrawal address", spec: { ...base, title: "Confirm a new withdrawal address", intro: "You're saving a new address for withdrawals.", tone: "warn", rows: [["Label", d.label || ""], ["Address", d.address || ""], ...c], warning: "Carefully review the address before you proceed. Funds sent to a wrong address can't be recovered." } };
    case "send":
      return { subject: "[TFUEL] Confirm sending TFUEL", spec: { ...base, title: "Confirm sending TFUEL", intro: `You're sending ${money(d) || "TFUEL"} to another user:`, tone: "warn", rows: [["Amount", money(d)], ["Recipient", d.label || ""], ["Recipient code", d.address || ""], ...c], warning: "Transfers between users can't be reversed. Check the recipient carefully." } };
    case "withdraw":
      return { subject: `[TFUEL] Confirm your ${d.asset || ""} withdrawal`.replace("  ", " "), spec: { ...base, title: `Confirm your ${d.asset || ""} withdrawal`.replace("  ", " "), intro: `You've requested a withdrawal of ${money(d) || "funds"}${d.address ? " to the following address" : ""}:`, tone: "warn", rows: [["Amount", money(d)], ["Network / method", d.network || ""], ["Address", d.address || ""], ...c], warning: "Please carefully review the withdrawal address before you proceed. TFUEL is not responsible for funds sent to a wrong address." } };
  }
}

/** ৬ ডিজিট কোড মেইলে পাঠায়: মিনিটে ১টা, ঘণ্টায় ৬টা। কোডের সাথে (ঠিকানা/পরিমাণ) বাঁধা থাকতে পারে */
export async function sendCode(uid: string, purpose: Purpose, email: string, ctx?: ReqCtx, details: Details = {}) {
  if (!mailReady() && !(globalThis as any).__fakeMail) throw new HttpError(503, "email_unavailable");
  const now = Date.now();
  const hr = Math.floor(now / 3600000);
  const rl = await db().ref(`email_codes/${uid}/rate`).transaction((c: any) => {
    if (!c || c.hr !== hr) return { hr, n: 1, last: now };
    if (c.n >= 6 || now - c.last < 60000) return;
    return { hr, n: c.n + 1, last: now };
  });
  if (!rl.committed) throw new HttpError(429, "wait_a_minute");
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  await db().ref(`email_codes/${uid}/${purpose}`).set({ h: hash(uid, purpose, email, code, bindOf(purpose, details)), exp: now + 10 * 60000, fails: 0, email });
  try {
    const { subject, spec } = codeMail(purpose, email, code, ctx, details);
    await sendMail(email, subject, await renderMailS(spec));
  } catch (e) {
    console.error("mail failed", e);
    await db().ref("diagnostics/email").set({ at: Date.now(), purpose, reason: String((e as any)?.message || e).slice(0, 200) }).catch(() => {});
    await db().ref(`email_codes/${uid}/${purpose}`).remove().catch(() => {});
    throw new HttpError(502, "email_failed");
  }
}

/** কোড ঠিক হলে একবার ব্যবহারযোগ্য; ৫ বার ভুলে বাতিল */
export async function checkCode(uid: string, purpose: Purpose, code: unknown, email?: string, details?: Details) {
  const c = String(code ?? "");
  if (!/^\d{6}$/.test(c)) throw new HttpError(403, "ecode_required");
  const ref = db().ref(`email_codes/${uid}/${purpose}`);
  const rec = (await ref.get()).val() as { h: string; exp: number; fails: number; email: string } | null;
  if (!rec || rec.exp < Date.now() || (rec.fails || 0) >= 5) throw new HttpError(403, "ecode_expired");
  const em = email || rec.email;
  const ok = rec.email === em && crypto.timingSafeEqual(Buffer.from(hash(uid, purpose, em, c, bindOf(purpose, details)), "hex"), Buffer.from(rec.h, "hex"));
  if (!ok) {
    await ref.child("fails").set((rec.fails || 0) + 1);
    throw new HttpError(403, "ecode_wrong");
  }
  await ref.remove();
}

/**
 * Admin "Require email code" চালু: verified email + কোড বাধ্যতামূলক।
 * বন্ধ থাকলে: কোড না দিলে চলবে; দিলে (এবং email verified থাকলে) সেটা ঠিক হতে হবে।
 */
export async function requireEmailCode(uid: string, purpose: Purpose, code: unknown, details?: Details) {
  const s = await getSettings();
  const e = await getEmail(uid);
  if (s.email_required) {
    if (!e?.verified) throw new HttpError(403, "email_required");
    return checkCode(uid, purpose, code, e.addr, details);
  }
  if (e?.verified && String(code ?? "").trim()) await checkCode(uid, purpose, code, e.addr, details);
}

/** user-কে (verified email থাকলে) নোটিফিকেশন মেইল — best-effort, মূল কাজ আটকায় না */
export async function mailUser(uid: string, subject: string, spec: MailSpec) {
  try {
    const e = await getEmail(uid);
    if (!e?.verified || (!mailReady() && !(globalThis as any).__fakeMail)) return;
    await sendMail(e.addr, subject, await renderMailS(spec));
  } catch (err) {
    console.error("mailUser", err);
  }
}

/** withdraw-এর অবস্থা বদলের মেইল: requested / paid / rejected */
export async function mailWithdraw(uid: string, kind: "requested" | "paid" | "rejected", d: { amount: string; network?: string; address?: string; receive?: string; note?: string; receiptUrl?: string; ctx?: ReqCtx }) {
  const T = {
    requested: { subject: "[TFUEL] Withdrawal request received", title: "Withdrawal request received", intro: "We received your withdrawal request. It will be reviewed and sent manually.", tone: "info" as const },
    paid: { subject: "[TFUEL] Withdrawal paid", title: "Your withdrawal has been paid", intro: "Your withdrawal was approved and sent.", tone: "success" as const },
    rejected: { subject: "[TFUEL] Withdrawal rejected", title: "Your withdrawal was rejected", intro: "Your withdrawal was rejected and the amount was returned to your balance.", tone: "danger" as const },
  }[kind];
  await mailUser(uid, T.subject, {
    title: T.title,
    intro: T.intro,
    tone: T.tone,
    rows: [["Amount", d.amount], ["You receive", d.receive || ""], ["Network / method", d.network || ""], ["Address", d.address || ""], ["Note", d.note || ""], ...ctxRows(d.ctx)],
    warning: kind === "requested" ? "If you didn't make this request, contact support immediately." : undefined,
    ...(d.receiptUrl ? { button: { label: "🧾 Open receipt (print / download)", url: d.receiptUrl } } : {}),
  });
}

import nodemailer from "nodemailer";
import crypto from "crypto";

export const mailReady = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let tx: ReturnType<typeof nodemailer.createTransport> | null = null;
function transport() {
  if (!tx) {
    const port = Number(process.env.SMTP_PORT || 465);
    tx = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  }
  return tx;
}

/** HTML + plain-text দুটোই পাঠানো হয় (শুধু text হলে spam-এ যাওয়ার সম্ভাবনা বেশি) */
export async function sendMail(to: string, subject: string, body: { html: string; text: string }) {
  if ((globalThis as any).__fakeMail) return (globalThis as any).__fakeMail(to, subject, body); // tests only
  if (!mailReady()) throw new Error("smtp_not_configured");
  const from = process.env.SMTP_FROM || process.env.SMTP_USER!;
  const domain = (/@([^>\s]+)/.exec(from)?.[1] || "localhost").replace(/>$/, "");
  await transport().sendMail({
    from,
    to,
    subject,
    text: body.text,
    html: body.html,
    messageId: `<${crypto.randomBytes(12).toString("hex")}@${domain}>`,
    replyTo: process.env.SMTP_REPLY_TO || undefined,
    headers: { "X-Auto-Response-Suppress": "All", "Auto-Submitted": "auto-generated" },
  });
}

import { SOCIALS } from "./socials";
import { getSettings } from "./settings";

/** সব ইমেইলের একই ডিজাইন (Binance-ধাঁচ): header, বিস্তারিত টেবিল, বড় কোড, সতর্কবার্তা */
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const LOGO = process.env.MAIL_LOGO_URL || "https://iili.io/nMRQttV.png";
const BRAND = process.env.MAIL_BRAND || "TFUEL";

export type Tone = "info" | "success" | "warn" | "danger";
const TONES: Record<Tone, { bar: string; soft: string; ink: string }> = {
  info: { bar: "#f59e0b", soft: "#fff7e6", ink: "#92400e" },
  success: { bar: "#16a34a", soft: "#ecfdf3", ink: "#166534" },
  warn: { bar: "#f59e0b", soft: "#fff7e6", ink: "#92400e" },
  danger: { bar: "#dc2626", soft: "#fef2f2", ink: "#991b1b" },
};

export interface MailSpec {
  title: string; // বড় শিরোনাম, যেমন "Confirm your withdrawal"
  intro: string; // এক-দুই লাইনের ভূমিকা
  tone?: Tone;
  rows?: [string, string][]; // বিস্তারিত (Amount, Network, Address, Device…)
  code?: string; // ৬ ডিজিট
  codeNote?: string;
  warning?: string; // লাল সতর্কতা
  preheader?: string;
  socials?: { kind: string; url: string }[];
  button?: { label: string; url: string }; // big call-to-action button (e.g. Open receipt)
}

export const appBase = () => {
  const u = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "") || (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "");
  return u.replace(/\/+$/, "");
};
const kindOf = (url: string) => (/(^|\.)(t\.me|telegram\.me)\//i.test(url) ? "telegram" : /(^|\.)(x\.com|twitter\.com)\//i.test(url) ? "x" : /youtube\.com|youtu\.be/i.test(url) ? "youtube" : /instagram\.com/i.test(url) ? "instagram" : /facebook\.com|fb\.com/i.test(url) ? "facebook" : /discord\.(gg|com)/i.test(url) ? "discord" : /tiktok\.com/i.test(url) ? "tiktok" : /wa\.me|whatsapp\.com/i.test(url) ? "whatsapp" : "");
function socialRow(list?: { kind: string; url: string }[]) {
  const base = appBase();
  const items = (list || []).filter((x) => SOCIALS[x.kind] && /^https:\/\//.test(x.url));
  if (!base || !items.length) return "";
  return `<tr><td style="padding:6px 24px 0;" align="center"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${items.map((x) => `<td style="padding:0 5px;"><a href="${esc(x.url)}" target="_blank" style="text-decoration:none;"><img src="${esc(base)}/api/mail-icon?k=${esc(x.kind)}" width="32" height="32" alt="${esc(SOCIALS[x.kind].label)}" style="display:block;border:0;border-radius:16px;"></a></td>`).join("")}</tr></table></td></tr>`;
}

/** same as renderMail, with the admin-set social icons added */
export async function renderMailS(m: MailSpec) {
  let socials: { kind: string; url: string }[] = [];
  try {
    const st = await getSettings();
    socials = st.mail_socials || [];
    if (!socials.length) {
      // nothing set in Admin: reuse the link buttons from the bot (Channel, Chat, X…) so the icons still show
      const seen = new Set<string>();
      for (const b of st.bot_buttons || []) { const k = kindOf(String(b.url || "")); if (k && !seen.has(k) && /^https:\/\//.test(b.url)) { seen.add(k); socials.push({ kind: k, url: b.url }); } }
      if (!seen.has("telegram") && /^https:\/\/t\.me\//.test(st.referral_link || "")) socials.unshift({ kind: "telegram", url: st.referral_link.split("?")[0] });
    }
  } catch {}
  return renderMail({ ...m, socials });
}

export function renderMail(m: MailSpec): { html: string; text: string } {
  const t = TONES[m.tone || "info"];
  const rows = (m.rows || []).filter(([, v]) => v);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(m.title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(m.preheader || m.intro)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
<tr><td style="background:#0f172a;padding:18px 24px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;"><img src="${esc(LOGO)}" width="34" height="34" alt="" style="display:block;border-radius:8px;border:0;"></td>
<td style="vertical-align:middle;padding-left:10px;font-size:20px;font-weight:800;letter-spacing:.5px;color:#ffffff;">${esc(BRAND)}</td></tr></table></td></tr>
<tr><td style="background:${t.bar};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td style="padding:26px 24px 8px;">
<div style="font-size:21px;font-weight:800;line-height:1.3;color:#111827;">${esc(m.title)}</div>
<div style="font-size:14px;line-height:1.6;color:#4b5563;margin-top:8px;">${esc(m.intro)}</div></td></tr>
${rows.length ? `<tr><td style="padding:14px 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fb;border-radius:10px;">${rows.map(([k, v]) => `<tr><td style="padding:10px 14px;font-size:13px;color:#6b7280;width:38%;vertical-align:top;">${esc(k)}</td><td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;word-break:break-all;">${esc(v)}</td></tr>`).join("")}</table></td></tr>` : ""}
${m.warning ? `<tr><td style="padding:14px 24px 0;"><div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:6px;padding:10px 12px;font-size:13px;line-height:1.5;color:#b91c1c;font-weight:600;">${esc(m.warning)}</div></td></tr>` : ""}
${m.code ? `<tr><td style="padding:18px 24px 0;"><div style="font-size:12px;color:#6b7280;margin-bottom:6px;">Verification code</div><div style="background:${t.soft};border:1px dashed ${t.bar};border-radius:10px;padding:14px;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:${t.ink};font-family:Consolas,Menlo,monospace;">${esc(m.code)}</div><div style="font-size:12px;color:#6b7280;margin-top:8px;">${esc(m.codeNote || "This code expires in 10 minutes. Never share it with anyone — our team will never ask for it.")}</div></td></tr>` : ""}
${m.button && /^https:\/\//.test(m.button.url) ? `<tr><td style="padding:18px 24px 0;" align="center"><a href="${esc(m.button.url)}" style="display:inline-block;background:#f5a623;color:#111827;font-weight:800;font-size:15px;text-decoration:none;padding:12px 26px;border-radius:10px;">${esc(m.button.label)}</a></td></tr>` : ""}
${socialRow(m.socials)}
<tr><td style="padding:22px 24px 24px;"><div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;line-height:1.6;color:#6b7280;"><b style="color:#374151;">Security note</b><br>Always check the details above. If you don't recognise this activity, ignore this email, turn on your Withdraw PIN in Settings and contact support right away.<br><br>This is an automated message, please do not reply.</div></td></tr>
</table>
<div style="font-size:11px;color:#9ca3af;margin-top:12px;">&copy; ${new Date().getUTCFullYear()} ${esc(BRAND)}</div>
</td></tr></table></body></html>`;
  const text = [m.title, "", m.intro, "", ...rows.map(([k, v]) => `${k}: ${v}`), m.warning ? `\n${m.warning}` : "", m.button ? `\n${m.button.label}: ${m.button.url}` : "", m.code ? `\nVerification code: ${m.code}\n${m.codeNote || "Expires in 10 minutes. Never share it."}` : "", "\nIf you don't recognise this activity, ignore this email and contact support.", `— ${BRAND}`].filter((x) => x !== "").join("\n");
  return { html, text };
}

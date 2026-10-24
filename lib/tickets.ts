import { db } from "./firebase";
import { sortableId } from "./crypto";
import { HttpError } from "./auth";
import { alertAdmins } from "./adminalert";

const clean = (v: any, n: number) => String(v ?? "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").trim().slice(0, n);
export async function createTicket(uid: string, name: string, subjectIn: string, messageIn: string, kind?: string) {
  const subject = clean(subjectIn, 80), message = clean(messageIn, 1000);
  if (subject.length < 3 || message.length < 5) throw new HttpError(400, "bad_request");
  const idx = `user_tickets/${uid}`;
  const mine = Object.values(((await db().ref(idx).get()).val() || {}) as Record<string, any>);
  if (mine.filter((t) => t.status !== "closed").length >= 3) throw new HttpError(429, "ticket_limit");
  const id = sortableId();
  const now = Date.now();
  await db().ref().update({
    [`tickets/${id}`]: { uid, name: name || "User", subject, status: "open", ...(kind ? { kind } : {}), created_at: now, updated_at: now, msgs: { [sortableId()]: { f: "user", t: message, at: now } } },
    [`${idx}/${id}`]: { subject, status: "open", updated_at: now },
  });
  await alertAdmins("ticket", `New support ticket from ${name || "User"}: ${subject}`);
  return id;
}
export async function replyTicket(uid: string, id: string, messageIn: string) {
  const t = (await db().ref(`tickets/${id}`).get()).val();
  if (!t || t.uid !== uid) throw new HttpError(404, "not_found");
  const message = clean(messageIn, 1000);
  if (message.length < 2) throw new HttpError(400, "bad_request");
  if (t.status === "closed") throw new HttpError(409, "ticket_closed");
  const now = Date.now();
  const idx = `user_tickets/${uid}`;
  await db().ref().update({ [`tickets/${id}/msgs/${sortableId()}`]: { f: "user", t: message, at: now }, [`tickets/${id}/status`]: "open", [`tickets/${id}/updated_at`]: now, [`${idx}/${id}/status`]: "open", [`${idx}/${id}/updated_at`]: now });
}
export async function myTickets(uid: string) {
  return Object.entries(((await db().ref(`user_tickets/${uid}`).get()).val() || {}) as Record<string, any>).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.updated_at - a.updated_at).slice(0, 8);
}
export async function getTicket(uid: string, id: string) {
  const t = (await db().ref(`tickets/${id}`).get()).val();
  if (!t || t.uid !== uid) return null;
  return { id, subject: t.subject, status: t.status, msgs: Object.values(t.msgs || {}).sort((a: any, b: any) => a.at - b.at) as { f: string; t: string; at: number }[] };
}

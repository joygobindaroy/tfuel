import { db } from "./firebase";
import { HttpError } from "./auth";
import { alertAdmins } from "./adminalert";

/** Sponsored tasks: optional budget (max completions). A slot is reserved before the user is paid and released if that fails. */
export async function reserveSlot(taskId: string, task: any): Promise<boolean> {
  const budget = Number(task?.budget) || 0;
  if (budget <= 0) { await db().ref(`task_stats/${taskId}/done`).transaction((c: number | null) => (c || 0) + 1); return false; }
  let ok = false;
  await db().ref(`task_stats/${taskId}/done`).transaction((c: number | null) => {
    ok = (c || 0) < budget;
    return ok ? (c || 0) + 1 : undefined;
  });
  if (!ok) throw new HttpError(409, "task_full");
  return true;
}
export async function releaseSlot(taskId: string) {
  await db().ref(`task_stats/${taskId}/done`).transaction((c: number | null) => Math.max(0, (c || 0) - 1)).catch(() => {});
}
export async function slotDone(taskId: string, task: any) {
  const budget = Number(task?.budget) || 0;
  if (budget <= 0) return;
  const d = Number((await db().ref(`task_stats/${taskId}/done`).get()).val()) || 0;
  if (d >= budget) await alertAdmins("error", `Sponsored task "${task.title}" reached its budget (${budget} completions). It is now hidden.`);
}

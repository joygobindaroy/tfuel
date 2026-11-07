import type { AdminMod } from "./types";
import { adminLog } from "../log";
import { notesList, noteAdd, noteDone, noteDel, contestView, contestPay, xRates } from "../v29";
import { xReport } from "../v28";

/** Admin → Team (v29): shared notes, referral contest, exchange rate history */
const mod: AdminMod = async (action, b, ctx) => {
  if (!action.startsWith("v29")) return undefined;
  switch (action) {
    case "v29Notes": return { list: await notesList() };
    case "v29NoteAdd": return { list: await noteAdd(ctx.who, String(b.text || "")) };
    case "v29NoteDone": return { list: await noteDone(String(b.id || ""), !!b.done) };
    case "v29NoteDel": return { list: await noteDel(String(b.id || "")) };
    case "v29Contest": return { c: await contestView("") };
    case "v29ContestPay": { const w = await contestPay(ctx.who); await adminLog(ctx.who, "contest_pay", { n: w.length }); return { winners: w, c: await contestView("") }; }
    case "v29Rates": { const days = Number(b.days) || 30; return { rates: await xRates(days), report: (await xReport(days)).by_day }; }
  }
  return undefined;
};
export default mod;

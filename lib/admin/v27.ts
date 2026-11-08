import type { AdminMod } from "./types";
import { HttpError } from "../auth";
import { adminLog } from "../log";
import { xAdminList, xAdminSet, userSummary, xc } from "../v27";
import { xReport, adminTodo } from "../v28";
import { xChatList, xChatAdmin, xChatWaiting, xCsv } from "../v31";

/** Admin → Exchange (v27): buy/sell queue, one-page user summary */
const mod: AdminMod = async (action, b, ctx) => {
  if (!action.startsWith("v27")) return undefined;
  switch (action) {
    case "v27Orders": return { list: await xAdminList(String(b.status || "open")) };
    case "v27OrderSet": {
      const act = String(b.act || "");
      await xAdminSet(String(b.id || ""), act, String(b.note || ""), ctx.who);
      await adminLog(ctx.who, "xchg_" + act, { id: b.id });
      return { list: await xAdminList(String(b.view || "open")) };
    }
    case "v27Report": return { r: await xReport(Number(b.days) || 30) };
    case "v27Todo": return await adminTodo();
    case "v27Chat": return { msgs: await xChatList(String(b.id || "")) };
    case "v27ChatSend": { const msgs = await xChatAdmin(ctx.who, String(b.id || ""), b.text); await adminLog(ctx.who, "xchg_chat", { id: b.id }); return { msgs }; }
    case "v27Waiting": return { ids: await xChatWaiting() };
    case "v27Csv": return { csv: await xCsv(Number(b.days) || 30) };
    case "v27Rates": { const c = await xc(); return { cur: c.cur, rate_buy: c.rate_buy, rate_sell: c.rate_sell, auto: c.auto }; }
    case "v27Summary": {
      const q = String(b.q || "").trim();
      if (!q) throw new HttpError(400, "Enter a user ID or 10-letter code");
      return { s: await userSummary(q) };
    }
  }
  return undefined;
};
export default mod;

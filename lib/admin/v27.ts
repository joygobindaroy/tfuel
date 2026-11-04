import type { AdminMod } from "./types";
import { HttpError } from "../auth";
import { adminLog } from "../log";
import { xAdminList, xAdminSet, userSummary } from "../v27";

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
    case "v27Summary": {
      const q = String(b.q || "").trim();
      if (!q) throw new HttpError(400, "Enter a user ID or 10-letter code");
      return { s: await userSummary(q) };
    }
  }
  return undefined;
};
export default mod;

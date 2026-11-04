import type { AdminMod } from "./types";
import { HttpError } from "../auth";
import { adminLog } from "../log";
import { getCfg2 } from "../cfg2";
import { apiKeyNew } from "../v23";
import { adminActivity, heatmap } from "../v25";
import { kycQueue, kycSet, calendar, ledger } from "../v26";
import { fbAdmin, reportsList, reportResolve, pollTally } from "../v22";

/** Admin → Tools (v22): feedback, user reports, poll results */
const mod: AdminMod = async (action, b, ctx) => {
  if (!action.startsWith("v22")) return undefined;
  if (ctx.role !== "super") throw new HttpError(403, "Only the Super admin can do this");
  switch (action) {
    case "v22Data": {
      const c = await getCfg2(true);
      const polls = await Promise.all(c.v22.polls.map(async (p) => ({ id: p.id, ...(await pollTally(p.id, p.qs)) })));
      return { cfg: c.v22, feedback: await fbAdmin(), reports: await reportsList(String(b.status || "open")), polls };
    }
    case "v22Activity": return { ...(await adminActivity(Number(b.days) || 30)), heat: await heatmap() };
    case "v22Kyc": return { list: await kycQueue() };
    case "v22KycSet": { await kycSet(String(b.uid || ""), String(b.status || ""), String(b.note || "")); await adminLog(ctx.who, "kyc_set", { uid: b.uid, status: b.status }); return { list: await kycQueue() }; }
    case "v22Calendar": return { list: await calendar() };
    case "v22Ledger": return { rows: await ledger(Number(b.days) || 30) };
    case "v22ApiKey": { const key = await apiKeyNew(); await adminLog(ctx.who, "api_key_new", {}); return { key }; }
    case "v22Reports": return { reports: await reportsList(String(b.status || "open")) };
    case "v22ReportResolve": {
      await reportResolve(String(b.id || ""), String(b.status || ""), String(b.note || ""));
      await adminLog(ctx.who, "report_resolve", { id: b.id, status: b.status });
      return { reports: await reportsList(String(b.view || "open")) };
    }
  }
  return undefined;
};
export default mod;

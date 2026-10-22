export type AdminRole = "super" | "finance" | "support";
export interface AdminCtx { who: string; role: AdminRole }
/** Returns a JSON object (success:true is added) or undefined when the action isn't handled by this module */
export type AdminMod = (action: string, b: any, ctx: AdminCtx) => Promise<Record<string, any> | undefined>;

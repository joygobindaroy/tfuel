import type { Settings } from "./settings";
import type { UserRecord } from "./user";

/** সন্দেহজনক withdraw আপনা-আপনি "HOLD"-এ যায়: admin Release না করলে Paid করা যায় না। খালি string = সমস্যা নেই */
export function holdReason(rec: UserRecord, s: Settings, amountUsdt: number, now = Date.now()): string {
  const why: string[] = [];
  if (s.hold_new_hours > 0 && rec.created_at && now < rec.created_at + s.hold_new_hours * 3600000) why.push(`account younger than ${s.hold_new_hours}h`);
  if (s.hold_amount_usdt > 0 && amountUsdt >= s.hold_amount_usdt) why.push(`large amount (≥ ${s.hold_amount_usdt} USDT)`);
  if (s.hold_first_withdraw) {
    const prev = Object.keys((rec as any).usdt_withdrawals || {}).length + Object.keys(rec.withdrawals || {}).length;
    if (prev === 0) why.push("first withdrawal");
  }
  return why.join("; ");
}

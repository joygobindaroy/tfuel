/** Pure exchange maths, shared by the server and the calculator on the phone. USDT amounts are plain numbers here (not micro). */
export interface XCalcIn { kind: "buy" | "sell"; usdt: number; rate: number; fee_pct: number }
export interface XCalcOut { gross: number; fee: number; fiat: number }
const r2 = (n: number) => Math.round(n * 100) / 100;
/** buy: you pay gross + fee, you get the USDT. sell: you give the USDT, you get gross − fee. */
export function xCalc(i: XCalcIn): XCalcOut {
  const gross = r2(i.usdt * i.rate);
  const fee = r2(gross * (i.fee_pct / 100));
  return { gross, fee, fiat: i.kind === "buy" ? r2(gross + fee) : r2(Math.max(0, gross - fee)) };
}
/** how much USDT does a given local amount buy/sell (for the calculator, "I have 5000 BDT") */
export function xUsdtFor(kind: "buy" | "sell", fiat: number, rate: number, fee_pct: number): number {
  if (!(rate > 0) || !(fiat > 0)) return 0;
  const k = 1 + (kind === "buy" ? 1 : -1) * (fee_pct / 100);
  return k > 0 ? Math.floor((fiat / (rate * k)) * 100) / 100 : 0;
}

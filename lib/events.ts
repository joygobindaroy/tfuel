import { getCfg2 } from "./cfg2";

/** Reward multiplier of a running bonus event (admin → Growth & Games → Events & goals). 1 when none is running. */
export async function eventMult(now = Date.now()): Promise<number> {
  try {
    const l = (await getCfg2()).v20.events.filter((e) => e.on && e.start <= now && now < e.end);
    return l.reduce((a, e) => Math.max(a, e.mult), 1);
  } catch { return 1; }
}

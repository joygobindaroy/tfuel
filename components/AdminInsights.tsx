import { useEffect, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;

/** Admin → Insights */
export default function InsightsPage({ call }: { call: Call }) {
  void call; void useState; void useEffect;
  return <div className="card"><h3>Insights</h3><p className="muted">Coming up.</p></div>;
}

import { useEffect, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;

/** Admin → Communication */
export default function CommsPage({ call }: { call: Call }) {
  void call; void useState; void useEffect;
  return <div className="card"><h3>Communication</h3><p className="muted">Coming up.</p></div>;
}

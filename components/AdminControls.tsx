import { useEffect, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;

/** Admin → Controls */
export default function ControlsPage({ call }: { call: Call }) {
  void call; void useState; void useEffect;
  return <div className="card"><h3>Controls</h3><p className="muted">Coming up.</p></div>;
}

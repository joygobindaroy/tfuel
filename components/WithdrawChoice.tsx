import { useState } from "react";
import { WithdrawPage } from "@/components/Cashier";
import { SendPage } from "@/components/Send";

type Say = (t: string, ok?: boolean) => void;

/** Withdraw: On-chain (to another exchange / wallet) or Internal transfer (to another user by their unique ID, instant, no network fee) */
export function WithdrawChoice({ say, reload, onBack, onHistory, cpt, internal }: { say: Say; reload: () => void; onBack: () => void; onHistory: () => void; cpt: number; internal: boolean }) {
  const [mode, setMode] = useState<"chain" | "internal">("chain");
  const tabs = (
    <div className="card" style={{ paddingBottom: 12 }}>
      <div className="title" style={{ marginBottom: 6 }}>How do you want to send?</div>
      <div className="chips">
        <button className={`chip ${mode === "chain" ? "on" : ""}`} onClick={() => setMode("chain")}>On-chain transfer</button>
        <button className={`chip ${mode === "internal" ? "on" : ""}`} onClick={() => setMode("internal")}>Internal transfer</button>
      </div>
      <div className="xs muted" style={{ marginTop: 8 }}>
        {mode === "chain" ? "Withdraw USDT to your wallet or another exchange." : "Instant transfer to another TFUEL user with their unique ID. Share your own ID to receive."}
      </div>
    </div>
  );
  if (!internal) return <WithdrawPage say={say} reload={reload} onBack={onBack} onHistory={onHistory} />;
  return (
    <>
      {mode === "chain" ? <WithdrawPage say={say} reload={reload} onBack={onBack} onHistory={onHistory} top={tabs} /> : <SendPage say={say} onBack={onBack} cpt={cpt} reload={reload} top={tabs} />}
    </>
  );
}

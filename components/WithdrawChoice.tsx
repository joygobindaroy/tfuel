import { useState } from "react";
import { WithdrawPage, PageHead } from "@/components/Cashier";
import { SendPage } from "@/components/Send";

type Say = (t: string, ok?: boolean) => void;

/** Withdraw: On-chain (to another exchange / wallet) or Internal transfer (to another user by their unique ID, instant, no network fee) */
export function WithdrawChoice({ say, reload, onBack, onHistory, cpt, internal, onTrade }: { say: Say; reload: () => void; onBack: () => void; onHistory: () => void; cpt: number; internal: boolean; onTrade?: () => void }) {
  const [coin, setCoin] = useState<"usdt" | "tfuel">("usdt");
  const [mode, setMode] = useState<"chain" | "internal">("chain");
  const tabs = (
    <div className="card" style={{ paddingBottom: 12 }}>
      <div className="title" style={{ marginBottom: 6 }}>Which coin do you want to withdraw?</div>
      <div className="chips" style={{ marginBottom: 12 }}>
        <button className={`chip ${coin === "usdt" ? "on" : ""}`} onClick={() => setCoin("usdt")}>USDT</button>
        <button className={`chip ${coin === "tfuel" ? "on" : ""}`} onClick={() => setCoin("tfuel")}>TFUEL</button>
      </div>
      <div className="title" style={{ marginBottom: 6 }}>How do you want to send?</div>
      <div className="chips">
        <button className={`chip ${mode === "chain" ? "on" : ""}`} onClick={() => setMode("chain")}>On-chain transfer</button>
        <button className={`chip ${mode === "internal" ? "on" : ""}`} onClick={() => setMode("internal")}>Internal transfer</button>
      </div>
      <div className="xs muted" style={{ marginTop: 8 }}>
        {mode === "chain" ? (coin === "usdt" ? "Withdraw USDT to your wallet or another exchange." : "TFUEL can't leave the app on-chain. Sell it for USDT first, then withdraw the USDT.") : "Instant transfer to another TFUEL user with their unique ID. Share your own ID to receive."}
      </div>
    </div>
  );
  if (!internal) return <WithdrawPage say={say} reload={reload} onBack={onBack} onHistory={onHistory} />;
  if (mode === "chain" && coin === "tfuel") {
    return (
      <>
        <PageHead title="Withdraw" onBack={onBack} />
        {tabs}
        <div className="card">
          <div className="title">Sell TFUEL, then withdraw USDT</div>
          <div className="sub">Your TFUEL stays safe in the app. Convert it to USDT at the live price (one tap), then withdraw USDT on-chain to any exchange or wallet.</div>
          {onTrade && <button className="btn block" style={{ marginTop: 10 }} onClick={onTrade}>Sell TFUEL for USDT</button>}
        </div>
      </>
    );
  }
  return (
    <>
      {mode === "chain" ? <WithdrawPage say={say} reload={reload} onBack={onBack} onHistory={onHistory} top={tabs} /> : <SendPage say={say} onBack={onBack} cpt={cpt} reload={reload} top={tabs} fixedAsset={coin} />}
    </>
  );
}

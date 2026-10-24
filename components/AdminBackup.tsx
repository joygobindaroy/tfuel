import { useCallback, useEffect, useState } from "react";

type Call = <T = any>(body: Record<string, any>, okMsg?: string) => Promise<T | null>;
const download = (name: string, data: unknown) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  a.download = name;
  a.click();
};

/** Admin: settings backup / restore (file) and money snapshots (restore one user's balances) */
export default function BackupPanel({ call }: { call: Call }) {
  const [file, setFile] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);
  const [snaps, setSnaps] = useState<any[]>([]);
  const [sid, setSid] = useState("");
  const [uid, setUid] = useState("");
  const [look, setLook] = useState<any>(null);
  const [reason, setReason] = useState("");
  const loadSnaps = useCallback(async () => { const r: any = await call({ action: "snapList" }); if (r) { setSnaps(r.list); setSid((x) => x || r.list[0]?.id || ""); } }, [call]);
  useEffect(() => { loadSnaps(); }, [loadSnaps]);

  const pick = async (f: File | undefined) => {
    setDiff(null); setFile(null);
    if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const r: any = await call({ action: "backupPreview", backup: j });
      if (r) { setFile(j); setDiff(r); }
    } catch { await call({ action: "backupPreview", backup: null }); }
  };
  return (
    <>
      <div className="card">
        <div className="title">Settings backup</div>
        <div className="sub">All Settings and Growth &amp; Games options in one file (secrets are not included). Restore checks every value first and shows what would change.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button className="btn sec sm" onClick={async () => { const r: any = await call({ action: "backupExport" }); if (r) download(`tfuel-settings-${new Date().toISOString().slice(0, 10)}.json`, r.backup); }}>Download backup</button>
          <label className="btn sec sm" style={{ cursor: "pointer" }}>Choose file to restore<input type="file" accept="application/json" hidden onChange={(e) => pick(e.target.files?.[0])} /></label>
        </div>
        {diff && (
          <div style={{ marginTop: 10 }}>
            <div className="sub">{diff.diff.length === 0 ? "No differences from the current settings." : `${diff.diff.length} change(s):`}</div>
            {diff.diff.slice(0, 40).map((d: any, i: number) => <div key={i} className="xs muted">• {d.area}.{d.key}</div>)}
            {diff.skipped?.length > 0 && <div className="xs muted" style={{ marginTop: 4 }}>{diff.skipped.length} value(s) will be skipped (not valid).</div>}
            {diff.diff.length > 0 && <button className="btn sm" style={{ marginTop: 8 }} onClick={async () => { if (!confirm("Apply these changes now?")) return; const r: any = await call({ action: "backupApply", backup: file }, "Backup restored"); if (r) { setDiff(null); setFile(null); } }}>Apply restore</button>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="title">Money snapshots</div>
        <div className="sub">A copy of every balance (coins and USDT). Taken automatically once a day; the last 7 are kept. If a balance ever goes wrong, restore that one user from a snapshot.</div>
        <button className="btn sec sm" style={{ marginTop: 8 }} onClick={async () => { const r: any = await call({ action: "snapCreate" }, "Snapshot saved"); if (r) { setSnaps(r.list); setSid(r.id); } }}>Take snapshot now</button>
        <div className="grid2" style={{ marginTop: 10 }}>
          <div><label>Snapshot</label><select value={sid} onChange={(e) => { setSid(e.target.value); setLook(null); }}>{snaps.map((s) => <option key={s.id} value={s.id}>{new Date(s.at).toLocaleString()} · {s.n} users{s.by === "auto" ? " · auto" : ""}</option>)}</select></div>
          <div><label>User ID</label><input inputMode="numeric" value={uid} onChange={(e) => { setUid(e.target.value.replace(/\D/g, "")); setLook(null); }} /></div>
        </div>
        <button className="btn sec sm" style={{ marginTop: 8 }} disabled={!sid || !uid} onClick={async () => { const r: any = await call({ action: "snapLook", id: sid, uid }); if (r) setLook(r); }}>Compare with now</button>
        {look && (
          <div style={{ marginTop: 10 }}>
            <div className="sub">Snapshot ({new Date(look.at).toLocaleString()}): <b>{look.snap.coins.toLocaleString("en-US")} coins</b> · <b>{look.snap.usdt.toFixed(2)} USDT</b></div>
            <div className="sub">Now: <b>{look.now.coins.toLocaleString("en-US")} coins</b> · <b>{look.now.usdt.toFixed(2)} USDT</b></div>
            <input style={{ marginTop: 8 }} placeholder="Reason (required, saved in the log)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn sm" style={{ marginTop: 8 }} disabled={reason.trim().length < 3} onClick={async () => { if (!confirm("Overwrite this user's balances with the snapshot values?")) return; const r: any = await call({ action: "snapRestore", id: sid, uid, reason }, "Balances restored"); if (r) { setLook(null); setReason(""); } }}>Restore this user&apos;s balances</button>
          </div>
        )}
      </div>
    </>
  );
}

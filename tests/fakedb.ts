/** Minimal in-memory Realtime DB for tests (get/set/update/remove/transaction/child) */
const clone = (v: any) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
export function makeDb() {
  let root: any = {};
  const parts = (p: string) => p.split("/").filter(Boolean);
  const getAt = (p: string) => { let c = root; for (const k of parts(p)) { if (c == null || typeof c !== "object") return null; c = c[k]; } return c === undefined ? null : c; };
  const setAt = (p: string, v: any) => {
    const ks = parts(p);
    if (!ks.length) { root = v ?? {}; return; }
    let c = root;
    for (let i = 0; i < ks.length - 1; i++) { if (c[ks[i]] == null || typeof c[ks[i]] !== "object") c[ks[i]] = {}; c = c[ks[i]]; }
    if (v === null || v === undefined) delete c[ks[ks.length - 1]]; else c[ks[ks.length - 1]] = clone(v);
  };
  const ref = (path = ""): any => ({
    get: async () => ({ val: () => clone(getAt(path)), exists: () => getAt(path) !== null }),
    set: async (v: any) => setAt(path, v),
    remove: async () => setAt(path, null),
    child: (k: string) => ref(path + "/" + k),
    update: async (u: any) => { for (const [k, v] of Object.entries(u)) setAt(path + "/" + k, (v as any)?.[".sv"] ? (Number(getAt(path + "/" + k)) || 0) + (v as any)[".sv"].increment : v); },
    transaction: async (fn: (c: any) => any) => {
      const cur = clone(getAt(path));
      const next = fn(cur);
      if (next === undefined) return { committed: false, snapshot: { val: () => clone(getAt(path)) } };
      setAt(path, next);
      return { committed: true, snapshot: { val: () => clone(getAt(path)) } };
    },
  });
  return { ref, dump: () => clone(root) };
}

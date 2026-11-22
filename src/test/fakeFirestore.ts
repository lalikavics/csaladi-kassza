// Teszthez: a Firestore helyett egy helyi teszt-szerver (scripts/fake-server.mjs), lekérdezéssel.
const URL0 = 'http://localhost:8787';
export type Firestore = object;
export type Unsubscribe = () => void;
type Ref = { path: string };
export const getFirestore = () => ({});
export const doc = (_db: unknown, ...p: string[]): Ref => ({ path: p.join('/') });
export const collection = (_db: unknown, ...p: string[]): Ref => ({ path: p.join('/') });
export const orderBy = () => null;
export const query = (c: Ref) => c;
export const serverTimestamp = () => '__ts__';
const post = async (u: string, b: unknown) => { const r = await fetch(URL0 + u, { method: 'POST', body: JSON.stringify(b) }); if (!r.ok) throw new Error('permission-denied'); };
export const setDoc = (ref: Ref, data: unknown) => post('/set', { path: ref.path, data });
export async function getDoc(ref: Ref) {
  const d = await (await fetch(URL0 + '/get?path=' + encodeURIComponent(ref.path))).json();
  return { exists: () => d !== null, data: () => d };
}
export function writeBatch() {
  const ops: { path: string; data: unknown }[] = [];
  return { set(ref: Ref, data: unknown) { ops.push({ path: ref.path, data }); }, commit: () => post('/batch', ops) };
}
export function onSnapshot(q: Ref, _o: unknown, next: (s: unknown) => void, err: (e: Error) => void): Unsubscribe {
  let last = '', stop = false;
  const tick = async () => {
    if (stop) return;
    try {
      const rows: { id: string; data: Record<string, unknown> }[] = await (await fetch(URL0 + '/list?path=' + encodeURIComponent(q.path))).json();
      const sig = rows.map((r) => r.id).join(',');
      if (sig !== last) {
        last = sig;
        next({ docs: rows.map((r) => ({ id: r.id, get: (f: string) => r.data[f] })), metadata: { fromCache: false } });
      }
    } catch (e) { err(e as Error); }
    setTimeout(tick, 400);
  };
  tick();
  return () => { stop = true; };
}

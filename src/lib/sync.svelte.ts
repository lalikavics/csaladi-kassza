// Közös kassza szinkronja Firebase Firestore-on keresztül.
// A szerverre csak titkosított események kerülnek: /k/{kasszaId} = PIN-ellenőrző, /k/{kasszaId}/e/{eseményId} = egy esemény.
// A helyi gyorsítótár is titkosított; a nyílt adat csak a memóriában van, feloldás után.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection, doc, getDoc, getFirestore, onSnapshot, orderBy, query, serverTimestamp, setDoc, writeBatch, type Firestore, type Unsubscribe,
} from 'firebase/firestore';
import { createToken, deriveKey, kassaId, newSecret, open, seal, type Sealed } from './crypto';
import type { Event } from './ledger';
import { firebaseConfig } from './config';

const SKEY = 'kassza.shared.v1'; // { secret }
const CKEY = 'kassza.cache.v1'; // titkosított { log, pending }

type Status = 'locked' | 'connecting' | 'online' | 'offline' | 'error';

class Sync {
  status = $state<Status>('locked');
  unlocked = $state(false);
  error = $state('');
  lastSync = $state<string>('');
  /** hibakereséshez */
  remoteCount = $state(0);
  pendingCount = $state(0);
  get shortId() { return this.id.slice(0, 8); }

  private secret = '';
  private id = '';
  private key: CryptoKey | null = null;
  private db: Firestore | null = null;
  private fb: FirebaseApp | null = null;
  private unsub: Unsubscribe | null = null;
  private remote: Event[] = [];
  private decrypted = new Map<string, Event>(); // dokumentum-azonosító → esemény
  private pending: Event[] = [];
  private setLog: (log: Event[]) => void = () => {};

  constructor() {
    try { this.secret = JSON.parse(localStorage.getItem(SKEY) ?? '{}').secret ?? ''; } catch { /* */ }
    this.adoptFromHash();
  }

  get hasSecret() { return !!this.secret; }
  get configured() { return !!firebaseConfig; }
  inviteLink() { return `${location.origin}${location.pathname}#${this.secret}`; }

  /** A meghívó link titkát átvesszük a címből, majd eltüntetjük onnan. */
  adoptFromHash() {
    const h = location.hash.replace('#', '');
    if (/^[A-Za-z0-9_-]{40,}$/.test(h)) {
      this.useSecret(h);
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  /** Beillesztett meghívó link vagy kód. */
  adoptFromText(t: string): boolean {
    const m = /([A-Za-z0-9_-]{40,})\s*$/.exec(t.trim());
    if (!m) return false;
    this.useSecret(m[1]);
    return true;
  }
  private useSecret(s: string) {
    if (s !== this.secret) { try { localStorage.removeItem(CKEY); } catch { /* */ } }
    this.secret = s;
    try { localStorage.setItem(SKEY, JSON.stringify({ secret: s })); } catch { /* */ }
  }

  private conn() {
    if (!this.db) {
      if (!firebaseConfig) throw new Error('A Firebase még nincs beállítva.');
      this.fb = initializeApp(firebaseConfig);
      this.db = getFirestore(this.fb);
    }
    return this.db;
  }

  /** Új közös kassza a megadott PIN-nel. */
  async create(pin: string, code: string) {
    const secret = newSecret();
    const id = await kassaId(secret);
    const key = await deriveKey(secret, pin, id);
    try {
      await setDoc(doc(this.conn(), 'k', id), { v: await seal(key, 'kassza-ok'), at: serverTimestamp(), inv: await createToken(code) });
    } catch (e) {
      if (/permission/i.test((e as Error).message)) throw new Error('Hibás létrehozási kód.');
      throw e;
    }
    this.useSecret(secret);
    this.id = id; this.key = key;
  }

  /** PIN ellenőrzése: előbb a helyi gyorsítótárral (offline is megy), különben a szerveren tárolt ellenőrzővel. */
  async unlock(pin: string): Promise<boolean> {
    const id = await kassaId(this.secret);
    const key = await deriveKey(this.secret, pin, id);
    const cache = this.readCache();
    if (cache) {
      try {
        const c = await open<{ log: Event[]; pending: Event[] }>(key, cache);
        this.remote = c.log; this.pending = c.pending;
        this.id = id; this.key = key;
        return true;
      } catch { return false; }
    }
    const snap = await getDoc(doc(this.conn(), 'k', id));
    if (!snap.exists()) throw new Error('Ez a kassza nem található. Ellenőrizd a meghívó linket.');
    try {
      if ((await open<string>(key, snap.data().v as Sealed)) !== 'kassza-ok') return false;
    } catch { return false; }
    this.id = id; this.key = key;
    return true;
  }

  /** Feloldás után: a helyi állapot betöltése és a valós idejű figyelés indítása. */
  start(setLog: (log: Event[]) => void) {
    this.setLog = setLog;
    this.unlocked = true;
    this.publish();
    this.status = 'connecting';
    const q = query(collection(this.conn(), 'k', this.id, 'e'), orderBy('t'));
    this.unsub = onSnapshot(q, { includeMetadataChanges: true }, async (snap) => {
      const out: Event[] = [];
      for (const d of snap.docs) {
        let ev = this.decrypted.get(d.id);
        if (!ev) {
          try { ev = await open<Event>(this.key!, { iv: d.get('iv'), c: d.get('c') }); this.decrypted.set(d.id, ev); }
          catch { continue; } // más kulccsal írt vagy sérült elem: kihagyjuk
        }
        out.push(ev);
      }
      this.remote = out;
      const ids = new Set(out.map((e) => e.id));
      this.pending = this.pending.filter((e) => !ids.has(e.id));
      this.status = snap.metadata.fromCache ? 'offline' : 'online';
      this.lastSync = new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' });
      this.publish();
      if (this.pending.length && !snap.metadata.fromCache) void this.flush();
    }, (err) => { this.status = 'error'; this.error = err.message; });
    addEventListener('online', () => void this.flush());
    void this.flush();
  }

  private publish() {
    this.remoteCount = this.remote.length; this.pendingCount = this.pending.length;
    this.setLog([...this.remote, ...this.pending]);
    void this.writeCache();
  }

  /** Új események: azonnal helyben, aztán a szerverre. */
  push(evs: Event[]) {
    this.pending.push(...evs);
    this.publish();
    void this.flush();
  }

  private flushing = false;
  private async flush() {
    if (this.flushing || !this.key || !this.pending.length) return;
    this.flushing = true;
    try {
      const have = new Set(this.remote.map((e) => e.id));
      const todo = this.pending.filter((e) => !have.has(e.id));
      for (let i = 0; i < todo.length; i += 400) {
        const chunk = todo.slice(i, i + 400);
        const sealed = await Promise.all(chunk.map(async (ev) => ({ ev, data: { ...(await seal(this.key!, ev)), t: serverTimestamp() } })));
        try {
          const b = writeBatch(this.conn());
          for (const x of sealed) b.set(doc(this.conn(), 'k', this.id, 'e', x.ev.id), x.data);
          await b.commit();
        } catch {
          // ha egy elem már fent van (pl. megszakadt korábbi feltöltés), a csomag elutasul: egyenként próbáljuk
          for (const x of sealed) { try { await setDoc(doc(this.conn(), 'k', this.id, 'e', x.ev.id), x.data); } catch { /* már fent van, vagy offline */ } }
        }
      }
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.flushing = false;
    }
  }

  private readCache(): Sealed | null {
    try { const r = localStorage.getItem(CKEY); return r ? JSON.parse(r) : null; } catch { return null; }
  }
  private cacheTimer: ReturnType<typeof setTimeout> | undefined;
  private async writeCache() {
    clearTimeout(this.cacheTimer);
    this.cacheTimer = setTimeout(async () => {
      if (!this.key) return;
      try { localStorage.setItem(CKEY, JSON.stringify(await seal(this.key, { log: this.remote, pending: this.pending }))); } catch { /* */ }
    }, 400);
  }

  /** Kilépés ezen az eszközön: a titok és a helyi másolat törlődik, a közös adat megmarad. */
  forget() {
    this.unsub?.();
    try { localStorage.removeItem(SKEY); localStorage.removeItem(CKEY); } catch { /* */ }
    this.secret = ''; this.key = null; this.unlocked = false;
  }
}

export const sync = new Sync();

// Végponttól végpontig titkosítás (Web Crypto, AES-256-GCM).
// A kulcs a meghívó link titkos részéből és a PIN-ből készül; egyik sem kerül a szerverre.

const enc = new TextEncoder();
const dec = new TextDecoder();

export const b64u = (b: ArrayBuffer | Uint8Array) => {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = '';
  for (const x of u) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64u = (s: string) => {
  const t = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(t, (c) => c.charCodeAt(0));
};

/** 32 bájt véletlen titok a meghívó linkbe. */
export const newSecret = () => b64u(crypto.getRandomValues(new Uint8Array(32)));

/** A kassza azonosítója a szerveren (a titokból, egyirányúan). */
export async function kassaId(secret: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', enc.encode('kassza-id:' + secret));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

/** Létrehozási kód → a szabályokban ellenőrzött lenyomat (a kód maga nem megy fel). */
export async function createToken(code: string): Promise<string> {
  const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const h = await crypto.subtle.digest('SHA-256', enc.encode('kassza-create:' + norm));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Kulcs a titokból és a PIN-ből; a PBKDF2 sok kört számol, hogy a PIN találgatása lassú legyen. */
export async function deriveKey(secret: string, pin: string, id: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret + ':' + pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('kassza-v1:' + id), iterations: 600_000, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export interface Sealed { iv: string; c: string }

export async function seal(key: CryptoKey, data: unknown): Promise<Sealed> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const c = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  return { iv: b64u(iv), c: b64u(c) };
}

export async function open<T = unknown>(key: CryptoKey, s: Sealed): Promise<T> {
  const p = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(s.iv) }, key, unb64u(s.c));
  return JSON.parse(dec.decode(p)) as T;
}

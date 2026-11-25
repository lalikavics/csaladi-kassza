// Költéskategóriák két szinten: csoport (a grafikon színe) → alkategória.
// Szín a csoport jelentéséhez illik (élelmiszer zöld, lakás kék, közlekedés sárga...), fix, sosem a helyezéstől függ.
// A sorrend a halmozott oszlop sorrendje: így színvakoknak is elválnak a szomszédos sávok (validálva sötét és világos módban).
import type { CustomCat, Item, State } from './ledger';
import { normNote } from './ledger';

export interface Leaf { key: string; hu: string; en: string; words: string[] }
export interface Group { key: string; hu: string; en: string; dark: string; light: string; leaves: Leaf[] }

// kulcsszavak: ékezet nélkül, kisbetűvel; '^' = szó eleje, '=' = pontosan ez a szó
export const GROUPS: Group[] = [
  { key: 'food', hu: 'Élelmiszer', en: 'Groceries', dark: '#0ca30c', light: '#008300', leaves: [
    { key: 'food', hu: 'Élelmiszer', en: 'Groceries', words: ['lidl', 'aldi', 'auchan', 'auch', 'tesco', 'spar', 'penny', 'coop', '^cba', 'bevasarl', 'biobolt', 'azsia', 'kaja', 'kajci', 'bumbu', 'pekseg', 'piac', 'zoldseg'] },
  ] },
  { key: 'shopping', hu: 'Vásárlás', en: 'Shopping', dark: '#d55181', light: '#e87ba4', leaves: [
    { key: 'shopping', hu: 'Vásárlás, otthon, ruha', en: 'Shopping, home, clothes', words: ['ikea', '^obi', 'praktiker', 'jysk', 'gyertya', 'szonyeg', 'doboz', 'flyingtiger', 'virag', 'noveny', '=nov', 'ruha', 'sinsay', 'shein', 'notino', '=dm', 'fodrasz', 'decathlon', 'alza', 'aliexpress', 'emag', 'mediamarkt', 'lego', 'butor', '=vir', 'c&a', 'chinatown', 'dunapanda'] },
  ] },
  { key: 'home', hu: 'Lakás és rezsi', en: 'Home & utilities', dark: '#3987e5', light: '#2a78d6', leaves: [
    { key: 'housing', hu: 'Lakhatás, bérleti díj', en: 'Rent, housing', words: ['berleti', 'lakber', 'alberlet', 'hitel', 'torleszt', 'kozos koltseg'] },
    { key: 'utilities', hu: 'Rezsi', en: 'Utilities', words: ['rezsi', 'villany', '^gaz', '^viz', 'futes', 'szemetszall', 'elmu', 'mvm', '=eon'] },
  ] },
  { key: 'transport', hu: 'Közlekedés', en: 'Transport', dark: '#c98500', light: '#eda100', leaves: [
    { key: 'fuel', hu: 'Üzemanyag', en: 'Fuel', words: ['tank', 'shell', '^mol', '^omv', 'benzin'] },
    { key: 'transit', hu: 'Tömegközlekedés, taxi', en: 'Transit, taxi', words: ['bkk', 'bkv', 'vonat', '=mav', 'taxi', '^bolt', 'berlet'] },
    { key: 'car', hu: 'Autó', en: 'Car', words: ['auto', 'parkol', 'matrica', 'biztosit', 'szerviz', 'gumi'] },
  ] },
  { key: 'subs', hu: 'Előfizetések', en: 'Subscriptions', dark: '#9085e9', light: '#6250d6', leaves: [
    { key: 'phone', hu: 'Telefon, internet', en: 'Phone, internet', words: ['vodafone', 'telekom', 'yettel', 'telenor', '=digi', 'internet'] },
    { key: 'streaming', hu: 'Streaming, zene', en: 'Streaming, music', words: ['spotify', 'netflix', 'youtube', 'hbo', 'disney', '=prime', 'skyshowtime'] },
    { key: 'software', hu: 'Szoftver, felhő', en: 'Software, cloud', words: ['google', 'midjourney', 'icloud', 'apple', 'chatgpt', 'claude', 'microsoft', 'adobe'] },
  ] },
  { key: 'eating', hu: 'Étterem, rendelés', en: 'Eating out', dark: '#d95926', light: '#eb6834', leaves: [
    { key: 'eating', hu: 'Étterem, rendelés', en: 'Eating out', words: ['wolt', 'foodora', 'meki', 'mcdonald', 'kfc', 'burger', 'pizza', 'poke', 'etterem', 'kave', 'cafe', 'baalbek', 'vinozza', 'angolo', 'sushi', 'reggeli', 'ebed', 'vacsora', 'gyros', 'bistro', 'cukraszda', 'etel-ital'] },
  ] },
  { key: 'travel', hu: 'Utazás', en: 'Travel', dark: '#199e70', light: '#1baf7a', leaves: [
    { key: 'travel', hu: 'Utazás', en: 'Travel', words: ['nyaral', 'szallas', 'szall', 'hotel', 'repulo', 'booking', 'airbnb', 'kemping', 'utazas'] },
  ] },
  { key: 'other', hu: 'Egyéb', en: 'Other', dark: '#8b8f97', light: '#8a8a86', leaves: [{ key: 'other', hu: 'Egyéb', en: 'Other', words: [] }] },
];

export const GROUP = new Map(GROUPS.map((g) => [g.key, g]));
const LEAF_GROUP = new Map<string, Group>();
const LEAF = new Map<string, Leaf>();
for (const g of GROUPS) for (const l of g.leaves) { LEAF_GROUP.set(l.key, g); LEAF.set(l.key, l); }
// régebbi, csoportszintű kulcsok (pl. 'subs', 'transport') a csoport „egyéb” tételeként élnek tovább
for (const g of GROUPS) if (!LEAF.has(g.key)) { LEAF.set(g.key, { key: g.key, hu: `${g.hu} – egyéb`, en: `${g.en} – other`, words: [] }); LEAF_GROUP.set(g.key, g); }

// saját alkategóriák (a közös beállításokból): a csoport végére kerülnek, a felismerés is figyelembe veszi őket
let customKeys: string[] = [];
let lastSig = '';
const norm = (w: string) => w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
export function registerCustom(cats: CustomCat[]) {
  const sig = JSON.stringify(cats);
  if (sig === lastSig) return;
  lastSig = sig;
  for (const g of GROUPS) g.leaves = g.leaves.filter((l) => !customKeys.includes(l.key));
  for (const k of customKeys) { LEAF.delete(k); LEAF_GROUP.delete(k); }
  customKeys = [];
  for (const c of cats) {
    const g = GROUP.get(c.group) ?? GROUP.get('other')!;
    const leaf: Leaf = { key: c.key, hu: c.label, en: c.label, words: (c.words ?? []).map(norm).filter(Boolean) };
    // a saját kulcsszó előbb érvényesüljön, mint a beépítettek: a csoport elejére kerül a keresésben
    g.leaves = [...g.leaves, leaf];
    LEAF.set(c.key, leaf); LEAF_GROUP.set(c.key, g); customKeys.push(c.key);
  }
}
export const isCustom = (key: string) => customKeys.includes(key);

export const groupOf = (leaf: string) => LEAF_GROUP.get(leaf) ?? GROUP.get('other')!;
export const leafLabel = (leaf: string, lang: string) => { const l = LEAF.get(leaf) ?? LEAF.get('other')!; return lang === 'hu' ? l.hu : l.en; };
export const groupLabel = (g: Group, lang: string) => (lang === 'hu' ? g.hu : g.en);
export const groupColor = (g: Group, dark: boolean) => (dark ? g.dark : g.light);

export function guessCategory(note: string): string {
  const n = note.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!n.trim()) return 'other';
  const words = n.split(/[^a-z0-9-]+/).filter(Boolean);
  const ordered = [...GROUPS.flatMap((g) => g.leaves.filter((l) => customKeys.includes(l.key))), ...GROUPS.flatMap((g) => g.leaves.filter((l) => !customKeys.includes(l.key)))];
  for (const l of ordered) for (const w of l.words) {
    if (w.startsWith('=')) { if (words.includes(w.slice(1))) return l.key; }
    else if (w.startsWith('^')) { if (words.some((x) => x.startsWith(w.slice(1)))) return l.key; }
    else if (n.includes(w)) return l.key;
  }
  return 'other';
}

/** Kifejezett kategória → korábban megtanult (ugyanilyen megjegyzés) → kulcsszó alapján kitalált. */
export function categoryOf(it: Item, s?: State): string {
  if (it.category) return it.category;
  const learned = s?.learned.get(normNote(it.note));
  return learned ?? guessCategory(it.note);
}

/** Korábbi tételekből javaslatok az új tételhez: megjegyzés + kategória, gyakoriság szerint. */
export interface Suggestion { key: string; label: string; category: string; count: number; kind: Item['kind']; last: string }
export function suggestions(s: State): Suggestion[] {
  const by = new Map<string, { labels: Map<string, number>; count: number; kind: Item['kind']; last: string; cat: string }>();
  for (const it of s.items.values()) {
    if (it.kind !== 'shared' && it.kind !== 'individual') continue;
    const key = normNote(it.note);
    if (!key) continue;
    const label = it.note.replace(/\d{1,4}[.\-,/]\d{1,2}([.\-,/]\d{1,2})?\.?/g, ' ').replace(/\s+/g, ' ').trim();
    const e = by.get(key) ?? { labels: new Map(), count: 0, kind: it.kind, last: '', cat: '' };
    e.count++;
    e.labels.set(label, (e.labels.get(label) ?? 0) + 1);
    if (it.date >= e.last) { e.last = it.date; e.kind = it.kind; e.cat = categoryOf(it, s); }
    by.set(key, e);
  }
  // elírások összevonása: a gyakoribb írásmód marad (pl. „lidli” → „lidl”)
  const heads: [string, typeof by extends Map<string, infer V> ? V : never][] = [];
  for (const [key, e] of [...by].sort((a, b) => b[1].count - a[1].count)) {
    const h = heads.find(([hk]) => similar(hk, key));
    if (!h) { heads.push([key, e]); continue; }
    const he = h[1];
    he.count += e.count;
    for (const [l, n] of e.labels) he.labels.set(l, (he.labels.get(l) ?? 0) + n);
    if (e.last > he.last) { he.last = e.last; he.kind = e.kind; he.cat = e.cat; }
  }
  return heads.map(([key, e]) => {
    const best = [...e.labels].sort((a, b) => b[1] - a[1])[0][0];
    return { key, label: best.charAt(0).toUpperCase() + best.slice(1), category: e.cat, count: e.count, kind: e.kind, last: e.last };
  }).sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}

/** Két normalizált név elírásnak számít-e: 1 betű eltérés, vagy legfeljebb 2 betűs toldalék (min. 4 betűs szónál). */
export function similar(a: string, b: string): boolean {
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length < 4) return false;
  if (l.startsWith(s) && l.length - s.length <= 2 && !l.slice(s.length).includes(' ')) return true;
  if (l.length - s.length > 1) return false;
  // Levenshtein-távolság <= 1
  let i = 0, j = 0, diff = 0;
  while (i < s.length && j < l.length) {
    if (s[i] === l[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (s.length === l.length) { i++; j++; } else j++;
  }
  return diff + (l.length - j) + (s.length - i) <= 1;
}

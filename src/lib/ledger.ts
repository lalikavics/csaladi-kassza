// Eseménynapló és egyenlegmotor.
// Az összegek egész számok a pénznem legkisebb egységében (HUF: fillér, EUR: cent).
// Az egyenleget pontosan számoljuk: belül "összeg × bázispont" egységben (×10 000),
// így a felosztás nem okoz kerekítési hibát. Pozitív egyenleg: B fél tartozik A félnek.

export type Person = 'A' | 'B';
export type Kind = 'shared' | 'transfer' | 'settlement' | 'individual' | 'opening';

export const BP = 10_000; // 100% bázispontban

export interface Item {
  id: string;
  kind: Kind;
  date: string; // YYYY-MM-DD
  amount: number; // alap pénznemben, legkisebb egységben
  /** shared/individual: ki fizette; transfer/settlement: ki adta; opening: ki a hitelező */
  from: Person;
  /** shared: A fél viselte része bázispontban (5000 = 50%) */
  shareA?: number;
  note: string;
  /** költéskategória kulcsa (categories.ts); hiányában a megjegyzésből találjuk ki */
  category?: string;
  /** más pénznemben rögzített tétel: eredeti összeg és árfolyam (1 egység = rate alapegység) */
  currency?: string;
  origAmount?: number;
  rate?: number;
  /** ismétlődő szabályból generált előfordulás: a szabály azonosítója */
  rule?: string;
  /** eredeti szöveg, ha a megnevezést egységesítettük (pl. importkor) */
  orig?: string;
  /** ismétlődés gyakorisága (csak a szabály mintáján) */
  freq?: Freq;
  /** emlékeztető ennyi nappal az esedékesség előtt */
  remind?: number;
}

export type Freq = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** Ismétlődő tétel: a kezdő dátumtól a gyakoriság szerint generálódik, az aktuális napig. */
export type RulePatch = Partial<Pick<Item, 'amount' | 'note' | 'category' | 'shareA' | 'from' | 'remind'>>;
export interface Rule {
  id: string;
  item: Item; // minta; item.date = első előfordulás
  changes: { from: string; patch: RulePatch }[]; // from: YYYY-MM-DD (régi: YYYY-MM), időrendben
  end?: string; // ettől a naptól (régi: hónaptól) már nincs előfordulás
  overrides: Map<string, RulePatch | null>; // egy előfordulás (dátum; régi: hónap) egyedi módosítása; null = kimarad
}

export type Event =
  | { t: 'item.add'; id: string; at: string; by: Person; item: Item }
  | { t: 'item.edit'; id: string; at: string; by: Person; item: Item }
  | { t: 'item.delete'; id: string; at: string; by: Person; itemId: string }
  | { t: 'month.approve'; id: string; at: string; by: Person; month: string }
  | { t: 'month.reopen'; id: string; at: string; by: Person; month: string }
  | { t: 'meta.set'; id: string; at: string; by: Person; patch: Meta }
  | { t: 'rule.add'; id: string; at: string; by: Person; ruleId: string; item: Item }
  | { t: 'rule.change'; id: string; at: string; by: Person; ruleId: string; from: string; patch: RulePatch }
  | { t: 'rule.end'; id: string; at: string; by: Person; ruleId: string; from: string }
  | { t: 'rule.override'; id: string; at: string; by: Person; ruleId: string; month: string; patch: RulePatch | null };

export interface MonthState {
  approvedBy: Person[];
  closed: boolean;
  reopenBy: Person[];
}

/** Közös beállítások, amelyek a két fél között szinkronizálódnak. */
/** Saját alkategória: melyik főkategóriába tartozik, és (nem kötelező) mely szavakból ismerje fel. */
export interface CustomCat { key: string; label: string; group: string; words?: string[] }
export interface Meta { nameA?: string; nameB?: string; currency?: string; shareA?: number; cats?: CustomCat[] }

export interface State {
  meta: Meta;
  items: Map<string, Item>;
  rules: Map<string, Rule>;
  /** megjegyzés (normalizált) → utoljára kifejezetten beállított kategória */
  learned: Map<string, string>;
  months: Map<string, MonthState>;
  log: Event[];
  /** események, amelyeket a motor elutasított (pl. lezárt hónap módosítása) */
  rejected: { event: Event; reason: string }[];
}

export const monthOf = (date: string) => date.slice(0, 7);

/** Egy tétel hatása az egyenlegre, ×BP egységben. */
export function effect(it: Item): number {
  const sign = it.from === 'A' ? 1 : -1;
  switch (it.kind) {
    case 'transfer':
    case 'settlement':
    case 'opening':
      return sign * it.amount * BP;
    case 'shared': {
      const shareA = it.shareA ?? BP / 2;
      // a fizető félnek a másik fél része jár
      const otherShare = it.from === 'A' ? BP - shareA : shareA;
      return sign * it.amount * otherShare;
    }
    case 'individual':
      return 0;
  }
}

function monthState(s: State, m: string): MonthState {
  let ms = s.months.get(m);
  if (!ms) {
    ms = { approvedBy: [], closed: false, reopenBy: [] };
    s.months.set(m, ms);
  }
  return ms;
}

/** Az egyéni tételek nem tartoznak a lezáráshoz. */
const locks = (it: Item) => it.kind !== 'individual';

/** Megjegyzés kulcsa a tanuláshoz és a javaslatokhoz: kisbetű, ékezet és dátumrészek nélkül. */
export function normNote(note: string): string {
  return note.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\d{1,4}[.\-,/]\d{1,2}([.\-,/]\d{1,2})?\.?/g, ' ').replace(/\b\d+\b/g, ' ')
    .replace(/[^a-z0-9&+ -]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const pad = (n: number) => String(n).padStart(2, '0');
export const addMonths = (m: string, by: number) => {
  const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + by, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const daysIn = (m: string) => new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();

export const addDays = (d: string, by: number) => {
  const t = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + by));
  return t.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);

const STEP: Record<Exclude<Freq, 'weekly'>, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/** Egy szabály előfordulási dátumai a kezdettől `until`-ig (beleértve), a leállításig. */
export function occurrenceDates(r: Rule, until: string): string[] {
  const out: string[] = [];
  const start = r.item.date;
  const f = r.item.freq ?? 'monthly';
  for (let k = 0; k < 5000; k++) {
    let d: string;
    if (f === 'weekly') d = addDays(start, 7 * k);
    else {
      const m = addMonths(monthOf(start), k * STEP[f]);
      d = `${m}-${pad(Math.min(+start.slice(8, 10), daysIn(m)))}`;
    }
    if (d > until) break;
    if (r.end && d >= r.end) break; // 'YYYY-MM' végnél a hónap összes napja >= vég
    out.push(d);
  }
  return out;
}

/** Egy szabály adott napi előfordulása (változások és egyedi módosítás alkalmazva), vagy null ha kimarad. */
export function ruleItemFor(r: Rule, date: string): Item | null {
  const ov = r.overrides.has(date) ? r.overrides.get(date) : r.overrides.get(monthOf(date));
  if (ov === null) return null;
  let it: Item = { ...r.item };
  for (const c of r.changes) if (c.from <= date) it = { ...it, ...c.patch };
  if (ov) it = { ...it, ...ov };
  return { ...it, id: `r:${r.id}:${date}`, date, rule: r.id };
}

/** A következő előfordulás egy adott nap után (max. ~13 hónapon belül). */
export function nextOccurrence(r: Rule, after: string): Item | null {
  for (const d of occurrenceDates(r, addDays(after, 400))) {
    if (d <= after) continue;
    const it = ruleItemFor(r, d);
    if (it) return it;
  }
  return null;
}

/** Előfordulások a kezdettől a megadott napig (beleértve). */
export function materialize(s: State, today: string) {
  for (const id of [...s.items.keys()]) if (id.startsWith('r:')) s.items.delete(id);
  for (const r of s.rules.values()) {
    for (const d of occurrenceDates(r, today)) {
      const it = ruleItemFor(r, d);
      if (it) s.items.set(it.id, it);
    }
  }
}

export function replay(log: Event[], today?: string): State {
  const s: State = { meta: {}, items: new Map(), rules: new Map(), learned: new Map(), months: new Map(), log: [], rejected: [] };
  for (const e of log) apply(s, e);
  if (today) materialize(s, today);
  for (const it of [...s.items.values()].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (it.category && it.note) s.learned.set(normNote(it.note), it.category);
  }
  return s;
}

function sameExceptDate(a: Item, b: Item): boolean {
  const ka = Object.keys(a).filter((k) => k !== 'date'), kb = Object.keys(b).filter((k) => k !== 'date');
  if (ka.length !== kb.length) return false;
  return ka.every((k) => JSON.stringify((a as unknown as Record<string, unknown>)[k]) === JSON.stringify((b as unknown as Record<string, unknown>)[k]));
}

export function apply(s: State, e: Event): boolean {
  const reject = (reason: string) => {
    s.rejected.push({ event: e, reason });
    return false;
  };
  const closed = (it: Item | undefined) => !!it && locks(it) && !!s.months.get(monthOf(it.date))?.closed;

  const monthClosed = (m: string) => !!s.months.get(m)?.closed;
  switch (e.t) {
    case 'meta.set':
      s.meta = { ...s.meta, ...e.patch };
      break;
    case 'rule.add':
      if (s.rules.has(e.ruleId)) return reject('duplikált szabály');
      if (locks(e.item) && monthClosed(monthOf(e.item.date))) return reject('lezárt hónap');
      s.rules.set(e.ruleId, { id: e.ruleId, item: e.item, changes: [], overrides: new Map() });
      break;
    case 'rule.change':
    case 'rule.end':
    case 'rule.override': {
      const r = s.rules.get(e.ruleId);
      if (!r) return reject('ismeretlen szabály');
      const m = monthOf(e.t === 'rule.override' ? e.month : e.from);
      if (locks(r.item)) {
        const hit = e.t === 'rule.override' ? monthClosed(m) : [...s.months].some(([k, v]) => v.closed && k >= m);
        if (hit) return reject('lezárt hónap');
      }
      // a már lezárt hónapokat egy későbbi változás sem érintheti: csak előre hat
      if (e.t === 'rule.change') {
        r.changes = [...r.changes.filter((c) => c.from !== e.from), { from: e.from, patch: e.patch }].sort((a, b) => (a.from < b.from ? -1 : 1));
      } else if (e.t === 'rule.end') {
        r.end = !r.end || e.from < r.end ? e.from : r.end;
      } else {
        r.overrides.set(e.month, e.patch);
      }
      break;
    }
    case 'item.add':
      if (s.items.has(e.item.id)) return reject('duplikált azonosító');
      if (closed(e.item)) return reject('lezárt hónap: korrekciós tételt a következő hónapba vegyél fel');
      s.items.set(e.item.id, e.item);
      break;
    case 'item.edit': {
      const old = s.items.get(e.item.id);
      if (!old) return reject('ismeretlen tétel');
      // lezárt hónapban csak a nap javítható a hónapon belül (az egyenleget nem érinti)
      const dayOnly = monthOf(old.date) === monthOf(e.item.date) && sameExceptDate(old, e.item);
      if (!dayOnly && (closed(old) || closed(e.item))) return reject('lezárt hónap');
      s.items.set(e.item.id, e.item);
      break;
    }
    case 'item.delete': {
      const old = s.items.get(e.itemId);
      if (!old) return reject('ismeretlen tétel');
      if (closed(old)) return reject('lezárt hónap');
      s.items.delete(e.itemId);
      break;
    }
    case 'month.approve': {
      const ms = monthState(s, e.month);
      if (ms.closed) return reject('már lezárva');
      if (!ms.approvedBy.includes(e.by)) ms.approvedBy.push(e.by);
      ms.reopenBy = [];
      if (ms.approvedBy.length === 2) ms.closed = true;
      break;
    }
    case 'month.reopen': {
      const ms = monthState(s, e.month);
      if (!ms.closed) {
        // még nincs lezárva: a jóváhagyás visszavonása
        ms.approvedBy = ms.approvedBy.filter((p) => p !== e.by);
        break;
      }
      if (!ms.reopenBy.includes(e.by)) ms.reopenBy.push(e.by);
      if (ms.reopenBy.length === 2) {
        ms.closed = false;
        ms.approvedBy = [];
        ms.reopenBy = [];
      }
      break;
    }
  }
  s.log.push(e);
  return true;
}

export function sortedItems(s: State): Item[] {
  return [...s.items.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

/** Egyenleg ×BP egységben; opcionálisan csak egy dátumig (kizárólag). */
export function balanceRaw(s: State, before?: string): number {
  let e = 0;
  for (const it of s.items.values()) if (!before || it.date < before) e += effect(it);
  return e;
}

/** Megjelenítéshez: legkisebb egységre kerekítve. */
export const toMinor = (raw: number) => Math.round(raw / BP);

export interface MonthReport {
  month: string;
  opening: number; // ×BP
  shared: number;
  transfers: number;
  settlements: number;
  closing: number;
  individual: { A: number; B: number }; // legkisebb egységben
  count: number;
}

export function monthReport(s: State, month: string): MonthReport {
  const start = `${month}-01`;
  const r: MonthReport = {
    month,
    opening: balanceRaw(s, start),
    shared: 0,
    transfers: 0,
    settlements: 0,
    closing: 0,
    individual: { A: 0, B: 0 },
    count: 0,
  };
  for (const it of s.items.values()) {
    if (monthOf(it.date) !== month) continue;
    r.count++;
    const ef = effect(it);
    if (it.kind === 'shared') r.shared += ef;
    else if (it.kind === 'transfer') r.transfers += ef;
    else if (it.kind === 'settlement') r.settlements += ef;
    else if (it.kind === 'opening') r.opening += ef;
    else r.individual[it.from] += it.amount;
  }
  r.closing = r.opening + r.shared + r.transfers + r.settlements;
  return r;
}

export function months(s: State): string[] {
  return [...new Set([...s.items.values()].map((i) => monthOf(i.date)))].sort();
}

/** Más pénznemű összeg átszámítása alap pénznemre (legkisebb egységben, kerekítve). */
export function convert(origMinor: number, rate: number): number {
  return Math.round(origMinor * rate);
}

let counter = 0;
export function newId(): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${(counter++).toString(36)}-${r}`;
}

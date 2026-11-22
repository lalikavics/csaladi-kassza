// A régi "Matek" Google Sheets táblázat importja.
// Csak a szürke keretes középső részt olvassa (8–27. sor), a havi lapok sorrendjében.
// Oszlopok: B/C = A fél adott, E/F = B fél adott, H/I = B fél közös vásárlása,
// K/L = A fél közös vásárlása, U/V = B fél egyéni, X/Y = A fél egyéni.
// Ellenőrzés: minden hónap végén az egyenlegnek egyeznie kell a lap O8/Q8 értékével.

import type { Item, Person } from './ledger';
import { BP, effect, normNote } from './ledger';
import { canonFor } from './canon';

export type CellGetter = (sheet: string, addr: string) => unknown;

const MONTHS = ['Január', 'Február', 'Március', 'Április', 'Május', 'Június', 'Július', 'Augusztus',
  'Szeptember', 'Október', 'November', 'December'];

export interface MonthCheck {
  sheet: string;
  month: string; // YYYY-MM
  expected: number; // legkisebb egységben, pozitív: B tartozik A-nak
  got: number;
  ok: boolean;
}

export interface ImportResult {
  items: Item[];
  checks: MonthCheck[];
  warnings: string[];
  stats: { sheets: number; items: number; settlements: number; transfers: number; shared: number; individual: number };
}

/** "utalás", "rezsi utal", "lakbér utal" és társai rendezésnek számítanak. */
export const SETTLEMENT_RE = /utal/i;

export function parseSheetTitle(title: string): { y: number; m: number } | null {
  const mt = /^(\d{4})(.+)$/.exec(title.trim());
  if (!mt) return null;
  const m = MONTHS.indexOf(mt[2]);
  return m < 0 ? null : { y: +mt[1], m: m + 1 };
}

const toMinor = (v: number) => Math.round(v * 100);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown) => (v == null ? '' : String(v).trim());

export function importWorkbook(sheetNames: string[], get: CellGetter): ImportResult {
  const warnings: string[] = [];
  const sheets = sheetNames
    .map((n) => ({ n, p: parseSheetTitle(n) }))
    .filter((x) => {
      if (!x.p) warnings.push(`Kihagyott lap (nem hónap): ${x.n}`);
      return !!x.p;
    })
    .sort((a, b) => a.p!.y - b.p!.y || a.p!.m - b.p!.m);

  const items: Item[] = [];
  const checks: MonthCheck[] = [];
  const stats = { sheets: sheets.length, items: 0, settlements: 0, transfers: 0, shared: 0, individual: 0 };
  let raw = 0;

  sheets.forEach(({ n, p }, idx) => {
    const month = `${p!.y}-${String(p!.m).padStart(2, '0')}`;
    const date = `${month}-01`;
    const push = (it: Omit<Item, 'id' | 'date'>, row: number, col: string) => {
      let item: Item = { ...it, id: `imp-${month}-${col}${row}`, date };
      if (item.kind === 'shared' || item.kind === 'individual') {
        const c = canonFor(normNote(item.note));
        if (c) item = { ...item, note: c.note, category: c.category, ...(c.note !== item.note ? { orig: item.note } : {}) };
      }
      items.push(item);
      raw += effect(item);
      stats.items++;
    };

    if (idx === 0) {
      // az első lap kézi nyitóértéke
      const c8 = get(n, 'C8'), f8 = get(n, 'F8');
      const open = toMinor(isNum(c8) ? c8 : 0) - toMinor(isNum(f8) ? f8 : 0);
      if (open !== 0) {
        push({ kind: 'opening', amount: Math.abs(open), from: open > 0 ? 'A' : 'B', note: 'Nyitóegyenleg a táblázatból' }, 8, 'O');
      }
    }

    const cols: { name: string; amt: string; who: Person; section: 'loan' | 'shared' | 'individual' }[] = [
      { name: 'B', amt: 'C', who: 'A', section: 'loan' },
      { name: 'E', amt: 'F', who: 'B', section: 'loan' },
      { name: 'H', amt: 'I', who: 'B', section: 'shared' },
      { name: 'K', amt: 'L', who: 'A', section: 'shared' },
      { name: 'U', amt: 'V', who: 'B', section: 'individual' },
      { name: 'X', amt: 'Y', who: 'A', section: 'individual' },
    ];

    for (const c of cols) {
      for (let r = 8; r <= 27; r++) {
        const note = text(get(n, `${c.name}${r}`));
        const v = get(n, `${c.amt}${r}`);
        if (c.section === 'loan' && r === 8) continue; // "Múlthavi" áthozat, nem tétel
        if (note.startsWith('Múlthavi')) continue;
        if (!isNum(v)) {
          if (typeof v === 'string' && v.trim() !== '') warnings.push(`${n} ${c.amt}${r}: szöveg az összeg helyén („${v}”), kihagyva`);
          continue;
        }
        if (v === 0) continue;
        const amount = toMinor(Math.abs(v));
        const neg = v < 0;
        if (c.section === 'loan') {
          const settle = SETTLEMENT_RE.test(note);
          // negatív összeg: fordított irány
          const from: Person = neg ? (c.who === 'A' ? 'B' : 'A') : c.who;
          push({ kind: settle ? 'settlement' : 'transfer', amount, from, note }, r, c.amt);
          settle ? stats.settlements++ : stats.transfers++;
        } else if (c.section === 'shared') {
          if (neg) warnings.push(`${n} ${c.amt}${r}: negatív közös tétel (${v}), előjelesen importálva`);
          // negatív közös tétel = visszatérítés: a másik fél fizette "vissza"
          const from: Person = neg ? (c.who === 'A' ? 'B' : 'A') : c.who;
          push({ kind: 'shared', amount, from, shareA: BP / 2, note }, r, c.amt);
          stats.shared++;
        } else {
          push({ kind: 'individual', amount, from: c.who, note }, r, c.amt);
          stats.individual++;
        }
      }
    }

    const o8 = get(n, 'O8'), q8 = get(n, 'Q8');
    if (isNum(o8) && isNum(q8)) {
      const expected = toMinor(o8) - toMinor(q8);
      const got = Math.round(raw / BP);
      checks.push({ sheet: n, month, expected, got, ok: Math.abs(expected - got) <= 1 });
    } else {
      warnings.push(`${n}: nincs kiszámolt egyenleg az O8/Q8 cellában`);
    }
  });

  return { items, checks, warnings, stats };
}

// Dátum kiolvasása a tétel megnevezéséből, pl. „Lidl 9.04”, „Aldi 9.14.”, „Tesco 09.4”.
// Az első szám a hónap, a második a nap. Az évet a tétel jelenlegi dátumából vesszük
// (decemberi dátum januári tételnél: előző év; januári dátum decemberi tételnél: következő év).

import type { Item } from './ledger';
import { monthOf } from './ledger';

export interface DateFix {
  item: Item;
  /** a megnevezésből kiolvasott új dátum, YYYY-MM-DD */
  date: string;
  /** a talált szövegrész, pl. „9.04” */
  match: string;
  /** az új dátum más hónapba esik, mint ahol a tétel most van */
  otherMonth: boolean;
}

// hónap.nap, utána pont vagy semmi; előtte/utána nem állhat szám, vessző vagy pont+szám (összegek, verziók kizárva)
const RE = /(?<![\d.,])(\d{1,2})\s*[./]\s*(\d{1,2})\.?(?![\d,]|\.\d)/;

const pad = (n: number) => String(n).padStart(2, '0');

export function dateFromNote(note: string, current: string): { date: string; match: string } | null {
  const m = RE.exec(note);
  if (!m) return null;
  const mo = +m[1], d = +m[2];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const curY = +current.slice(0, 4), curM = +current.slice(5, 7);
  let y = curY;
  if (curM <= 2 && mo >= 11) y = curY - 1;
  else if (curM >= 11 && mo <= 2) y = curY + 1;
  const last = new Date(y, mo, 0).getDate();
  if (d > last) return null;
  return { date: `${y}-${pad(mo)}-${pad(d)}`, match: m[0].trim() };
}

/** Javaslatok: csak ahol a megnevezésben van dátum, és az eltér a tétel jelenlegi dátumától. */
export function findDateFixes(items: Iterable<Item>): DateFix[] {
  const out: DateFix[] = [];
  for (const it of items) {
    if (it.rule || it.kind === 'opening') continue;
    const r = dateFromNote(it.note ?? '', it.date);
    if (!r || r.date === it.date) continue;
    out.push({ item: it, date: r.date, match: r.match, otherMonth: monthOf(r.date) !== monthOf(it.date) });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Ugyanabban a hónapban azonos összegű tételek (ismétlődőkkel együtt), a szerkesztett tétel kivételével. */
export function sameAmountInMonth(items: Iterable<Item>, date: string, amount: number, exceptId?: string): Item[] {
  const m = monthOf(date);
  const out: Item[] = [];
  for (const it of items) {
    if (it.id === exceptId || it.kind === 'opening') continue;
    if (it.amount === amount && monthOf(it.date) === m) out.push(it);
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

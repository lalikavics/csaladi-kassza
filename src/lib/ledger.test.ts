import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { apply, balanceRaw, BP, effect, monthReport, normNote, nextOccurrence, replay, toMinor, type Event, type Item, type Person } from './ledger';
import { importWorkbook } from './importSheet';

const item = (p: Partial<Item>): Item => ({ id: Math.random().toString(36), kind: 'shared', date: '2026-11-05', amount: 1000, from: 'A', note: '', ...p });
const add = (it: Item, by: Person = 'A'): Event => ({ t: 'item.add', id: 'e' + it.id, at: '', by, item: it });

describe('előjeltábla', () => {
  it('pénzadás és rendezés', () => {
    expect(effect(item({ kind: 'transfer', from: 'A' }))).toBe(1000 * BP);
    expect(effect(item({ kind: 'transfer', from: 'B' }))).toBe(-1000 * BP);
    expect(effect(item({ kind: 'settlement', from: 'B' }))).toBe(-1000 * BP);
    expect(effect(item({ kind: 'settlement', from: 'A' }))).toBe(1000 * BP);
  });
  it('közös költés felosztással', () => {
    expect(effect(item({ from: 'A' }))).toBe(500 * BP);
    expect(effect(item({ from: 'B' }))).toBe(-500 * BP);
    // A viseli a 70%-ot
    expect(effect(item({ from: 'A', shareA: 7000 }))).toBe(300 * BP);
    expect(effect(item({ from: 'B', shareA: 7000 }))).toBe(-700 * BP);
  });
  it('egyéni költés nem hat', () => expect(effect(item({ kind: 'individual' }))).toBe(0));
  it('a doksi példája: 40 000 közös B-től, 20 000 + 55 000 pénzadás után nulla', () => {
    const s = replay([
      add(item({ amount: 40000, from: 'B' })),
      add(item({ kind: 'transfer', amount: 20000, from: 'A' })),
    ]);
    expect(toMinor(balanceRaw(s))).toBe(0);
  });
});

describe('szimmetria', () => {
  it('a szerepek felcserélése az egyenleg előjelét fordítja', () => {
    const kinds = ['shared', 'transfer', 'settlement', 'individual', 'opening'] as const;
    for (let i = 0; i < 5000; i++) {
      const it = item({ kind: kinds[i % 5], amount: Math.floor(Math.random() * 1e8), from: i % 2 ? 'A' : 'B', shareA: Math.floor(Math.random() * BP) });
      const sw = { ...it, from: (it.from === 'A' ? 'B' : 'A') as Person, shareA: BP - (it.shareA ?? BP / 2) };
      expect(effect(sw)).toBe(-effect(it) || 0);
    }
  });
});

describe('hónap lezárása', () => {
  it('csak mindkét fél jóváhagyásával zár, utána a közös tételek zároltak', () => {
    const t = item({ date: '2026-10-10' });
    const s = replay([add(t), { t: 'month.approve', id: 'm1', at: '', by: 'A', month: '2026-10' }]);
    expect(s.months.get('2026-10')!.closed).toBe(false);
    apply(s, { t: 'month.approve', id: 'm2', at: '', by: 'B', month: '2026-10' });
    expect(s.months.get('2026-10')!.closed).toBe(true);
    expect(apply(s, { t: 'item.delete', id: 'd', at: '', by: 'A', itemId: t.id })).toBe(false);
    expect(apply(s, add(item({ date: '2026-10-20' })))).toBe(false);
    // egyéni tétel lezárt hónapba is mehet
    expect(apply(s, add(item({ kind: 'individual', date: '2026-10-20' })))).toBe(true);
    // közös újranyitás
    apply(s, { t: 'month.reopen', id: 'r1', at: '', by: 'A', month: '2026-10' });
    expect(s.months.get('2026-10')!.closed).toBe(true);
    apply(s, { t: 'month.reopen', id: 'r2', at: '', by: 'B', month: '2026-10' });
    expect(s.months.get('2026-10')!.closed).toBe(false);
    expect(apply(s, { t: 'item.delete', id: 'd2', at: '', by: 'A', itemId: t.id })).toBe(true);
  });
  it('havi kimutatás: nyitó + mozgások = záró', () => {
    const s = replay([
      add(item({ kind: 'opening', amount: 18200, date: '2026-09-01' })),
      add(item({ amount: 62900, date: '2026-10-03' })),
      add(item({ kind: 'transfer', amount: 30000, date: '2026-10-08' })),
      add(item({ kind: 'settlement', amount: 37300, from: 'B', date: '2026-10-20' })),
    ]);
    const r = monthReport(s, '2026-10');
    expect(toMinor(r.opening)).toBe(18200);
    expect(toMinor(r.closing)).toBe(18200 + 31450 + 30000 - 37300);
  });
});

const XLSX_PATH = process.env.KASSZA_XLSX ?? '';
describe.skipIf(!XLSX_PATH || !existsSync(XLSX_PATH))('elfogadási teszt: a régi táblázat', () => {
  it('minden hónap záró egyenlege egyezik a táblázattal', () => {
    const wb = XLSX.read(readFileSync(XLSX_PATH));
    const res = importWorkbook(wb.SheetNames, (sh, a) => wb.Sheets[sh]?.[a]?.v);
    const bad = res.checks.filter((c) => !c.ok);
    console.log('lapok:', res.stats.sheets, 'tételek:', res.stats.items, res.stats, 'eltérés:', bad.length);
    console.log('figyelmeztetések:', res.warnings.length, res.warnings.slice(0, 5));
    const last = res.checks.at(-1)!;
    console.log('utolsó hónap', last.month, 'várt', last.expected / 100, 'kapott', last.got / 100);
    expect(res.checks.length).toBe(res.stats.sheets);
    expect(bad).toEqual([]);
    // a motor ugyanazt adja, ha eseményként visszajátsszuk
    const s = replay(res.items.map((it) => ({ t: 'item.add', id: 'i' + it.id, at: '', by: 'A', item: it }) as Event));
    expect(Math.abs(toMinor(balanceRaw(s)) - last.expected)).toBeLessThanOrEqual(1);
  });
});

describe('ismétlődő tételek', () => {
  const ev = (e: object) => ({ id: Math.random().toString(36), at: '', by: 'A', ...e }) as Event;
  const rent = item({ id: 'rent', amount: 130000, date: '2026-09-05', note: 'Bérleti díj', category: 'housing' });
  it('havonta megjelenik a mai napig, a változás csak előre hat', () => {
    let s = replay([ev({ t: 'rule.add', ruleId: 'R', item: rent })], '2027-02-10');
    const amounts = () => [...s.items.values()].filter((i) => i.rule === 'R').sort((a, b) => (a.date < b.date ? -1 : 1)).map((i) => [i.date, i.amount]);
    expect(amounts()).toEqual([['2026-09-05', 130000], ['2026-10-05', 130000], ['2026-11-05', 130000], ['2026-12-05', 130000], ['2027-01-05', 130000], ['2027-02-05', 130000]]);
    s = replay([ev({ t: 'rule.add', ruleId: 'R', item: rent }), ev({ t: 'rule.change', ruleId: 'R', from: '2027-01', patch: { amount: 140000 } })], '2027-02-10');
    expect(amounts().map((x) => x[1])).toEqual([130000, 130000, 130000, 130000, 140000, 140000]);
  });
  it('egy hónap kihagyható, a leállítás onnantól hat, a jövő nem jelenik meg', () => {
    const s = replay([
      ev({ t: 'rule.add', ruleId: 'R', item: rent }),
      ev({ t: 'rule.override', ruleId: 'R', month: '2026-10', patch: null }),
      ev({ t: 'rule.end', ruleId: 'R', from: '2026-12' }),
    ], '2026-11-04');
    expect([...s.items.keys()].sort()).toEqual(['r:R:2026-09-05']);
  });
  it('lezárt hónapra visszamenő változás elutasítva', () => {
    const s = replay([
      ev({ t: 'rule.add', ruleId: 'R', item: rent }),
      ev({ t: 'month.approve', month: '2026-10', by: 'A' }),
      ev({ t: 'month.approve', month: '2026-10', by: 'B' }),
    ], '2026-12-20');
    expect(apply(s, ev({ t: 'rule.change', ruleId: 'R', from: '2026-10', patch: { amount: 1 } }))).toBe(false);
    expect(apply(s, ev({ t: 'rule.change', ruleId: 'R', from: '2026-11', patch: { amount: 1 } }))).toBe(true);
  });
  it('heti, negyedéves és éves ismétlődés, előfordulásonkénti módosítás', () => {
    const weekly = item({ id: 'w', amount: 1000, date: '2026-11-02', note: 'Piac' });
    const yearly = item({ id: 'y', amount: 90000, date: '2026-01-31', note: 'Autó biztosítás' });
    const s = replay([
      ev({ t: 'rule.add', ruleId: 'W', item: { ...weekly, freq: 'weekly' } }),
      ev({ t: 'rule.add', ruleId: 'Q', item: { ...yearly, id: 'q', freq: 'quarterly' } }),
      ev({ t: 'rule.add', ruleId: 'Y', item: { ...yearly, freq: 'yearly' } }),
      ev({ t: 'rule.override', ruleId: 'W', month: '2026-11-09', patch: { amount: 2500 } }),
      ev({ t: 'rule.change', ruleId: 'W', from: '2026-11-16', patch: { amount: 1200 } }),
    ], '2027-02-01');
    const w = [...s.items.values()].filter((i) => i.rule === 'W').sort((a, b) => (a.date < b.date ? -1 : 1)).map((i) => `${i.date}:${i.amount}`);
    expect(w.slice(0, 4)).toEqual(['2026-11-02:1000', '2026-11-09:2500', '2026-11-16:1200', '2026-11-23:1200']);
    expect([...s.items.values()].filter((i) => i.rule === 'Q').map((i) => i.date).sort()).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31', '2027-01-31']);
    expect([...s.items.values()].filter((i) => i.rule === 'Y').map((i) => i.date)).toEqual(['2026-01-31', '2027-01-31']);
    expect(nextOccurrence(s.rules.get('Y')!, '2027-02-01')?.date).toBe('2028-01-31');
  });
  it('dátumrészek nélküli megjegyzéskulcs', () => {
    expect(normNote('Lidl05.02')).toBe('lidl');
    expect(normNote('Tankolás06,22')).toBe('tankolas');
    expect(normNote('lidl 02.04.')).toBe('lidl');
  });
});

import { dateFromNote, findDateFixes, sameAmountInMonth } from './dateFromNote';

describe('dátum a megnevezésből', () => {
  it('hónap.nap formák', () => {
    expect(dateFromNote('Lidl 9.04', '2026-09-01')?.date).toBe('2026-09-04');
    expect(dateFromNote('Aldi 9.14.', '2026-09-01')?.date).toBe('2026-09-14');
    expect(dateFromNote('Tesco 09.4 bevásárlás', '2026-09-01')?.date).toBe('2026-09-04');
    expect(dateFromNote('Spar 10/2', '2026-10-01')?.date).toBe('2026-10-02');
  });
  it('évforduló', () => {
    expect(dateFromNote('Lidl 12.30', '2027-01-01')?.date).toBe('2026-12-30');
    expect(dateFromNote('Lidl 1.02', '2026-12-01')?.date).toBe('2027-01-02');
  });
  it('nem dátum', () => {
    expect(dateFromNote('Lidl', '2026-09-01')).toBeNull();
    expect(dateFromNote('1,5 kg alma', '2026-09-01')).toBeNull();
    expect(dateFromNote('Aldi 13.04', '2026-09-01')).toBeNull();
    expect(dateFromNote('Lidl 2.30', '2026-02-01')).toBeNull();
    expect(dateFromNote('verzió 1.2.3', '2026-02-01')).toBeNull();
  });
  it('javaslatok és azonos összeg', () => {
    const items = [
      { id: 'a', kind: 'shared', date: '2026-09-01', amount: 500000, from: 'A', note: 'Lidl 9.04' },
      { id: 'b', kind: 'shared', date: '2026-09-04', amount: 500000, from: 'B', note: 'Aldi 9.04' },
      { id: 'c', kind: 'shared', date: '2026-09-01', amount: 120000, from: 'A', note: 'Spar 8.31' },
    ] as Item[];
    const f = findDateFixes(items);
    expect(f.map((x) => [x.item.id, x.date, x.otherMonth])).toEqual([['c', '2026-08-31', true], ['a', '2026-09-04', false]]);
    expect(sameAmountInMonth(items, '2026-09-20', 500000).map((i) => i.id)).toEqual(['a', 'b']);
    expect(sameAmountInMonth(items, '2026-10-20', 500000)).toEqual([]);
  });
  it('lezárt hónapban a nap javítható, a hónap nem', () => {
    const it0 = { id: 'x', kind: 'shared', date: '2026-09-01', amount: 100, from: 'A', note: 'Lidl 9.04', shareA: 5000 } as Item;
    const ev = (e: object, i: number) => ({ id: 'e' + i, at: '2026-10-01T00:00:00Z', by: 'A', ...e }) as Event;
    const log = [ev({ t: 'item.add', item: it0 }, 1), ev({ t: 'month.approve', month: '2026-09' }, 2), { ...ev({ t: 'month.approve', month: '2026-09' }, 3), by: 'B' } as Event];
    const s = replay([...log, ev({ t: 'item.edit', item: { ...it0, date: '2026-09-04' } }, 4)]);
    expect(s.items.get('x')?.date).toBe('2026-09-04');
    const s2 = replay([...log, ev({ t: 'item.edit', item: { ...it0, date: '2026-10-04' } }, 5)]);
    expect(s2.items.get('x')?.date).toBe('2026-09-01');
    const s3 = replay([...log, ev({ t: 'item.edit', item: { ...it0, date: '2026-09-04', amount: 200 } }, 6)]);
    expect(s3.items.get('x')?.amount).toBe(100);
  });
});

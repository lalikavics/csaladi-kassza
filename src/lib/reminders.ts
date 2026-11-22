// Emlékeztetők: ismétlődő tételek következő előfordulása, és a jövőbeli dátumú tételek.
import { addDays, daysBetween, nextOccurrence, type Item, type State } from './ledger';

export interface Due { id: string; item: Item; daysLeft: number }

export function dueReminders(s: State, today: string): Due[] {
  const out: Due[] = [];
  for (const r of s.rules.values()) {
    const it = nextOccurrence(r, addDays(today, -1)); // a mai esedékesség is
    if (!it?.remind) continue;
    const left = daysBetween(today, it.date);
    if (left >= 0 && left <= it.remind) out.push({ id: it.id, item: it, daysLeft: left });
  }
  for (const it of s.items.values()) {
    if (it.rule || !it.remind || it.date < today) continue;
    const left = daysBetween(today, it.date);
    if (left <= it.remind) out.push({ id: it.id + '@' + it.date, item: it, daysLeft: left });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function upcoming(s: State, today: string, days = 45): Item[] {
  const lim = addDays(today, days);
  const out: Item[] = [];
  for (const r of s.rules.values()) {
    const it = nextOccurrence(r, today);
    if (it && it.date <= lim) out.push(it);
  }
  for (const it of s.items.values()) if (!it.rule && it.date > today && it.date <= lim) out.push(it);
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

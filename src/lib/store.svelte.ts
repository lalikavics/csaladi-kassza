// Alkalmazásállapot: beállítások + eseménynapló, helyi tárolással.
// A titkosított szinkron a 3. ütemben jön; addig minden csak ezen az eszközön van.
import { apply, newId, replay, type Event, type Item, type Person, type RulePatch, type State } from './ledger';
import { today } from './format';
import { SHARED } from './config';
import type { Meta } from './ledger';
import { detectLang, dicts, fill, type Lang } from './i18n';

export type Visibility = 'private' | 'total' | 'items';

export interface Settings {
  nameA: string;
  nameB: string;
  currency: string;
  shareA: number; // bázispont
  visibility: Visibility;
  lang: Lang | 'auto';
  theme: 'dark' | 'light' | 'auto';
  me: Person;
  onboarded: boolean;
  meChosen: boolean;
  dismissed: string[];
  notified: string[];
  seenPlans: boolean;
}

const KEY = 'kassza.v1';
const defaults: Settings = {
  nameA: '', nameB: '', currency: 'HUF', shareA: 5000, visibility: 'total', lang: 'auto', theme: 'dark', me: 'A', meChosen: false, dismissed: [], notified: [], onboarded: false, seenPlans: false,
};

function load(): { settings: Settings; log: Event[] } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return { settings: { ...defaults, ...d.settings }, log: d.log ?? [] };
    }
  } catch {
    /* a tároló nem elérhető: memóriában dolgozunk */
  }
  return { settings: { ...defaults }, log: [] };
}

const init = load();

class App {
  settings = $state<Settings>(init.settings);
  log = $state.raw<Event[]>(init.log);
  storageOk = $state(true);

  state: State = $derived(replay(this.log, today()));

  get themeResolved(): 'dark' | 'light' {
    if (this.settings.theme !== 'auto') return this.settings.theme;
    try { return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; } catch { return 'dark'; }
  }

  get lang(): Lang {
    return this.settings.lang === 'auto' ? detectLang() : this.settings.lang;
  }
  get d() {
    return dicts[this.lang];
  }
  t = (k: keyof (typeof dicts)['hu'], v?: Record<string, string | number>) => fill(this.d[k] as string, v);

  name = (p: Person) => (p === 'A' ? this.settings.nameA || 'A fél' : this.settings.nameB || 'B fél');
  other = (p: Person): Person => (p === 'A' ? 'B' : 'A');

  /** Közös módban a napló a szinkronon keresztül megy (titkosítva); helyben csak a beállítások. */
  shared = SHARED;
  onEmit: ((evs: Event[]) => void) | null = null;

  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.shared ? { settings: this.settings } : { settings: this.settings, log: this.log }));
      this.storageOk = true;
    } catch {
      this.storageOk = false;
    }
  }

  /** Esemény hozzáadása; a motor dönti el, elfogadja-e. */
  emit(e: Omit<Event, 'id' | 'at' | 'by'>): string | null {
    const ev = { ...e, id: newId(), at: new Date().toISOString(), by: this.settings.me } as Event;
    const probe = replay(this.log);
    if (!apply(probe, ev)) return probe.rejected.at(-1)?.reason ?? 'elutasítva';
    if (this.onEmit) this.onEmit([ev]);
    else { this.log = [...this.log, ev]; this.persist(); }
    return null;
  }

  /** Közös beállítás (nevek, pénznem, felosztás): eseményként, hogy a másik félnél is megjelenjen. */
  setMeta(patch: Meta) {
    Object.assign(this.settings, patch);
    this.saveSettings();
    return this.emit({ t: 'meta.set', patch } as Event);
  }
  /** A közös beállítások átvétele az eseménynaplóból. */
  applyMeta(m: Meta) {
    let changed = false;
    for (const k of ['nameA', 'nameB', 'currency', 'shareA'] as const) {
      if (m[k] != null && this.settings[k] !== m[k]) { (this.settings as unknown as Record<string, unknown>)[k] = m[k]; changed = true; }
    }
    if (m.nameA && !this.settings.onboarded) { this.settings.onboarded = true; this.settings.seenPlans = true; changed = true; }
    if (changed) this.saveSettings();
  }
  /** Sok esemény egyszerre (import, visszaállítás). */
  bulk(evs: Event[]) {
    if (this.onEmit) this.onEmit(evs);
    else { this.log = [...this.log, ...evs]; this.persist(); }
  }

  addItem(it: Item) { return this.emit({ t: 'item.add', item: it } as Event); }
  editItem(it: Item) { return this.emit({ t: 'item.edit', item: it } as Event); }
  deleteItem(itemId: string) { return this.emit({ t: 'item.delete', itemId } as Event); }
  approve(month: string) { return this.emit({ t: 'month.approve', month } as Event); }
  reopen(month: string) { return this.emit({ t: 'month.reopen', month } as Event); }

  addRule(item: Item) { return this.emit({ t: 'rule.add', ruleId: newId(), item } as Event); }
  changeRule(ruleId: string, from: string, patch: RulePatch) { return this.emit({ t: 'rule.change', ruleId, from, patch } as Event); }
  endRule(ruleId: string, from: string) { return this.emit({ t: 'rule.end', ruleId, from } as Event); }
  overrideRule(ruleId: string, month: string, patch: RulePatch | null) { return this.emit({ t: 'rule.override', ruleId, month, patch } as Event); }

  replaceItems(items: Item[]) {
    const at = new Date().toISOString();
    if (this.shared) {
      // a közös napló csak bővülhet: importálni csak üres kasszába lehet
      if (this.state.items.size) return false;
      this.bulk(items.map((item) => ({ t: 'item.add', id: newId(), at, by: this.settings.me, item }) as Event));
      return true;
    }
    // az import a tételeket cseréli; a meglévő ismétlődő szabályok megmaradnak
    const rules = this.log.filter((e) => e.t.startsWith('rule.'));
    this.log = [...rules, ...items.map((item) => ({ t: 'item.add', id: newId(), at, by: 'A', item }) as Event)];
    this.persist();
    return true;
  }

  saveSettings() { this.persist(); }

  exportBackup(): string {
    return JSON.stringify({ app: 'kassza', v: 1, settings: this.settings, log: this.log });
  }
  importBackup(text: string): boolean {
    try {
      const d = JSON.parse(text);
      if (d.app !== 'kassza' || !Array.isArray(d.log)) return false;
      replay(d.log);
      if (this.shared) {
        if (this.state.items.size) return false;
        const st = d.settings ?? {};
        const meta = { t: 'meta.set', id: newId(), at: new Date().toISOString(), by: this.settings.me, patch: { nameA: st.nameA, nameB: st.nameB, currency: st.currency, shareA: st.shareA } } as Event;
        this.bulk([meta, ...d.log]);
        return true;
      }
      this.settings = { ...defaults, ...d.settings };
      this.log = d.log;
      this.persist();
      return true;
    } catch {
      return false;
    }
  }
  reset() {
    this.settings = { ...defaults };
    this.log = [];
    try { localStorage.removeItem(KEY); } catch { /* */ }
  }
}

export const app = new App();

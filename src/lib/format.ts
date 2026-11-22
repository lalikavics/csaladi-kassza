const cache = new Map<string, Intl.NumberFormat>();

/** Legkisebb egységből (×100) olvasható összeg, pl. „42 350 Ft”. */
export function money(minor: number, currency: string, lang = 'hu'): string {
  const k = currency + lang;
  let f = cache.get(k);
  if (!f) {
    try {
      f = new Intl.NumberFormat(lang === 'hu' ? 'hu-HU' : 'en-GB', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 });
    } catch {
      f = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 });
    }
    cache.set(k, f);
  }
  return f.format(minor / 100);
}

/** Beírt összeg („12 490”, „12,5”, „1.234,50”) → legkisebb egység, vagy null. */
export function parseAmount(s: string): number | null {
  let t = s.replace(/[\s ]/g, '');
  if (!t) return null;
  if (t.includes(',') && t.includes('.')) t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

export function parseRate(s: string): number | null {
  const t = s.replace(/\s/g, '').replace(',', '.');
  const v = parseFloat(t);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function monthLabel(m: string, lang = 'hu'): string {
  const [y, mo] = m.split('-').map(Number);
  return new Intl.DateTimeFormat(lang === 'hu' ? 'hu-HU' : 'en-GB', { year: 'numeric', month: 'long' }).format(new Date(y, mo - 1, 1));
}

export function shiftMonth(m: string, by: number): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const CURRENCIES = ['HUF', 'EUR', 'USD', 'GBP', 'CHF', 'CZK', 'PLN', 'RON', 'HRK'].filter((c) => c !== 'HRK');

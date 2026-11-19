// Display currency. All stored amounts are EUR; this only converts what is SHOWN.
// Data entry (forms, imports) stays in EUR on purpose.
import { useSyncExternalStore } from 'react';

const KEY = 'gy-cur';
export const CURRENCIES = { EUR: '€', GBP: '£', ILS: '₪' };

let cur = 'EUR';
try { const c = localStorage.getItem(KEY); if (CURRENCIES[c]) cur = c; } catch { /* private mode */ }
let fx = null; // { date, perEur: { GBP, ILS } } from /api/fx (Bank of Israel representative rates)
let version = 0;
const subs = new Set();
const emit = () => { version++; subs.forEach(f => f()); };

export function setCurrency(c) {
  if (!CURRENCIES[c] || c === cur) return;
  cur = c;
  try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
  emit();
}

export async function loadRates() {
  try {
    const r = await fetch('/api/fx');
    if (!r.ok) return;
    const j = await r.json();
    if (j && j.perEur && j.perEur.GBP > 0 && j.perEur.ILS > 0) { fx = j; emit(); }
  } catch { /* keep EUR */ }
}

// Currency actually in effect: without rates we never pretend to convert.
export function activeCurrency() { return cur !== 'EUR' && fx ? cur : 'EUR'; }
export function selectedCurrency() { return cur; }
export function rateInfo() { return fx; }
export function sym() { return CURRENCIES[activeCurrency()]; }
export function convert(eur) {
  const c = activeCurrency();
  return c === 'EUR' ? Number(eur) : Number(eur) * fx.perEur[c];
}

// money(1234.5) -> "€1,234.50"; signed -> "+€1,234.50" / "−€…"
export function money(n, { digits = 2, signed = false, empty = '—' } = {}) {
  if (n == null || n === '' || Number.isNaN(Number(n))) return empty;
  const v = convert(n);
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const sign = v < 0 ? '−' : (signed ? '+' : '');
  return `${sign}${sym()}${s}`;
}

const subscribe = f => { subs.add(f); return () => subs.delete(f); };
// Call in any component that must re-render when the currency or rates change.
export function useCurrency() {
  useSyncExternalStore(subscribe, () => version);
  return activeCurrency();
}

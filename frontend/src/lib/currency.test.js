// Run: node src/lib/currency.test.js
import assert from 'node:assert';
import { money, setCurrency, loadRates, activeCurrency } from './currency.js';

// Default EUR, same output as the old fmt() for positives
assert.strictEqual(money(1234.5), '€1,234.50');
assert.strictEqual(money(null), '—');
assert.strictEqual(money(''), '—');
assert.strictEqual(money(-10), '−€10.00');
assert.strictEqual(money(5, { signed: true }), '+€5.00');

// GBP chosen but no rates yet -> never fake a conversion
setCurrency('GBP');
assert.strictEqual(activeCurrency(), 'EUR');
assert.strictEqual(money(100), '€100.00');

// Bad rate payload is ignored
globalThis.fetch = async () => ({ ok: true, json: async () => ({ perEur: { GBP: 0, ILS: 3.6 } }) });
await loadRates();
assert.strictEqual(activeCurrency(), 'EUR');

// Real-shaped payload: €1 = £0.8 = ₪3.6
globalThis.fetch = async () => ({ ok: true, json: async () => ({ date: '2026-11-19', perEur: { GBP: 0.8, ILS: 3.6 } }) });
await loadRates();
assert.strictEqual(money(100), '£80.00');
setCurrency('ILS');
assert.strictEqual(money(100, { digits: 0 }), '₪360');
setCurrency('XXX'); // unknown ignored
assert.strictEqual(activeCurrency(), 'ILS');
setCurrency('EUR');
assert.strictEqual(money(100), '€100.00');

console.log('currency.test.js: all passed');

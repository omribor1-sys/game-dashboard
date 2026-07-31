const assert = require('node:assert');
const { toNum, toEur, round2, isSummaryRow, getRowName } = require('../utils/parser');

// ── toNum: strip currency symbols/thousands, keep number ──
assert.strictEqual(toNum('€623.04'), 623.04);
assert.strictEqual(toNum('£1,234.50'), 1234.50);   // comma stripped
assert.strictEqual(toNum('-50'), -50);              // negative kept
assert.strictEqual(toNum(''), 0);
assert.strictEqual(toNum(null), 0);
assert.strictEqual(toNum('abc'), 0);                // no digits -> 0, never NaN
assert.strictEqual(toNum(42), 42);

// ── toEur: THE money function. £ present -> convert at 1.16; anything else is already EUR ──
assert.strictEqual(toEur('£10'), 11.6);             // GBP -> EUR
assert.strictEqual(toEur('€10'), 10);               // EUR stays EUR (no double convert)
assert.strictEqual(toEur('10'), 10);                // bare number = already EUR (CLAUDE.md rule)
assert.strictEqual(toEur(''), 0);
assert.strictEqual(toEur(null), 0);
// £ anywhere in the string triggers conversion; € never does
assert.strictEqual(toEur('£1,000'), 1160);
assert.strictEqual(round2(toEur('£38')), 44.08);    // PL membership example

// ── round2: 2-decimal money rounding ──
assert.strictEqual(round2(623.045), 623.05);
assert.strictEqual(round2(10), 10);
assert.strictEqual(round2(1 / 3), 0.33);

// ── getRowName: name from NAME/FIRST NAME/FULL NAME, trimmed ──
assert.strictEqual(getRowName({ NAME: '  Zohaib  ' }), 'Zohaib');
assert.strictEqual(getRowName({ 'FIRST NAME': 'Eli' }), 'Eli');
assert.strictEqual(getRowName({ 'FULL NAME': 'Jane Doe' }), 'Jane Doe');
assert.strictEqual(getRowName({ NAME: 'A', 'FIRST NAME': 'B' }), 'A'); // NAME wins
assert.strictEqual(getRowName({}), '');

// ── isSummaryRow: must drop TOTAL/ELI/COST/VS meta rows, keep real buyers ──
// (a real buyer must NOT be filtered — dropping them silently loses revenue)
assert.strictEqual(isSummaryRow('Zohaib Ratani', 'ZOHAIB RATANI|623.04|STUBHUB'), false);
assert.strictEqual(isSummaryRow('', '|||'), true);                 // blank name
assert.strictEqual(isSummaryRow('TOTAL COST', 'TOTAL COST|389.76'), true);
assert.strictEqual(isSummaryRow('Eli', 'ELI|100'), true);          // Eli cost row
assert.strictEqual(isSummaryRow('Arsenal v Fulham', 'ARSENAL V FULHAM'), true); // fixture header ' V '
assert.strictEqual(isSummaryRow('Arsenal vs Fulham', 'ARSENAL VS FULHAM'), true);
assert.strictEqual(isSummaryRow('John', 'JOHN|TOTAL PROFIT: 200'), true); // total-profit summary text

console.log('parser: all assertions passed');

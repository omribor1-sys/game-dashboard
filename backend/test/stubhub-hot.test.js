const assert = require('node:assert');
const { splitTeams, pctChange, tierOf, parseEvents, insightOf } = require('../services/stubhub-hot');

// Competition suffix is stripped before splitting, or "Lille - Champions League…" never matches.
assert.deepStrictEqual(splitTeams('Arsenal FC vs LOSC Lille - Champions League 2026-2027'),
  { home: 'Arsenal FC', away: 'LOSC Lille', label: 'Champions League 2026-2027' });
assert.deepStrictEqual(splitTeams('Fleetwood Town FC vs Arsenal FC - Carabao Cup'),
  { home: 'Fleetwood Town FC', away: 'Arsenal FC', label: 'Carabao Cup' });
assert.deepStrictEqual(splitTeams('Tottenham Hotspur vs Coventry City FC'),
  { home: 'Tottenham Hotspur', away: 'Coventry City FC', label: null });
assert.strictEqual(splitTeams('Emirates Stadium Tour'), null);

assert.strictEqual(pctChange(125, 100), 25);
assert.strictEqual(pctChange(80, 100), -20);
assert.strictEqual(pctChange(100, null), null);   // no baseline → no jump, never "+∞"
assert.strictEqual(pctChange(100, 0), null);

assert.strictEqual(tierOf(25), 'notable');
assert.strictEqual(tierOf(45), 'high');
assert.strictEqual(tierOf(80), 'elite');

// Page fallback: union of the event lists, unpriced events dropped, local time → UTC.
const state = {
  'app.entity.events.allResults': { numFound: 3, events: [
    { id: 1, status: 'Active', name: 'A vs B', webURI: 'a-vs-b/event/1/', eventDateLocal: '2026-10-10T17:30:00+0100',
      ticketInfo: { minPrice: 212.49, minListPrice: 163.45, totalTickets: 100, currencyCode: 'EUR' } },
    { id: 2, status: 'Active', name: 'A vs C', webURI: 'a-vs-c/event/2/', eventDateLocal: '2026-10-11T15:00:00+0100' },
  ] },
  'app.entity.events.geoExcludeRadius': { numFound: 3, events: [
    { id: 1, status: 'Active', name: 'A vs B', webURI: 'x', eventDateLocal: '2026-10-10T17:30:00+0100',
      ticketInfo: { minPrice: 999, minListPrice: 800, totalTickets: 1, currencyCode: 'EUR' } },
  ] },
};
const { events, numFound } = parseEvents(`<script>window.__INITIAL_STATE__=${JSON.stringify(state)};</script>`);
assert.strictEqual(numFound, 3);
assert.strictEqual(events.length, 1);
assert.strictEqual(events[0].min_price, 163.45);            // list price (what StubHub shows), not the fee-inclusive 212.49; first occurrence wins
assert.strictEqual(events[0].kickoff_utc, '2026-10-10T16:30:00.000Z');
assert.strictEqual(events[0].url, 'https://www.stubhub.ie/a-vs-b/event/1/');

// Insight: silence unless something moved enough to matter.
assert.strictEqual(insightOf({ change: 4, days: 7, stockChange: -8 }), null);
assert.strictEqual(insightOf({ change: null, days: null, stockChange: null }), null);
assert.strictEqual(insightOf({ change: 18.5, days: 7, stockChange: null }), '▲ price +18.5% in 7d');
assert.strictEqual(insightOf({ change: -12, days: 3, stockChange: 35 }), '▼ price -12% in 3d · stock +35% (supply growing)');
assert.strictEqual(insightOf({ change: 2, days: 7, stockChange: -30 }), 'stock -30% (selling)');

console.log('stubhub-hot: all assertions passed');

// StubHub's full names must meet the UEFA feed's short names — both sides, exact-or-alias.
const { canonTeam } = require('../utils/team-match');
for (const [sh, uefa] of [['LOSC Lille', 'Lille'], ['FC Bayern Munich', 'Bayern München'],
  ['Borussia Dortmund', 'B. Dortmund'], ['Real Betis Balompié', 'Real Betis'], ['Viking FK', 'Viking'],
  ['Hapoel Beer Sheva', 'H. Beer-Sheva'], ['Jagiellonia Białystok', 'Jagiellonia']]) {
  assert.strictEqual(canonTeam(sh), canonTeam(uefa), `${sh} ≠ ${uefa}`);
}
assert.notStrictEqual(canonTeam('Real Betis'), canonTeam('Real Madrid'));
console.log('stubhub-hot: team alias assertions passed');

// Opportunities fire both ways: a 25% drop is as much a signal as a 25% rise.
const { big } = require('../services/stubhub-hot');
assert.ok(big(25, 25) && big(-25, 25) && big(-40.2, 25));
assert.ok(!big(24.9, 25) && !big(-24.9, 25) && !big(null, 25));
assert.strictEqual(tierOf(-65), 'elite');
console.log('stubhub-hot: two-way opportunity assertions passed');

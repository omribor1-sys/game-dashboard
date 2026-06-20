const assert = require('node:assert');
const { toUkLocalString, kickoffChanged, homeAwayClause } = require('../utils/fixtures-format');

// 1) UTC -> UK local "Sat, 21/08/2026, 20:00". 21 Aug = BST (UTC+1): 19:00Z -> 20:00 local.
assert.strictEqual(toUkLocalString('2026-08-21T19:00:00Z'), 'Fri, 21/08/2026, 20:00');
// 2) Winter (GMT, UTC+0): 5 Dec 2026 15:00Z -> 15:00 local.
assert.strictEqual(toUkLocalString('2026-12-05T15:00:00Z'), 'Sat, 05/12/2026, 15:00');
// 3) null in -> null out (no crash)
assert.strictEqual(toUkLocalString(null), null);

// 4) change detection: only a real difference counts
assert.strictEqual(kickoffChanged('2026-08-21T19:00:00Z', '2026-08-21T19:00:00Z'), false);
assert.strictEqual(kickoffChanged('2026-08-21T19:00:00Z', '2026-08-22T13:00:00Z'), true);
assert.strictEqual(kickoffChanged(null, '2026-08-21T19:00:00Z'), false); // first-time set is not a "change"

// 5) homeAwayClause builds the right SQL fragment + params
assert.deepStrictEqual(homeAwayClause('home', 57), { sql: 'home_team_id = ?', params: [57] });
assert.deepStrictEqual(homeAwayClause('away', 57), { sql: 'away_team_id = ?', params: [57] });
assert.deepStrictEqual(homeAwayClause('all', 57),  { sql: '(home_team_id = ? OR away_team_id = ?)', params: [57, 57] });
assert.deepStrictEqual(homeAwayClause('home', null), { sql: null, params: [] }); // no team => ignored

console.log('fixtures-format: all assertions passed');

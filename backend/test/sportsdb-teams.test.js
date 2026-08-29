const assert = require('node:assert');
const { normTeam } = require('../utils/team-match');

// normTeam strips only corporate noise — it must never collapse two different clubs.
assert.strictEqual(normTeam('Newcastle United FC'), 'newcastleunited');
assert.strictEqual(normTeam('Brighton & Hove Albion'), 'brightonandhovealbion');
// 'Utd' is expanded so provider spellings converge (verifier false-positive fix)
assert.strictEqual(normTeam('Man Utd'), normTeam('Man United'));
assert.strictEqual(normTeam('Newcastle Utd'), normTeam('Newcastle United'));
assert.strictEqual(normTeam('  Arsenal  FC '), 'arsenal');

// The two Manchester clubs must stay distinct after normalisation.
assert.notStrictEqual(normTeam('Manchester City'), normTeam('Manchester United'));

// Regression, 2026-08-29: a prefix fallback matched Norwegian "Lillestrøm" to French
// "Lille" and filed a Europa League tie under the wrong club. Matching is exact-only
// now, so the two must not normalise to the same key — and neither may the near pairs
// that would break the same way.
assert.notStrictEqual(normTeam('Lillestrøm'), normTeam('Lille'));
assert.notStrictEqual(normTeam('Bradford City'), normTeam('Bradford'));
assert.notStrictEqual(normTeam('Charlton Athletic'), normTeam('Charlton'));

console.log('sportsdb-teams: all assertions passed');

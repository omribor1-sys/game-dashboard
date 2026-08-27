const assert = require('node:assert');
const { normalizeGameName, GAME_NAME_MAP, sharesTeam } = require('../utils/normalize');

// Fake DB that models the exact queries normalizeGameName issues against `orders`:
//   2.5  SELECT DISTINCT game_name WHERE game_datetime = ?      -> .all()
//   3    WHERE game_name LIKE ? AND game_name LIKE ?            -> .get()
function makeDb(rows) {
  const like = (val, pat) =>
    String(val).toLowerCase().includes(pat.replace(/%/g, '').toLowerCase());
  return {
    prepare(sql) {
      const hasDt = sql.includes('game_datetime = ?');
      return {
        all(...params) {
          if (!hasDt) return [];
          const [dt] = params;
          const names = rows.filter(r => r.game_datetime === dt).map(r => r.game_name);
          return [...new Set(names)].map(game_name => ({ game_name }));
        },
        get(...params) {
          // step 3 now scopes the fuzzy LIKEs to a game_datetime — it is the last param
          const dt = hasDt ? params[params.length - 1] : null;
          const likes = hasDt ? params.slice(0, -1) : params;
          const found = rows.find(r =>
            (!hasDt || r.game_datetime === dt) && likes.every(p => like(r.game_name, p)));
          return found ? { game_name: found.game_name } : undefined;
        },
      };
    },
  };
}

// ── Step 2: hardcoded map hit ──
assert.strictEqual(normalizeGameName('Arsenal FC vs Fulham FC'), 'Arsenal vs Fulham');
// map key comparison is lowercase — verify a known entry exists
assert.strictEqual(GAME_NAME_MAP['arsenal fc vs fulham fc'], 'Arsenal vs Fulham');

// ── Step 1: strip " | Day, DD/MM/YYYY, HH:MM" suffix, then map ──
assert.strictEqual(
  normalizeGameName('Arsenal FC vs Fulham FC | Sat, 10/01/2026, 15:00'),
  'Arsenal vs Fulham'
);

// ── null / empty in -> same out, no crash ──
assert.strictEqual(normalizeGameName(null), null);
assert.strictEqual(normalizeGameName(''), '');
assert.strictEqual(normalizeGameName(undefined), undefined);

// ── no map, no db -> returns cleaned name unchanged ──
assert.strictEqual(normalizeGameName('Foo Town vs Bar City'), 'Foo Town vs Bar City');

// ── Step 2.5: datetime + SHARED TEAM dedup ──
// Same physical game, different label -> reuse existing name (shares "Chelsea").
const dbDt = makeDb([
  { game_name: 'Chelsea vs Manchester City', game_datetime: 'Sat, 16/05/2026, 17:00' },
]);
assert.strictEqual(
  normalizeGameName('Chelsea FC vs Brand New Label | Sat, 16/05/2026, 17:00', dbDt),
  'Chelsea vs Manchester City'
);
// different datetime -> no dedup, falls through to cleaned name
assert.strictEqual(
  normalizeGameName('Chelsea FC vs Brand New Label | Sun, 17/05/2026, 17:00', dbDt),
  'Chelsea FC vs Brand New Label'
);

// ⚠️ REGRESSION GUARD — final matchday: every PL fixture kicks off at the same time.
// Same datetime with NO shared team must NOT merge, or revenue lands on the wrong game.
const dbFinalDay = makeDb([
  { game_name: 'Tottenham vs Everton',           game_datetime: 'Sun, 24/05/2026, 16:00' },
  { game_name: 'Manchester City vs Aston Villa', game_datetime: 'Sun, 24/05/2026, 16:00' },
]);
assert.strictEqual(
  normalizeGameName('Brentford vs Crystal Palace | Sun, 24/05/2026, 16:00', dbFinalDay),
  'Brentford vs Crystal Palace'
);
// ...and the two Manchester clubs must never collapse into each other.
assert.strictEqual(
  normalizeGameName('Manchester United vs Wolves | Sun, 24/05/2026, 16:00', dbFinalDay),
  'Manchester United vs Wolves'
);
// A genuine twin at that slot still merges (shares "Tottenham").
assert.strictEqual(
  normalizeGameName('Tottenham Hotspur FC vs Everton FC | Sun, 24/05/2026, 16:00', dbFinalDay),
  'Tottenham vs Everton'
);

// ── sharesTeam unit checks ──
assert.ok(sharesTeam('Tottenham vs Everton', 'Tottenham Hotspur vs Everton FC'));
assert.ok(sharesTeam('Chelsea vs Leeds United - FA Cup - Semi-final', 'Chelsea vs Manchester City'));
assert.ok(sharesTeam('Community Shield', 'Community Shield'));
assert.ok(!sharesTeam('Manchester City vs Aston Villa', 'Manchester United vs Wolves'));
assert.ok(!sharesTeam('Brentford vs Crystal Palace', 'Tottenham vs Everton'));
assert.ok(!sharesTeam('Community Shield', 'Arsenal vs Chelsea'));

// ── Step 3: fuzzy match on first two significant words (>3 chars, not vs/FC/City/United),
//    scoped to the same kickoff ──
const dbFuzzy = makeDb([
  { game_name: 'Tottenham vs Leeds United', game_datetime: 'Sat, 10/10/2026, 15:00' },
]);
assert.strictEqual(
  normalizeGameName('Tottenham Leeds Friendly | Sat, 10/10/2026, 15:00', dbFuzzy),
  'Tottenham vs Leeds United'
);
// no shared words -> no false match
assert.strictEqual(
  normalizeGameName('Everton Liverpool Derby | Sat, 10/10/2026, 15:00', dbFuzzy),
  'Everton Liverpool Derby'
);
// same words, DIFFERENT kickoff -> must NOT merge (regression, 2026-08-25)
assert.strictEqual(
  normalizeGameName('Tottenham Leeds Friendly | Wed, 26/08/2026, 19:45', dbFuzzy),
  'Tottenham Leeds Friendly'
);
// no datetime at all -> no fuzzy merge either; a new group beats a wrong one
assert.strictEqual(
  normalizeGameName('Tottenham Leeds Friendly', dbFuzzy),
  'Tottenham Leeds Friendly'
);

// ── Regression: the West Brom bug ────────────────────────────────────────────
// "Newcastle United FC vs West Bromwich Albion FC" takes "Newcastle" + "West" as its
// two fuzzy words, which LIKE-matched an unrelated "Newcastle vs West Ham" from a
// different date and merged both fixtures' revenue into one game.
const dbWestBrom = makeDb([
  { game_name: 'Newcastle vs West Ham', game_datetime: 'Sat, 21/02/2026, 15:00' },
]);
assert.strictEqual(
  normalizeGameName('Newcastle United FC vs West Bromwich Albion FC | Wed, 26/08/2026, 19:45', dbWestBrom),
  'Newcastle United FC vs West Bromwich Albion FC'
);
// ...but a genuine same-kickoff order still adopts the canonical name
assert.strictEqual(
  normalizeGameName('Newcastle United FC vs West Ham United FC | Sat, 21/02/2026, 15:00', dbWestBrom),
  'Newcastle vs West Ham'
);

console.log('normalize: all assertions passed');

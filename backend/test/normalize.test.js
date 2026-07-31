const assert = require('node:assert');
const { normalizeGameName, GAME_NAME_MAP } = require('../utils/normalize');

// Fake DB that models the exact queries normalizeGameName issues against `orders`:
//   2.5a  WHERE game_datetime = ?
//   2.5b  WHERE game_datetime = ? AND game_name LIKE ?
//   3     WHERE game_name LIKE ? AND game_name LIKE ?
function makeDb(rows) {
  const like = (val, pat) =>
    String(val).toLowerCase().includes(pat.replace(/%/g, '').toLowerCase());
  return {
    prepare(sql) {
      const hasDt = sql.includes('game_datetime = ?');
      const likeCount = (sql.match(/game_name LIKE \?/g) || []).length;
      return {
        get(...params) {
          let found;
          if (hasDt && likeCount === 1) {
            const [dt, pat] = params;
            found = rows.find(r => r.game_datetime === dt && like(r.game_name, pat));
          } else if (hasDt) {
            const [dt] = params;
            found = rows.find(r => r.game_datetime === dt);
          } else {
            found = rows.find(r => params.every(p => like(r.game_name, p)));
          }
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

// ── Step 2.5a: datetime dedup — same physical game, different label -> reuse existing name ──
// Raw label is NOT in the map, but an order already exists at that exact datetime.
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

// ── Step 3: fuzzy match on first two significant words (>3 chars, not vs/FC/City/United) ──
const dbFuzzy = makeDb([
  { game_name: 'Tottenham vs Leeds United', game_datetime: 'X' },
]);
assert.strictEqual(
  normalizeGameName('Tottenham Leeds Friendly', dbFuzzy),
  'Tottenham vs Leeds United'
);
// no shared words -> no false match
assert.strictEqual(
  normalizeGameName('Everton Liverpool Derby', dbFuzzy),
  'Everton Liverpool Derby'
);

console.log('normalize: all assertions passed');

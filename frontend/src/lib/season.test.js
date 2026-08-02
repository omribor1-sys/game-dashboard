import assert from 'node:assert';
import { seasonStartYear, currentSeasonStart, seasonLabel, seasonsPresent, inSeason } from './season.js';

// ── 1 July boundary: June = previous season, July = new season ──
assert.strictEqual(seasonStartYear('2026-06-30'), 2025);
assert.strictEqual(seasonStartYear('2026-07-01'), 2026);
assert.strictEqual(seasonStartYear('2026-05-24'), 2025); // May 2026 game = old season
assert.strictEqual(seasonStartYear('09/08/2026'), 2026); // Aug 2026 (DD/MM/YYYY) = new season
assert.strictEqual(seasonStartYear('Sun, 06/09/2026, 16:30'), 2026); // StubHub datetime
assert.strictEqual(seasonStartYear(null), null);
assert.strictEqual(seasonStartYear('no date here'), null);
// legacy long format must bucket the same as the standard format
assert.strictEqual(seasonStartYear('Sunday 24 May 2026, 16:00'), 2025);
assert.strictEqual(seasonStartYear('Wednesday 17 Jun 2026, 17:00'), 2025);

// ── labels ──
assert.strictEqual(seasonLabel(2026), '2026/27');
assert.strictEqual(seasonLabel(2024), '2024/25');
assert.strictEqual(seasonLabel(null), 'Undated');

// ── current season from a fixed "now" (2 Aug 2026) ──
const now = new Date(2026, 7, 2);
assert.strictEqual(currentSeasonStart(now), 2026);

// ── inSeason ──
assert.strictEqual(inSeason('2026-08-09', 2026, now), true);
assert.strictEqual(inSeason('2026-05-24', 2026, now), false); // old game NOT in new season
assert.strictEqual(inSeason('2026-05-24', 2025, now), true);
assert.strictEqual(inSeason('2026-05-24', 'all', now), true);
assert.strictEqual(inSeason(null, 2026, now), true);  // undated → current season
assert.strictEqual(inSeason(null, 2025, now), false); // undated NOT in an old season

// ── seasonsPresent: distinct, newest first, always includes current ──
const items = [{ d: '2026-05-24' }, { d: '2024-11-01' }, { d: '2026-08-09' }];
assert.deepStrictEqual(seasonsPresent(items, x => x.d, now), [2026, 2025, 2024]);
// current season injected even when no item falls in it
assert.deepStrictEqual(seasonsPresent([{ d: '2025-05-01' }], x => x.d, now), [2026, 2024]);

console.log('season: all assertions passed');

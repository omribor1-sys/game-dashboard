// Season = football fiscal year, 1 July → 30 June. Key = start year (number).
// e.g. season 2026 ("2026/27") covers 2026-07-01 .. 2027-06-30.
// Pure module — no React, no DOM — so it can be unit-tested with plain node.

function toDate(v) {
  if (!v) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  const s = String(v);
  // DD/MM/YYYY — StubHub "Sun, 09/08/2026, 14:00" or a date embedded in a game name
  let m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  // YYYY-MM-DD — games.date / inventory.game_date
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return null;
}

// Season start-year for a date-ish value, or null if undated/unparseable.
export function seasonStartYear(dateLike) {
  const d = toDate(dateLike);
  if (!d) return null;
  // getMonth(): Jan=0 … Jul=6. July or later → season starts this calendar year.
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

export function currentSeasonStart(now = new Date()) {
  return seasonStartYear(now);
}

// "2026/27" from 2026. `null` → "Undated".
export function seasonLabel(startYear) {
  if (startYear == null) return 'Undated';
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

// Distinct season start-years present in `items` (via getDate), newest first.
// The current season is always included so the (possibly empty) new season is selectable.
export function seasonsPresent(items, getDate, now = new Date()) {
  const set = new Set();
  for (const it of items) {
    const y = seasonStartYear(getDate(it));
    if (y != null) set.add(y);
  }
  set.add(currentSeasonStart(now));
  return [...set].sort((a, b) => b - a);
}

// Does a date-ish value belong to the selected season?
//  selected === 'all' → always true.
//  Undated items appear in the CURRENT season only (never silently hidden).
export function inSeason(dateLike, selected, now = new Date()) {
  if (selected === 'all') return true;
  const y = seasonStartYear(dateLike);
  if (y == null) return selected === currentSeasonStart(now);
  return y === selected;
}

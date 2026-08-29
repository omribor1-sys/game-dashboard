'use strict';

// One place that turns a provider's spelling of a club into our api_team_id.
//
// Every fixture source spells clubs differently ("Man Utd" / "Manchester United FC" /
// "Manchester United"), and a cup or European fixture is only useful if it resolves to
// the SAME id football-data uses — that is what makes it show up when Omri filters by a
// club. So this has to be shared, not reimplemented per connector.
//
// The rule is exact-match-or-alias. Approximate matching has now failed three times in
// one day, each time silently attaching real data to the wrong club:
//   • "Crystal Palace FC vs Manchester City FC" → "Brentford vs Crystal Palace"  (orders)
//   • "Newcastle United FC vs West Bromwich Albion" → "Newcastle vs West Ham"    (orders)
//   • "Lillestrøm" → "Lille"                                                     (fixtures)
// An unmatched name costs a crest and a filter hit. A wrong match corrupts data and is
// invisible. When a provider name is missing, add it to ALIASES — never loosen the match.

const db = require('../database');

function normTeam(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    // Expand the one abbreviation providers genuinely disagree on, before stripping.
    // Without this "Newcastle Utd" and "Newcastle United" normalise to different keys and
    // the cross-source verifier reports a false mismatch on every Newcastle fixture.
    .replace(/\butd\b/g, 'united')
    .replace(/\b(fc|afc|cf|sk|sc|ac|club|the)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

// Long provider spelling (normalised) → the short form football-data uses, which is what
// the teams table stores. Every entry here was added because two real sources disagreed,
// never speculatively — this table is the ONLY sanctioned way to widen a match.
const ALIASES = {
  // full club name → football-data shortName
  manchestercity: 'mancity',
  manchesterunited: 'manunited',
  tottenhamhotspur: 'tottenham',
  newcastleunited: 'newcastle',
  westhamunited: 'westham',
  wolverhamptonwanderers: 'wolverhampton',
  brightonandhovealbion: 'brightonhove',
  brightonandhove: 'brightonhove',
  nottinghamforest: 'nottingham',
  ipswichtown: 'ipswich',
  hullcity: 'hull',
  coventrycity: 'coventry',
  sunderlandafc: 'sunderland',
  // nicknames / abbreviations providers use
  spurs: 'tottenham',
  // continental
  paris: 'parissaintgermain',
  psg: 'parissaintgermain',
  internazionale: 'inter',
  bayernmunchen: 'bayernmunich',
  bayern: 'bayernmunich',
};

let cache = null;

/** Rebuild on the next lookup — call after a sync that may have added teams. */
function resetTeamIndex() { cache = null; }

function buildIndex() {
  const idx = new Map();
  const rows = db.prepare('SELECT api_team_id, name, full_name, tla FROM teams').all();
  for (const r of rows) {
    for (const v of [r.name, r.full_name]) {
      const k = normTeam(v);
      if (k && !idx.has(k)) idx.set(k, r.api_team_id);
    }
  }
  return idx;
}

/**
 * @param {string} name provider's club name
 * @returns {number|null} api_team_id, or null when we cannot be certain
 */
function matchTeam(name) {
  if (!cache) cache = buildIndex();
  const k = normTeam(name);
  if (!k) return null;
  if (cache.has(k)) return cache.get(k);

  const alias = ALIASES[k];
  if (alias && cache.has(alias)) return cache.get(alias);
  // an alias may also point the other way (ours → theirs)
  for (const [from, to] of Object.entries(ALIASES)) {
    if (to === k && cache.has(from)) return cache.get(from);
  }
  return null;   // deliberately: no prefix, no substring, no "close enough"
}

/**
 * Collapse a club name to one canonical token, so two providers spelling the same club
 * differently ("Man City" / "Manchester City", "Brighton Hove" / "Brighton & Hove Albion")
 * compare equal WITHOUT any fuzzy matching. This is what the cross-source verifier needs:
 * it has no teams table to look things up in, only two strings from two providers.
 */
function canonTeam(name) {
  const k = normTeam(name);
  return ALIASES[k] || k;
}

module.exports = { normTeam, canonTeam, matchTeam, resetTeamIndex, ALIASES };

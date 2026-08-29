'use strict';

// Objective HOT-game detection from bookmaker odds.
//
// Until now "hot" was a hand-curated list. The problem with a hand-curated list is not
// that it is wrong, it is that it goes stale silently — nobody notices the fixture nobody
// marked. Odds are the market's own demand signal and they update themselves.
//
// The signal, and why it is built this way:
//
//   A single match's odds tell you who is likely to WIN, not whether the match is big.
//   Two relegation sides can be perfectly evenly matched and sell nothing. So strength is
//   derived ACROSS the feed: a club that is consistently short-priced over its upcoming
//   fixtures is a strong club. A fixture is hot when BOTH sides are strong — that is a
//   top-vs-top clash, which is what actually moves tickets.
//
// This is a heuristic, and it is stored with its numbers (hot_score, hot_reason) precisely
// so it can be argued with against real sales rather than trusted on faith.

const db = require('../database');
const { canonTeam } = require('../utils/team-match');

const BASE = 'https://api.the-odds-api.com/v4';

// One request per sport per run. Free tier is 500/month; three sports daily is ~90.
const SPORTS = [
  { key: 'soccer_epl',                 competition: 'PL' },
  { key: 'soccer_uefa_champs_league',  competition: 'CL' },
  { key: 'soccer_uefa_europa_league',  competition: 'UEL' },
  { key: 'soccer_england_efl_cup',     competition: 'EFL' },
  { key: 'soccer_fa_cup',              competition: 'FAC' },
];

// "Strong" is a RANK, not a fixed probability. An absolute threshold looked reasonable and
// marked nothing: one run sees 1-2 fixtures per club, so Chelsea came out at 35% purely
// because it had drawn a hard tie that week. A rank self-calibrates — whatever the odds
// look like, the top slice of the league is the top slice.
const STRONG_RANK_FRACTION = 0.30;   // top 30% of ranked clubs
// Distinct FIXTURES a club must appear in before its average means anything. Below this
// the number is one opponent's difficulty, not the club's standing. The table converges
// over a few gameweeks; until then a club simply is not ranked.
const MIN_SAMPLES = 3;

function hasKey() { return !!process.env.THE_ODDS_API_KEY; }

async function fetchSport(sportKey) {
  const url = `${BASE}/sports/${sportKey}/odds/?regions=uk,eu&markets=h2h&oddsFormat=decimal&apiKey=${process.env.THE_ODDS_API_KEY}`;
  const res = await fetch(url);
  const remaining = res.headers.get('x-requests-remaining');
  if (res.status === 404 || res.status === 422) return { events: [], remaining };  // out of season
  if (!res.ok) throw new Error(`the-odds-api ${sportKey} HTTP ${res.status}`);
  return { events: await res.json(), remaining };
}

const median = (xs) => {
  const s = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Median price per outcome across bookmakers, converted to probabilities with the
 * bookmaker margin removed. One bookmaker can be an outlier; the median cannot.
 */
function impliedProbs(event) {
  const buckets = { home: [], away: [], draw: [] };
  for (const bm of event.bookmakers || []) {
    const market = (bm.markets || []).find(m => m.key === 'h2h');
    if (!market) continue;
    for (const o of market.outcomes || []) {
      if (o.name === event.home_team) buckets.home.push(o.price);
      else if (o.name === event.away_team) buckets.away.push(o.price);
      else buckets.draw.push(o.price);
    }
  }
  const dec = { home: median(buckets.home), away: median(buckets.away), draw: median(buckets.draw) };
  if (!dec.home || !dec.away) return null;
  const raw = { home: 1 / dec.home, away: 1 / dec.away, draw: dec.draw ? 1 / dec.draw : 0 };
  const overround = raw.home + raw.away + raw.draw;
  if (!overround) return null;
  return { home: raw.home / overround, away: raw.away / overround, draw: raw.draw / overround };
}

// ── rolling strength ─────────────────────────────────────────────────────────
const upsertObs = db.prepare(`
  INSERT INTO strength_obs (canon_team, event_id, display_name, prob, updated_at)
  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT(canon_team, event_id) DO UPDATE SET
    prob = excluded.prob, display_name = excluded.display_name, updated_at = CURRENT_TIMESTAMP
`);

/** Record one observation per (club, fixture). Re-running replaces, never accumulates. */
function recordObservations(events) {
  for (const ev of events) {
    const p = impliedProbs(ev);
    if (!p || !ev.id) continue;
    for (const [name, prob] of [[ev.home_team, p.home], [ev.away_team, p.away]]) {
      const k = canonTeam(name);
      if (k) upsertObs.run(k, String(ev.id), name, prob);
    }
  }
}

/** Rolling strength for every club we have enough observations for, ranked. */
function rankedStrength() {
  const rows = db.prepare(`
    SELECT canon_team, MAX(display_name) AS display_name,
           COUNT(*) AS samples, AVG(prob) AS strength
    FROM strength_obs
    GROUP BY canon_team
    HAVING COUNT(*) >= ?
  `).all(MIN_SAMPLES);
  const list = rows
    .map(r => ({ key: r.canon_team, name: r.display_name, strength: r.strength, samples: r.samples }))
    .sort((a, b) => b.strength - a.strength);
  const cutoff = Math.max(1, Math.ceil(list.length * STRONG_RANK_FRACTION));
  const strong = new Map();
  list.slice(0, cutoff).forEach((t, i) => strong.set(t.key, { ...t, rank: i + 1 }));
  return { strong, ranked: list };
}

/** Average de-vigged win probability per club within a single feed (diagnostic only). */
function teamStrength(events) {
  const acc = new Map();
  for (const ev of events) {
    const p = impliedProbs(ev);
    if (!p) continue;
    for (const [name, prob] of [[ev.home_team, p.home], [ev.away_team, p.away]]) {
      const k = canonTeam(name);
      if (!k) continue;
      const cur = acc.get(k) || { sum: 0, n: 0, name };
      cur.sum += prob; cur.n += 1;
      acc.set(k, cur);
    }
  }
  const out = new Map();
  for (const [k, v] of acc) out.set(k, { strength: v.sum / v.n, samples: v.n, name: v.name });
  return out;
}

// Match an odds event to a stored fixture: both clubs equal after canonicalisation, and
// the kickoff within a day. Never on one club alone — that assumption has already merged
// two different fixtures in this codebase twice.
function findFixture(competition, ev) {
  const h = canonTeam(ev.home_team), a = canonTeam(ev.away_team);
  const t = new Date(ev.commence_time).getTime();
  const rows = db.prepare(`
    SELECT id, home_team, away_team, kickoff_utc, is_hot, hot_source
    FROM fixtures
    WHERE competition_code = ? AND kickoff_utc BETWEEN ? AND ?
  `).all(competition,
    new Date(t - 36 * 3600e3).toISOString(),
    new Date(t + 36 * 3600e3).toISOString());
  return rows.find(r => canonTeam(r.home_team) === h && canonTeam(r.away_team) === a) || null;
}

const clearAuto = db.prepare(`UPDATE fixtures SET is_hot=0, hot_tier=NULL, hot_reason=NULL, hot_score=NULL
                              WHERE hot_source='odds' AND kickoff_utc > ?`);
const setHot = db.prepare(`UPDATE fixtures SET is_hot=1, hot_tier=?, hot_reason=?, hot_score=?, hot_source='odds'
                           WHERE id=?`);

// Tier from the WEAKER side's rank inside the strong pool, not an absolute probability:
// the pool's spread differs per competition, and the fixture is only as big as its
// smaller half.
const tierOf = (rank, poolSize) => {
  const p = rank / Math.max(1, poolSize);
  return p <= 0.34 ? 'elite' : p <= 0.67 ? 'high' : 'notable';
};

/**
 * Refresh odds-derived hot flags. Manual marks (hot_source NULL or 'manual') are never
 * touched — Omri's judgement outranks the model, and silently overwriting it would make
 * the feature untrustworthy the first time it disagreed with him.
 */
async function detectHotGames() {
  if (!hasKey()) return { skipped: true, reason: 'THE_ODDS_API_KEY not set' };

  const summary = { perSport: [], marked: 0, cleared: 0, unmatched: 0, remaining: null, errors: [] };

  // Only clear what this job set, and only in the future — a past fixture's hot flag is
  // history worth keeping for backtesting.
  const nowIso = new Date().toISOString();
  summary.cleared = clearAuto.run(nowIso).changes || 0;

  for (const sport of SPORTS) {
    const res = { sport: sport.key, competition: sport.competition, events: 0, marked: 0, unmatched: 0, ranked_pool: 0, error: null };
    try {
      const { events, remaining } = await fetchSport(sport.key);
      if (remaining) summary.remaining = Number(remaining);
      res.events = events.length;
      if (!events.length) { summary.perSport.push(res); continue; }

      recordObservations(events);
      const { strong } = rankedStrength();
      res.ranked_pool = strong.size;

      for (const ev of events) {
        const h = strong.get(canonTeam(ev.home_team));
        const a = strong.get(canonTeam(ev.away_team));
        if (!h || !a) continue;   // both sides must be in the top slice

        const score = Math.min(h.strength, a.strength);   // as big as its smaller half

        const fx = findFixture(sport.competition, ev);
        if (!fx) { res.unmatched++; summary.unmatched++; continue; }
        if (fx.hot_source && fx.hot_source !== 'odds') continue;   // hand-marked: leave alone
        if (fx.is_hot && !fx.hot_source) continue;                  // legacy manual mark

        const reason = `שני הצדדים בצמרת לפי היחסים — ${h.name} (#${h.rank}, ${(h.strength * 100).toFixed(0)}%), ${a.name} (#${a.rank}, ${(a.strength * 100).toFixed(0)}%)`;
        const weakerRank = Math.max(h.rank, a.rank);
        setHot.run(tierOf(weakerRank, strong.size), reason, Number(score.toFixed(4)), fx.id);
        res.marked++; summary.marked++;
      }
    } catch (e) {
      res.error = e.message;
      summary.errors.push(`${sport.key}: ${e.message}`);
    }
    summary.perSport.push(res);
  }

  console.log('[hot-detect]', JSON.stringify({
    marked: summary.marked, cleared: summary.cleared,
    unmatched: summary.unmatched, quota_left: summary.remaining,
  }));
  return summary;
}

module.exports = { detectHotGames, impliedProbs, teamStrength, rankedStrength, recordObservations, SPORTS };

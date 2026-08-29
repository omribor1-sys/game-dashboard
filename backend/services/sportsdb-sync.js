'use strict';

// TheSportsDB connector — fills the competitions football-data.org will not serve us
// on the free plan: the Carabao Cup and the Europa League.
//
// Two constraints shape this file:
//  1. The free tier truncates a whole-season query to 15 events, so we never ask for a
//     season. We walk a short window of DAYS instead (eventsday.php), which returns
//     everything scheduled on that date.
//  2. Their ids and football-data's ids are both plain integers in the same range, so
//     everything crossing over is namespaced before it touches our tables.

const db = require('../database');
const { sleep } = require('./football-data-client');

const BASE = 'https://www.thesportsdb.com/api/v1/json/123';   // "123" = the public free key
const REQUEST_SPACING_MS = 2500;        // their free tier allows ~30/min; stay well under
const DAYS_BACK = 3;                    // catch results that landed after the last run
const DAYS_AHEAD = 10;

// external_id is UNIQUE across sources. football-data ids are 6–7 digits, so lifting
// TheSportsDB ids above 2e9 keeps the two spaces from ever colliding.
const ID_OFFSET = 2_000_000_000;

const COMPETITIONS = [
  { code: 'EFL', sportsdb_id: 4570, name: 'Carabao Cup 2026/27',   label: 'Carabao Cup' },
  // Europa League moved to uefa-sync — the organiser's own feed beats a mirror.
];

const { matchTeam, resetTeamIndex, normTeam } = require('../utils/team-match');

// ── fetch ───────────────────────────────────────────────────────────────────
async function fetchDay(sportsdbId, ymd) {
  const res = await fetch(`${BASE}/eventsday.php?d=${ymd}&l=${sportsdbId}`, {
    headers: { 'User-Agent': 'game-dashboard/1.0' },
  });
  if (!res.ok) throw new Error(`thesportsdb HTTP ${res.status} for ${sportsdbId} on ${ymd}`);
  const data = await res.json();
  return Array.isArray(data.events) ? data.events : [];
}

// "2026-08-26" + "18:45:00" → ISO. TheSportsDB publishes strTimestamp in UTC when it
// has one; the date+time pair is the documented fallback.
function kickoffOf(ev) {
  if (ev.strTimestamp) return new Date(ev.strTimestamp.replace(' ', 'T') + 'Z').toISOString();
  if (!ev.dateEvent) return null;
  const t = (ev.strTime && ev.strTime !== '00:00:00') ? ev.strTime : '00:00:00';
  return new Date(`${ev.dateEvent}T${t}Z`).toISOString();
}

const intOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number.parseInt(v, 10));

// ── upsert ──────────────────────────────────────────────────────────────────
const getFixture = db.prepare('SELECT * FROM fixtures WHERE external_id=?');
const insertFixture = db.prepare(`
  INSERT INTO fixtures
    (external_id, season_id, competition_code, matchday, stage, home_team_id, away_team_id,
     home_team, away_team, kickoff_utc, status, is_tracked,
     home_score, away_score, winner, tickets_status, last_synced_at)
  VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', CURRENT_TIMESTAMP)
`);
// Ticket fields and manual edits are never touched, same contract as fixtures-sync.
const updateFixture = db.prepare(`
  UPDATE fixtures SET stage=?, status=?, home_team=?, away_team=?,
    home_team_id=?, away_team_id=?, is_tracked=?,
    home_score=?, away_score=?, winner=?, last_synced_at=CURRENT_TIMESTAMP
  WHERE external_id=?
`);
const updateFixtureWithKickoff = db.prepare(`
  UPDATE fixtures SET stage=?, status=?, home_team=?, away_team=?,
    home_team_id=?, away_team_id=?, is_tracked=?,
    home_score=?, away_score=?, winner=?, kickoff_utc=?, last_synced_at=CURRENT_TIMESTAMP
  WHERE external_id=?
`);
const isTracked = db.prepare('SELECT is_tracked FROM teams WHERE api_team_id=?');
const teamTracked = (id) => {
  if (!id) return 0;
  const r = isTracked.get(id);
  return r && r.is_tracked ? 1 : 0;
};

function ymdList() {
  const out = [];
  const today = new Date();
  for (let d = -DAYS_BACK; d <= DAYS_AHEAD; d++) {
    const t = new Date(today.getTime() + d * 86400000);
    out.push(t.toISOString().slice(0, 10));
  }
  return out;
}

function seasonIdFor(code) {
  const r = db.prepare('SELECT id FROM seasons WHERE competition_code=?').get(code);
  return r ? r.id : null;
}

/**
 * Pull the day window for every SportsDB-backed competition and upsert it.
 * @returns {{perCompetition: Array, totals: {inserted:number,updated:number,unmatched:number}, errors: string[]}}
 */
async function syncSportsDb() {
  resetTeamIndex();   // teams table may have grown since the last run
  const days = ymdList();
  const summary = { perCompetition: [], totals: { inserted: 0, updated: 0, unmatched: 0, partial: 0 }, errors: [] };

  for (const comp of COMPETITIONS) {
    const result = { code: comp.code, inserted: 0, updated: 0, unmatched: 0, partial: 0, days: days.length };
    const seasonId = seasonIdFor(comp.code);

    for (const ymd of days) {
      try {
        const events = await fetchDay(comp.sportsdb_id, ymd);
        for (const ev of events) {
          const externalId = ID_OFFSET + Number(ev.idEvent);
          if (!Number.isFinite(externalId)) continue;

          const homeId = matchTeam(ev.strHomeTeam);
          const awayId = matchTeam(ev.strAwayTeam);
          // One unmatched side is routine: cup draws pull in lower-league clubs that play
          // in no competition we sync, so they were never in the teams table. Only a tie
          // where BOTH sides are unknown is a real problem — that fixture cannot be
          // reached by any team filter at all. Alerting on the routine case would train
          // Omri to ignore this alert, which is how the real one gets missed.
          if (!homeId && !awayId) {
            result.unmatched++;
            summary.errors.push(`no team matched in ${comp.code}: "${ev.strHomeTeam}" vs "${ev.strAwayTeam}"`);
          } else if (!homeId || !awayId) {
            result.partial++;
          }

          const hs = intOrNull(ev.intHomeScore);
          const as = intOrNull(ev.intAwayScore);
          const winner = (hs === null || as === null) ? null
            : hs > as ? 'HOME_TEAM' : as > hs ? 'AWAY_TEAM' : 'DRAW';
          const status = (hs !== null && as !== null) ? 'FINISHED' : 'SCHEDULED';
          const stage = ev.strRound ? `Round ${ev.strRound}` : null;
          const kickoff = kickoffOf(ev);
          const tracked = (teamTracked(homeId) || teamTracked(awayId)) ? 1 : 0;

          const existing = getFixture.get(externalId);
          if (!existing) {
            insertFixture.run(
              externalId, seasonId, comp.code, stage,
              homeId, awayId, ev.strHomeTeam || null, ev.strAwayTeam || null,
              kickoff, status, tracked, hs, as, winner
            );
            result.inserted++;
          } else if (existing.manually_overridden) {
            // Omri owns the kickoff on a fixture he edited by hand.
            updateFixture.run(stage, status, ev.strHomeTeam || null, ev.strAwayTeam || null,
              homeId, awayId, tracked, hs, as, winner, externalId);
            result.updated++;
          } else {
            updateFixtureWithKickoff.run(stage, status, ev.strHomeTeam || null, ev.strAwayTeam || null,
              homeId, awayId, tracked, hs, as, winner, kickoff, externalId);
            result.updated++;
          }
        }
      } catch (e) {
        summary.errors.push(`${comp.code} ${ymd}: ${e.message}`);
      }
      await sleep(REQUEST_SPACING_MS);
    }

    summary.totals.inserted += result.inserted;
    summary.totals.updated += result.updated;
    summary.totals.unmatched += result.unmatched;
    summary.totals.partial += result.partial;
    summary.perCompetition.push(result);
  }

  console.log('[sportsdb-sync] done:', JSON.stringify(summary.totals),
    summary.errors.length ? `errors: ${summary.errors.length}` : '');
  return summary;
}

module.exports = { syncSportsDb, COMPETITIONS, kickoffOf, ID_OFFSET };

'use strict';

const db = require('../database');
const { hasApiKey, fetchMatches, fetchStandings, sleep } = require('./football-data-client');
const { kickoffChanged } = require('../utils/fixtures-format');

// Free tier = 10 req/min. Space competition fetches ~7s apart to stay safely under it.
const INTER_COMPETITION_DELAY_MS = 7000;

// ── prepared statements ──────────────────────────────────────────────────────
// Only competitions football-data actually serves. The cups live on TheSportsDB and are
// handled by sportsdb-sync; asking football-data for them just burns the rate limit on 403s.
const getSeasons = (code) => code
  ? db.prepare("SELECT * FROM seasons WHERE active=1 AND competition_code=? AND COALESCE(source,'football-data')='football-data'").all(code)
  : db.prepare("SELECT * FROM seasons WHERE active=1 AND COALESCE(source,'football-data')='football-data' ORDER BY sort_order").all();

const upsertTeam = db.prepare(`
  INSERT INTO teams (api_team_id, name, full_name, tla, crest_url, is_tracked, is_primary)
  VALUES (?, ?, ?, ?, ?, 0, 0)
  ON CONFLICT(api_team_id) DO UPDATE SET
    name=excluded.name, full_name=excluded.full_name, tla=excluded.tla, crest_url=excluded.crest_url
`); // NOTE: never overwrites is_tracked/is_primary

const isTrackedTeam = db.prepare('SELECT is_tracked FROM teams WHERE api_team_id=?');
const getFixture   = db.prepare('SELECT * FROM fixtures WHERE external_id=?');

const insertFixture = db.prepare(`
  INSERT INTO fixtures
    (external_id, season_id, competition_code, matchday, stage, home_team_id, away_team_id,
     home_team, away_team, kickoff_utc, status, is_tracked,
     home_score, away_score, winner, tickets_status, last_synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', CURRENT_TIMESTAMP)
`);

// Sync-owned fields only. Never touches ticket fields. Skips kickoff if manually_overridden.
const updateFixtureFull = db.prepare(`
  UPDATE fixtures SET
    matchday=?, stage=?, status=?, home_team=?, away_team=?,
    home_team_id=?, away_team_id=?, is_tracked=?,
    home_score=?, away_score=?, winner=?, last_synced_at=CURRENT_TIMESTAMP,
    kickoff_utc=?, previous_kickoff_utc=?, last_changed_at=?
  WHERE external_id=?
`);
const updateFixtureNoKickoff = db.prepare(`
  UPDATE fixtures SET
    matchday=?, stage=?, status=?, home_team=?, away_team=?,
    home_team_id=?, away_team_id=?, is_tracked=?,
    home_score=?, away_score=?, winner=?, last_synced_at=CURRENT_TIMESTAMP
  WHERE external_id=?
`);

// football-data reports the result under score.fullTime; it is null until the game is played.
function scoreOf(m) {
  const ft = m.score?.fullTime || {};
  return {
    home: Number.isInteger(ft.home) ? ft.home : null,
    away: Number.isInteger(ft.away) ? ft.away : null,
    winner: m.score?.winner || null,
  };
}

function teamIsTracked(apiTeamId) {
  const r = isTrackedTeam.get(apiTeamId);
  return r && r.is_tracked ? 1 : 0;
}

// ── league tables ────────────────────────────────────────────────────────────
const deleteStandings = db.prepare('DELETE FROM standings WHERE competition_code=?');
const insertStanding = db.prepare(`
  INSERT INTO standings
    (competition_code, group_name, position, team_id, team_name, crest_url,
     played, won, draw, lost, goals_for, goals_against, goal_difference, points, form, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
`);

/**
 * Replace the stored table for one competition. Keeps only the overall ("TOTAL") blocks —
 * football-data also returns HOME/AWAY splits, and one block per group in cup competitions.
 * Rewrites in a transaction so a failure never leaves a half-empty table on screen.
 */
function saveStandings(competitionCode, blocks) {
  const totals = blocks.filter(b => (b.type || 'TOTAL') === 'TOTAL');
  const rows = [];
  for (const b of totals) {
    const group = b.group || b.stage || '';
    for (const r of (b.table || [])) {
      rows.push([
        competitionCode, group, r.position,
        r.team?.id ?? null, r.team?.shortName || r.team?.name || null, r.team?.crest || null,
        r.playedGames ?? null, r.won ?? null, r.draw ?? null, r.lost ?? null,
        r.goalsFor ?? null, r.goalsAgainst ?? null, r.goalDifference ?? null,
        r.points ?? null, r.form || null,
      ]);
    }
  }
  if (!rows.length) return 0;   // never wipe a good table because the API returned nothing
  db.exec('BEGIN');
  try {
    deleteStandings.run(competitionCode);
    for (const r of rows) insertStanding.run(...r);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return rows.length;
}

/**
 * @param {{competition_code?: string}} [options]
 * @returns summary { skipped?, perCompetition: [...], totals: {...}, changed: [...] }
 */
async function syncFixtures(options = {}) {
  if (!hasApiKey()) {
    console.warn('[fixtures-sync] FOOTBALL_DATA_API_KEY not set — skipping');
    return { skipped: true, reason: 'no api key' };
  }
  const seasons = getSeasons(options.competition_code);
  const summary = { perCompetition: [], totals: { teams: 0, inserted: 0, updated: 0, changed: 0, standings: 0 }, changed: [] };

  for (let i = 0; i < seasons.length; i++) {
    const season = seasons[i];
    if (i > 0) await sleep(INTER_COMPETITION_DELAY_MS); // throttle between competitions
    const result = { code: season.competition_code, inserted: 0, updated: 0, changed: 0, standings: 0, error: null };
    try {
      const matches = await fetchMatches(season.competition_code, season.source_season);

      // 1) upsert teams seen in this competition
      const seen = new Map();
      for (const m of matches) {
        for (const t of [m.homeTeam, m.awayTeam]) {
          if (t && t.id && !seen.has(t.id)) {
            seen.set(t.id, true);
            upsertTeam.run(t.id, t.shortName || t.name, t.name, t.tla, t.crest);
            summary.totals.teams++;
          }
        }
      }

      // 2) upsert fixtures
      for (const m of matches) {
        const homeId = m.homeTeam?.id, awayId = m.awayTeam?.id;
        const tracked = (teamIsTracked(homeId) || teamIsTracked(awayId)) ? 1 : 0;
        const existing = getFixture.get(m.id);
        const sc = scoreOf(m);

        if (!existing) {
          insertFixture.run(
            m.id, season.id, season.competition_code, m.matchday ?? null, m.stage ?? null,
            homeId ?? null, awayId ?? null,
            m.homeTeam?.shortName || m.homeTeam?.name || null,
            m.awayTeam?.shortName || m.awayTeam?.name || null,
            m.utcDate ?? null, m.status ?? null, tracked,
            sc.home, sc.away, sc.winner
          );
          result.inserted++;
        } else if (existing.manually_overridden) {
          // user owns kickoff + tickets; still refresh status/teams/matchday
          updateFixtureNoKickoff.run(
            m.matchday ?? null, m.stage ?? null, m.status ?? null,
            m.homeTeam?.shortName || m.homeTeam?.name || null,
            m.awayTeam?.shortName || m.awayTeam?.name || null,
            homeId ?? null, awayId ?? null, tracked,
            sc.home, sc.away, sc.winner, m.id
          );
          result.updated++;
        } else {
          const changed = kickoffChanged(existing.kickoff_utc, m.utcDate);
          updateFixtureFull.run(
            m.matchday ?? null, m.stage ?? null, m.status ?? null,
            m.homeTeam?.shortName || m.homeTeam?.name || null,
            m.awayTeam?.shortName || m.awayTeam?.name || null,
            homeId ?? null, awayId ?? null, tracked,
            sc.home, sc.away, sc.winner,
            m.utcDate ?? existing.kickoff_utc,
            changed ? existing.kickoff_utc : existing.previous_kickoff_utc,
            changed ? new Date().toISOString() : existing.last_changed_at,
            m.id
          );
          result.updated++;
          if (changed) {
            result.changed++;
            summary.changed.push({ external_id: m.id, home: existing.home_team, away: existing.away_team, from: existing.kickoff_utc, to: m.utcDate });
          }
        }
      }
    } catch (e) {
      result.error = e.message;
      console.error(`[fixtures-sync] ${season.competition_code} failed:`, e.message);
    }

    // 3) league table — a second request, so throttle again before firing it
    try {
      await sleep(INTER_COMPETITION_DELAY_MS);
      result.standings = saveStandings(season.competition_code,
        await fetchStandings(season.competition_code, season.source_season));
    } catch (e) {
      console.error(`[fixtures-sync] ${season.competition_code} standings failed:`, e.message);
    }
    summary.totals.inserted += result.inserted;
    summary.totals.updated  += result.updated;
    summary.totals.changed  += result.changed;
    summary.totals.standings += result.standings;
    summary.perCompetition.push(result);
  }

  console.log('[fixtures-sync] done:', JSON.stringify(summary.totals), 'changed:', summary.changed.length);
  return summary;
}

module.exports = { syncFixtures, saveStandings };

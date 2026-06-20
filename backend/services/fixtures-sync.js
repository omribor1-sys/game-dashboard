'use strict';

const db = require('../database');
const { hasApiKey, fetchMatches } = require('./football-data-client');
const { kickoffChanged } = require('../utils/fixtures-format');

// ── prepared statements ──────────────────────────────────────────────────────
const getSeasons = (code) => code
  ? db.prepare('SELECT * FROM seasons WHERE active=1 AND competition_code=?').all(code)
  : db.prepare('SELECT * FROM seasons WHERE active=1 ORDER BY sort_order').all();

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
     home_team, away_team, kickoff_utc, status, is_tracked, tickets_status, last_synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', CURRENT_TIMESTAMP)
`);

// Sync-owned fields only. Never touches ticket fields. Skips kickoff if manually_overridden.
const updateFixtureFull = db.prepare(`
  UPDATE fixtures SET
    matchday=?, stage=?, status=?, home_team=?, away_team=?,
    home_team_id=?, away_team_id=?, is_tracked=?, last_synced_at=CURRENT_TIMESTAMP,
    kickoff_utc=?, previous_kickoff_utc=?, last_changed_at=?
  WHERE external_id=?
`);
const updateFixtureNoKickoff = db.prepare(`
  UPDATE fixtures SET
    matchday=?, stage=?, status=?, home_team=?, away_team=?,
    home_team_id=?, away_team_id=?, is_tracked=?, last_synced_at=CURRENT_TIMESTAMP
  WHERE external_id=?
`);

function teamIsTracked(apiTeamId) {
  const r = isTrackedTeam.get(apiTeamId);
  return r && r.is_tracked ? 1 : 0;
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
  const summary = { perCompetition: [], totals: { teams: 0, inserted: 0, updated: 0, changed: 0 }, changed: [] };

  for (const season of seasons) {
    const result = { code: season.competition_code, inserted: 0, updated: 0, changed: 0, error: null };
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

        if (!existing) {
          insertFixture.run(
            m.id, season.id, season.competition_code, m.matchday ?? null, m.stage ?? null,
            homeId ?? null, awayId ?? null,
            m.homeTeam?.shortName || m.homeTeam?.name || null,
            m.awayTeam?.shortName || m.awayTeam?.name || null,
            m.utcDate ?? null, m.status ?? null, tracked
          );
          result.inserted++;
        } else if (existing.manually_overridden) {
          // user owns kickoff + tickets; still refresh status/teams/matchday
          updateFixtureNoKickoff.run(
            m.matchday ?? null, m.stage ?? null, m.status ?? null,
            m.homeTeam?.shortName || m.homeTeam?.name || null,
            m.awayTeam?.shortName || m.awayTeam?.name || null,
            homeId ?? null, awayId ?? null, tracked, m.id
          );
          result.updated++;
        } else {
          const changed = kickoffChanged(existing.kickoff_utc, m.utcDate);
          updateFixtureFull.run(
            m.matchday ?? null, m.stage ?? null, m.status ?? null,
            m.homeTeam?.shortName || m.homeTeam?.name || null,
            m.awayTeam?.shortName || m.awayTeam?.name || null,
            homeId ?? null, awayId ?? null, tracked,
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
    summary.totals.inserted += result.inserted;
    summary.totals.updated  += result.updated;
    summary.totals.changed  += result.changed;
    summary.perCompetition.push(result);
  }

  console.log('[fixtures-sync] done:', JSON.stringify(summary.totals), 'changed:', summary.changed.length);
  return summary;
}

module.exports = { syncFixtures };

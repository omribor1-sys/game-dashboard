'use strict';

// UEFA's own match feed — the authoritative source for the Champions League.
//
// Why this exists: football-data.org's free plan still has no 2026/27 Champions League
// (season=2026 returned HTTP 500, then 0 matches), TheSportsDB has none of it either,
// and API-Football's free plan stops at season 2024. match.uefa.com serves the full
// league phase, free and without a key, from the organiser itself.
//
// Verified 2026-08-29: competitionId=1&seasonYear=2027 returns 234 matches, of which all
// 144 league-phase games carry an exact kickOffTime (2026-09-08 → 2027-01-27).

const db = require('../database');
const { matchTeam, resetTeamIndex } = require('../utils/team-match');

const BASE = 'https://match.uefa.com/v5/matches';

// UEFA labels a season by the year it ENDS: 2026/27 is seasonYear 2027.
const COMPETITIONS = [
  { code: 'CL',  uefa_id: 1,  label: 'Champions League' },
  { code: 'UEL', uefa_id: 14, label: 'Europa League' },
];

// external_id is UNIQUE across every provider. football-data sits in the 6–7 digit range
// and TheSportsDB is lifted to 2e9, so UEFA gets 3e9.
const ID_OFFSET = 3_000_000_000;

function seasonYear() {
  // A European season runs Aug→May, so before August we are still in the season that
  // ends this calendar year; from August the new one (ending next year) has started.
  const now = new Date();
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

async function fetchCompetition(uefaId, year) {
  const url = `${BASE}?competitionId=${uefaId}&seasonYear=${year}&limit=500&offset=0`;
  const res = await fetch(url, { headers: { 'User-Agent': 'game-dashboard/1.0', Accept: 'application/json' } });
  if (!res.ok) throw new Error(`uefa HTTP ${res.status} for competition ${uefaId}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

// UEFA statuses: UPCOMING / LIVE / FINISHED / POSTPONED / CANCELLED
function scoreOf(m) {
  const t = m.score && m.score.total;
  const home = t && Number.isInteger(t.home) ? t.home : null;
  const away = t && Number.isInteger(t.away) ? t.away : null;
  if (home === null || away === null) return { home: null, away: null, winner: null };
  return { home, away, winner: home > away ? 'HOME_TEAM' : away > home ? 'AWAY_TEAM' : 'DRAW' };
}

const getFixture = db.prepare('SELECT * FROM fixtures WHERE external_id=?');
const insertFixture = db.prepare(`
  INSERT INTO fixtures
    (external_id, season_id, competition_code, matchday, stage, home_team_id, away_team_id,
     home_team, away_team, kickoff_utc, status, is_tracked,
     home_score, away_score, winner, tickets_status, last_synced_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unknown', CURRENT_TIMESTAMP)
`);
// Ticket fields are never touched. A hand-edited kickoff is never overwritten.
const updateKeepKickoff = db.prepare(`
  UPDATE fixtures SET matchday=?, stage=?, status=?, home_team=?, away_team=?,
    home_team_id=?, away_team_id=?, is_tracked=?, home_score=?, away_score=?, winner=?,
    last_synced_at=CURRENT_TIMESTAMP
  WHERE external_id=?
`);
const updateWithKickoff = db.prepare(`
  UPDATE fixtures SET matchday=?, stage=?, status=?, home_team=?, away_team=?,
    home_team_id=?, away_team_id=?, is_tracked=?, home_score=?, away_score=?, winner=?,
    kickoff_utc=?, previous_kickoff_utc=?, last_changed_at=?, last_synced_at=CURRENT_TIMESTAMP
  WHERE external_id=?
`);
const isTrackedRow = db.prepare('SELECT is_tracked FROM teams WHERE api_team_id=?');
const tracked = (id) => {
  if (!id) return 0;
  const r = isTrackedRow.get(id);
  return r && r.is_tracked ? 1 : 0;
};

function seasonIdFor(code) {
  const r = db.prepare('SELECT id FROM seasons WHERE competition_code=?').get(code);
  return r ? r.id : null;
}

/**
 * Pull every UEFA competition for the current season and upsert into fixtures.
 * @returns {{perCompetition:Array, totals:Object, errors:string[]}}
 */
async function syncUefa() {
  resetTeamIndex();
  const year = seasonYear();
  const summary = { season_year: year, perCompetition: [], totals: { inserted: 0, updated: 0, rescheduled: 0, unmatched: 0 }, errors: [] };

  for (const comp of COMPETITIONS) {
    const result = { code: comp.code, fetched: 0, inserted: 0, updated: 0, rescheduled: 0, unmatched: 0, error: null };
    const seasonId = seasonIdFor(comp.code);
    try {
      const matches = await fetchCompetition(comp.uefa_id, year);
      result.fetched = matches.length;

      for (const m of matches) {
        const kickoff = m.kickOffTime && m.kickOffTime.dateTime ? m.kickOffTime.dateTime : null;
        // Placeholder entries exist before a draw ("Winner of path A"); they carry no
        // real opponent and would pollute the board.
        if (m.homeTeam?.isPlaceHolder || m.awayTeam?.isPlaceHolder) continue;

        const externalId = ID_OFFSET + Number(m.id);
        if (!Number.isFinite(externalId)) continue;

        const homeName = m.homeTeam?.internationalName || null;
        const awayName = m.awayTeam?.internationalName || null;
        const homeId = matchTeam(homeName);
        const awayId = matchTeam(awayName);
        if (!homeId && !awayId) {
          result.unmatched++;
          summary.errors.push(`no team matched in ${comp.code}: "${homeName}" vs "${awayName}"`);
        }

        const sc = scoreOf(m);
        const stage = (m.round && m.round.metaData && m.round.metaData.name) || null;
        const md = m.matchday && m.matchday.name ? Number.parseInt(String(m.matchday.name).replace(/\D/g, ''), 10) : null;
        const isTrackedFixture = (tracked(homeId) || tracked(awayId)) ? 1 : 0;

        const existing = getFixture.get(externalId);
        if (!existing) {
          insertFixture.run(externalId, seasonId, comp.code, Number.isFinite(md) ? md : null, stage,
            homeId, awayId, homeName, awayName, kickoff, m.status || null, isTrackedFixture,
            sc.home, sc.away, sc.winner);
          result.inserted++;
        } else if (existing.manually_overridden || !kickoff) {
          updateKeepKickoff.run(Number.isFinite(md) ? md : null, stage, m.status || null,
            homeName, awayName, homeId, awayId, isTrackedFixture, sc.home, sc.away, sc.winner, externalId);
          result.updated++;
        } else {
          // UEFA moves European kickoffs more than domestic leagues do — keep the old
          // time so the board can flag the change, same contract as fixtures-sync.
          const moved = existing.kickoff_utc && existing.kickoff_utc !== kickoff;
          updateWithKickoff.run(Number.isFinite(md) ? md : null, stage, m.status || null,
            homeName, awayName, homeId, awayId, isTrackedFixture, sc.home, sc.away, sc.winner,
            kickoff,
            moved ? existing.kickoff_utc : existing.previous_kickoff_utc,
            moved ? new Date().toISOString() : existing.last_changed_at,
            externalId);
          result.updated++;
          if (moved) result.rescheduled++;
        }
      }
    } catch (e) {
      result.error = e.message;
      console.error(`[uefa-sync] ${comp.code} failed:`, e.message);
    }

    summary.totals.inserted += result.inserted;
    summary.totals.updated += result.updated;
    summary.totals.rescheduled += result.rescheduled;
    summary.totals.unmatched += result.unmatched;
    summary.perCompetition.push(result);
  }

  console.log('[uefa-sync] done:', JSON.stringify(summary.totals));
  return summary;
}

module.exports = { syncUefa, COMPETITIONS, seasonYear };

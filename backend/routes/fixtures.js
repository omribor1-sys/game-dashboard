'use strict';

const express = require('express');
const db = require('../database');
const { toUkLocalString, homeAwayClause } = require('../utils/fixtures-format');
const { syncFixtures } = require('../services/fixtures-sync');

const router = express.Router();

// helper: enrich a fixture row with local time + crests
const crestFor = db.prepare('SELECT crest_url, tla FROM teams WHERE api_team_id=?');
function enrich(row) {
  const home = crestFor.get(row.home_team_id) || {};
  const away = crestFor.get(row.away_team_id) || {};
  return {
    ...row,
    kickoff_local: toUkLocalString(row.kickoff_utc),
    previous_kickoff_local: toUkLocalString(row.previous_kickoff_utc),
    tickets_onsale_local: toUkLocalString(row.tickets_onsale_at),
    home_crest: home.crest_url || null, home_tla: home.tla || null,
    away_crest: away.crest_url || null, away_tla: away.tla || null,
  };
}

function defaultCompetition() {
  const d = db.prepare('SELECT competition_code FROM seasons WHERE is_default=1 LIMIT 1').get();
  return d ? d.competition_code : 'PL';
}

// GET /api/fixtures/competitions  → league tabs
router.get('/competitions', (req, res) => {
  const LABELS = { PL:'Premier League', PD:'La Liga', SA:'Serie A', CL:'Champions League', DED:'Eredivisie', BL1:'Bundesliga', FL1:'Ligue 1' };
  const rows = db.prepare('SELECT * FROM seasons WHERE active=1 ORDER BY sort_order').all();
  const out = rows.map(s => ({
    competition_code: s.competition_code,
    name: s.name,
    label: LABELS[s.competition_code] || s.competition_code,
    is_default: s.is_default,
    sort_order: s.sort_order,
    fixture_count: db.prepare('SELECT COUNT(*) c FROM fixtures WHERE competition_code=?').get(s.competition_code).c,
    last_synced_at: db.prepare('SELECT MAX(last_synced_at) m FROM fixtures WHERE competition_code=?').get(s.competition_code).m,
  }));
  res.json(out);
});

// GET /api/fixtures/hot  → HOT GAMES tab, all competitions
router.get('/hot', (req, res) => {
  const rows = db.prepare('SELECT * FROM fixtures WHERE is_hot=1 ORDER BY kickoff_utc').all();
  res.json(rows.map(enrich));
});

// GET /api/fixtures/meta?competition=PL  → filter metadata scoped to a competition
router.get('/meta', (req, res) => {
  const code = req.query.competition || defaultCompetition();
  const teams = db.prepare(`
    SELECT t.api_team_id, t.name, t.crest_url, t.tla, t.is_tracked, t.is_primary,
           (SELECT COUNT(*) FROM fixtures f WHERE f.competition_code=? AND (f.home_team_id=t.api_team_id OR f.away_team_id=t.api_team_id)) AS cnt
    FROM teams t
    WHERE t.api_team_id IN (SELECT home_team_id FROM fixtures WHERE competition_code=? UNION SELECT away_team_id FROM fixtures WHERE competition_code=?)
    ORDER BY t.is_tracked DESC, t.name
  `).all(code, code, code);
  const months = db.prepare(`SELECT DISTINCT substr(kickoff_utc,1,7) ym FROM fixtures WHERE competition_code=? AND kickoff_utc IS NOT NULL ORDER BY ym`).all(code).map(r => r.ym);
  const matchdays = db.prepare(`SELECT DISTINCT matchday FROM fixtures WHERE competition_code=? AND matchday IS NOT NULL ORDER BY matchday`).all(code).map(r => r.matchday);
  const last = db.prepare('SELECT MAX(last_synced_at) m FROM fixtures WHERE competition_code=?').get(code).m;
  res.json({ teams, months, matchdays, last_synced_at: last });
});

// GET /api/fixtures?competition=PL&month=2026-12&team=57&homeAway=home&tracked=1&matchday=5
router.get('/', (req, res) => {
  const code = req.query.competition || defaultCompetition();
  const where = ['competition_code = ?'];
  const params = [code];

  if (req.query.month) { where.push("substr(kickoff_utc,1,7) = ?"); params.push(req.query.month); }
  if (req.query.matchday) { where.push('matchday = ?'); params.push(Number(req.query.matchday)); }
  if (req.query.tracked === '1') { where.push('is_tracked = 1'); }

  const team = req.query.team ? Number(req.query.team) : null;
  if (team) {
    const ha = homeAwayClause(req.query.homeAway || 'all', team);
    if (ha.sql) { where.push(ha.sql); params.push(...ha.params); }
  }

  const rows = db.prepare(`SELECT * FROM fixtures WHERE ${where.join(' AND ')} ORDER BY kickoff_utc`).all(...params);
  res.json(rows.map(enrich));
});

// POST /api/fixtures/sync   body: { competition_code? }
router.post('/sync', async (req, res) => {
  try {
    const summary = await syncFixtures({ competition_code: req.body?.competition_code });
    res.json(summary);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/fixtures/:id  → manual edit of kickoff + ticket fields
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const fx = db.prepare('SELECT * FROM fixtures WHERE id=?').get(id);
  if (!fx) return res.status(404).json({ error: 'not found' });

  const { kickoff_utc, tickets_onsale_at, tickets_status, tickets_info, is_hot, hot_tier, hot_reason } = req.body || {};
  const next = {
    kickoff_utc: kickoff_utc ?? fx.kickoff_utc,
    tickets_onsale_at: tickets_onsale_at ?? fx.tickets_onsale_at,
    tickets_status: tickets_status ?? fx.tickets_status,
    tickets_info: tickets_info ?? fx.tickets_info,
    is_hot: is_hot ?? fx.is_hot,
    hot_tier: hot_tier ?? fx.hot_tier,
    hot_reason: hot_reason ?? fx.hot_reason,
  };
  db.prepare(`UPDATE fixtures SET kickoff_utc=?, tickets_onsale_at=?, tickets_status=?, tickets_info=?,
              is_hot=?, hot_tier=?, hot_reason=?,
              tickets_source='manual', manually_overridden=1 WHERE id=?`)
    .run(next.kickoff_utc, next.tickets_onsale_at, next.tickets_status, next.tickets_info,
         next.is_hot ? 1 : 0, next.hot_tier, next.hot_reason, id);

  // audit (reuse existing audit_log table)
  try {
    db.prepare(`INSERT INTO audit_log (source, action, table_name, record_id, note)
                VALUES ('fixtures-manual-edit','UPDATE','fixtures',?,?)`).run(String(id), JSON.stringify(req.body || {}));
  } catch (_) {}

  res.json(enrich(db.prepare('SELECT * FROM fixtures WHERE id=?').get(id)));
});

// GET /api/fixtures/teams  → manage tracked teams
router.get('/teams', (req, res) => {
  res.json(db.prepare('SELECT api_team_id, name, crest_url, tla, is_tracked, is_primary FROM teams ORDER BY is_tracked DESC, name').all());
});

// POST /api/fixtures/teams  body: { api_team_id, is_tracked, is_primary }
router.post('/teams', (req, res) => {
  const { api_team_id, is_tracked, is_primary } = req.body || {};
  if (!api_team_id) return res.status(400).json({ error: 'api_team_id required' });
  db.prepare('UPDATE teams SET is_tracked=?, is_primary=? WHERE api_team_id=?')
    .run(is_tracked ? 1 : 0, is_primary ? 1 : 0, api_team_id);
  // recompute is_tracked on affected fixtures
  db.prepare(`UPDATE fixtures SET is_tracked =
      (SELECT CASE WHEN EXISTS(SELECT 1 FROM teams t WHERE t.is_tracked=1 AND (t.api_team_id=fixtures.home_team_id OR t.api_team_id=fixtures.away_team_id)) THEN 1 ELSE 0 END)
    WHERE home_team_id=? OR away_team_id=?`).run(api_team_id, api_team_id);
  res.json({ ok: true });
});

module.exports = router;

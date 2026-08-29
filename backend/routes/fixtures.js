'use strict';

const express = require('express');
const db = require('../database');
const { toUkLocalString, homeAwayClause } = require('../utils/fixtures-format');
const { syncFixtures } = require('../services/fixtures-sync');

const router = express.Router();

// helper: enrich a fixture row with local time + crests
const crestFor = db.prepare('SELECT crest_url, tla FROM teams WHERE api_team_id=?');

// ── closed-game P&L lookup ──────────────────────────────────────────────────
// games.name is free text ("Manchester City FC vs AFC Bournemouth"), fixtures carry
// the two team names separately. Normalise both sides and match on name, falling
// back to same-day + both teams present.
function norm(s) {
  return String(s || '').toLowerCase().replace(/\b(fc|afc)\b/g, '').replace(/[^a-z0-9]/g, '');
}
function profitIndex() {
  return db.prepare(`
    SELECT name, date, total_revenue, total_all_costs, net_profit, margin_percent, tickets_sold
    FROM games WHERE completed = 1
  `).all().map(g => ({ ...g, key: norm(g.name) }));
}
// fixtures use short labels ("Man City"), games use full ones ("Manchester City FC").
// On a same-day match, accept when at least one 3+ char token of each side appears.
function sideMatches(team, key) {
  return String(team || '').toLowerCase().split(/[^a-z0-9]+/)
    .some(t => t.length >= 3 && key.includes(t));
}
function profitFor(row, idx) {
  if (!idx || !idx.length) return null;
  const key = norm(`${row.home_team} vs ${row.away_team}`);
  const day = (row.kickoff_utc || '').slice(0, 10);
  const g = idx.find(x => x.key === key)
    || idx.find(x => x.date === day && sideMatches(row.home_team, x.key) && sideMatches(row.away_team, x.key));
  if (!g) return null;
  return {
    game_name: g.name,
    revenue: g.total_revenue,
    cost: g.total_all_costs,
    net_profit: g.net_profit,
    margin_percent: g.margin_percent,
    tickets_sold: g.tickets_sold,
  };
}

function enrich(row, idx) {
  const home = crestFor.get(row.home_team_id) || {};
  const away = crestFor.get(row.away_team_id) || {};
  return {
    ...row,
    kickoff_local: toUkLocalString(row.kickoff_utc),
    previous_kickoff_local: toUkLocalString(row.previous_kickoff_utc),
    tickets_onsale_local: toUkLocalString(row.tickets_onsale_at),
    home_crest: home.crest_url || null, home_tla: home.tla || null,
    away_crest: away.crest_url || null, away_tla: away.tla || null,
    pnl: profitFor(row, idx),
  };
}

function defaultCompetition() {
  const d = db.prepare('SELECT competition_code FROM seasons WHERE is_default=1 LIMIT 1').get();
  return d ? d.competition_code : 'PL';
}

// GET /api/fixtures/available  → what football-data actually exposes for our API key.
// Plan coverage is not documented per-key, so ask the provider instead of guessing
// which cup competitions we can track.
router.get('/available', async (req, res) => {
  try {
    const { apiGet } = require('../services/football-data-client');
    const data = await apiGet('/competitions', 'competitions');
    res.json((data.competitions || []).map(c => ({
      code: c.code, name: c.name, type: c.type, area: c.area?.name,
      current_season: c.currentSeason?.startDate ? c.currentSeason.startDate.slice(0, 4) : null,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fixtures/probe?competition=CL&season=2026  → what the provider returns for a
// season we do not hold yet, without writing anything. Answers "is the new draw published?"
router.get('/probe', async (req, res) => {
  const code = String(req.query.competition || 'CL').replace(/[^A-Z0-9]/gi, '');
  const season = String(req.query.season || '').replace(/[^0-9]/g, '');
  try {
    const { apiGet } = require('../services/football-data-client');
    const data = await apiGet(`/competitions/${code}/matches${season ? `?season=${season}` : ''}`, `${code} probe`);
    const ms = data.matches || [];
    res.json({
      code, season_requested: season || null,
      filters: data.filters, resultSet: data.resultSet,
      count: ms.length,
      first: ms[0] ? { date: ms[0].utcDate, home: ms[0].homeTeam?.name, away: ms[0].awayTeam?.name, stage: ms[0].stage } : null,
      last: ms.length ? { date: ms[ms.length - 1].utcDate } : null,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fixtures/probe-matches?from=YYYY-MM-DD&to=YYYY-MM-DD
// The cross-competition /v4/matches feed. Worth probing separately: it can surface
// competitions that /v4/competitions does not list for our plan.
router.get('/probe-matches', async (req, res) => {
  const clean = (v) => String(v || '').replace(/[^0-9-]/g, '');
  const from = clean(req.query.from), to = clean(req.query.to);
  try {
    const { apiGet } = require('../services/football-data-client');
    const qs = from && to ? `?dateFrom=${from}&dateTo=${to}` : '';
    const data = await apiGet(`/matches${qs}`, 'matches feed');
    const byComp = {};
    for (const m of (data.matches || [])) {
      const c = m.competition || {};
      const k = `${c.code || '??'} — ${c.name || '?'}`;
      (byComp[k] = byComp[k] || { count: 0, sample: null }).count++;
      if (!byComp[k].sample) byComp[k].sample = `${m.utcDate?.slice(0, 10)} ${m.homeTeam?.name} vs ${m.awayTeam?.name}`;
    }
    res.json({ range: { from: from || null, to: to || null }, total: (data.matches || []).length, byComp });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fixtures/competitions  → league tabs
router.get('/competitions', (req, res) => {
  const LABELS = { PL:'Premier League', PD:'La Liga', SA:'Serie A', CL:'Champions League', DED:'Eredivisie', BL1:'Bundesliga', FL1:'Ligue 1', EFL:'Carabao Cup', UEL:'Europa League', FAC:'FA Cup' };
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
  const idx = profitIndex();
  res.json(rows.map(r => enrich(r, idx)));
});

// GET /api/fixtures/meta?competition=PL  → filter metadata scoped to a competition
router.get('/meta', (req, res) => {
  const code = req.query.competition || defaultCompetition();
  // ALL = every competition at once: the team filter is meant to follow a club across
  // its league AND its cups, so the metadata behind it must not be scoped to one tab.
  const all = code === 'ALL';
  const scope = all ? '1=1' : 'competition_code = ?';
  const p = all ? [] : [code];

  const teams = db.prepare(`
    SELECT t.api_team_id, t.name, t.crest_url, t.tla, t.is_tracked, t.is_primary,
           (SELECT COUNT(*) FROM fixtures f WHERE ${all ? '1=1' : 'f.competition_code=?'}
              AND (f.home_team_id=t.api_team_id OR f.away_team_id=t.api_team_id)) AS cnt
    FROM teams t
    WHERE t.api_team_id IN (
      SELECT home_team_id FROM fixtures WHERE ${scope}
      UNION SELECT away_team_id FROM fixtures WHERE ${scope})
    ORDER BY t.is_tracked DESC, t.name
  `).all(...p, ...p, ...p);
  const months = db.prepare(`SELECT DISTINCT substr(kickoff_utc,1,7) ym FROM fixtures WHERE ${scope} AND kickoff_utc IS NOT NULL ORDER BY ym`).all(...p).map(r => r.ym);
  const matchdays = db.prepare(`SELECT DISTINCT matchday FROM fixtures WHERE ${scope} AND matchday IS NOT NULL ORDER BY matchday`).all(...p).map(r => r.matchday);
  const last = db.prepare(`SELECT MAX(last_synced_at) m FROM fixtures WHERE ${scope}`).get(...p).m;
  res.json({ teams, months, matchdays, last_synced_at: last });
});

// GET /api/fixtures/standings?competition=PL  → current league table
router.get('/standings', (req, res) => {
  const code = req.query.competition || defaultCompetition();
  const rows = db.prepare(`
    SELECT * FROM standings WHERE competition_code=? ORDER BY group_name, position
  `).all(code);
  const tracked = new Set(db.prepare('SELECT api_team_id FROM teams WHERE is_tracked=1').all().map(t => t.api_team_id));
  // group into [{ group, rows }] so cup competitions render one table per group
  const groups = [];
  for (const r of rows) {
    const row = { ...r, is_tracked: tracked.has(r.team_id) ? 1 : 0 };
    const last = groups[groups.length - 1];
    if (last && last.group === r.group_name) last.rows.push(row);
    else groups.push({ group: r.group_name, rows: [row] });
  }
  res.json({ competition_code: code, updated_at: rows.length ? rows[0].updated_at : null, groups });
});

// GET /api/fixtures?competition=PL&month=2026-12&team=57&homeAway=home&tracked=1&matchday=5
router.get('/', (req, res) => {
  const code = req.query.competition || defaultCompetition();
  // ALL spans every competition — one club's league games, cup games and Europe together.
  const where = code === 'ALL' ? [] : ['competition_code = ?'];
  const params = code === 'ALL' ? [] : [code];

  if (req.query.month) { where.push("substr(kickoff_utc,1,7) = ?"); params.push(req.query.month); }
  if (req.query.matchday) { where.push('matchday = ?'); params.push(Number(req.query.matchday)); }
  if (req.query.tracked === '1') { where.push('is_tracked = 1'); }

  const team = req.query.team ? Number(req.query.team) : null;
  if (team) {
    const ha = homeAwayClause(req.query.homeAway || 'all', team);
    if (ha.sql) { where.push(ha.sql); params.push(...ha.params); }
  }

  const rows = db.prepare(
    `SELECT * FROM fixtures ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY kickoff_utc`
  ).all(...params);
  const idx = profitIndex();
  res.json(rows.map(r => enrich(r, idx)));
});

// POST /api/fixtures/sync-cups  → TheSportsDB competitions (Carabao Cup, Europa League)
router.post('/sync-cups', async (req, res) => {
  try {
    const { syncSportsDb } = require('../services/sportsdb-sync');
    res.json(await syncSportsDb());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fixtures/sync-uefa  → Champions League / Europa League from match.uefa.com
router.post('/sync-uefa', async (req, res) => {
  try {
    const { syncUefa } = require('../services/uefa-sync');
    res.json(await syncUefa());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/fixtures/verify  → cross-source check. Read-only: it reports, never repairs.
router.get('/verify', async (req, res) => {
  try {
    const { verifyFixtures } = require('../services/fixture-verify');
    res.json(await verifyFixtures());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fixtures/verify/notify  → run the check and WhatsApp only if it disagrees
router.post('/verify/notify', async (req, res) => {
  try {
    const { verifyFixtures, formatAlert } = require('../services/fixture-verify');
    const report = await verifyFixtures();
    const msg = formatAlert(report);
    if (msg) {
      const { sendWhatsApp } = require('../services/whatsapp-notifier');
      await sendWhatsApp(msg);
    }
    res.json({ notified: !!msg, checked: report.checked, mismatches: report.mismatches.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/fixtures/detect-hot  → refresh odds-derived hot flags
router.post('/detect-hot', async (req, res) => {
  try {
    const { detectHotGames } = require('../services/hot-detect');
    res.json(await detectHotGames());
  } catch (e) { res.status(500).json({ error: e.message }); }
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
              tickets_source='manual', manually_overridden=1,
              hot_source=CASE WHEN ? THEN 'manual' ELSE hot_source END WHERE id=?`)
    .run(next.kickoff_utc, next.tickets_onsale_at, next.tickets_status, next.tickets_info,
         next.is_hot ? 1 : 0, next.hot_tier, next.hot_reason,
         is_hot !== undefined ? 1 : 0, id);

  // audit (reuse existing audit_log table)
  try {
    db.prepare(`INSERT INTO audit_log (source, action, table_name, record_id, note)
                VALUES ('fixtures-manual-edit','UPDATE','fixtures',?,?)`).run(String(id), JSON.stringify(req.body || {}));
  } catch (_) {}

  res.json(enrich(db.prepare('SELECT * FROM fixtures WHERE id=?').get(id), profitIndex()));
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

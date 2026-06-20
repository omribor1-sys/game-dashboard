# Season Fixtures Board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The UI tasks (8–13) MUST also consult the `frontend-design` skill.

**Goal:** Add a visual "Season Fixtures" board to the game-dashboard — league tabs (Premier League default + 6 more), monthly calendar + matchweek views, team crests, combinable filters, reschedule detection, per-fixture ticket-purchase info, manual edit, and add-to-calendar — sourced from football-data.org.

**Architecture:** New SQLite tables (`seasons`, `teams`, `fixtures`) in the existing `node:sqlite` DB. A deterministic sync service pulls 7 competitions from football-data.org and upserts by stable match id (enables de-dup + change detection). A new Express router exposes read/sync/edit endpoints. A new React page renders tabs → filters → calendar/matchweek cards. No new runtime LLM calls — all logic is plain code.

**Tech Stack:** Node.js 24 (global `fetch`, `node:sqlite`), Express, `node-cron`, React + Vite (plain CSS variables). No test framework exists in the repo → pure-function logic is verified with small `node:assert` scripts under `backend/test/`; integration is verified with curl/SSH/preview.

**Source spec:** `docs/specs/2026-06-20-season-fixtures-board-design.md` (read it before starting).

**Model assignment per task (token efficiency):** each task is tagged `[MODEL: Haiku|Sonnet|Opus]`. Haiku = mechanical/well-specified; Sonnet = logic/UI judgment; Opus = final cross-cutting integration + review. The implementer/orchestrator dispatches each task to the tagged model.

**Conventions to honor (from existing code):**
- Routers live in `backend/routes/*.js`, mounted in `backend/server.js` below the `requireAuth` line (~line 22+).
- DB is the singleton from `backend/database.js` (`const db = require('../database')`).
- Cron jobs are registered in `backend/server.js` with `cron.schedule(...)` (see existing jobs ~line 465+).
- Frontend routes are in `frontend/src/App.jsx` `<Routes>` (~line 145); sidebar nav in the same file (~line 40).
- Frontend fetches relative `/api/...` with `credentials:'include'`, error-checked.
- CSS variables/classes in `frontend/src/index.css` (`.page`, `.card`, `.btn`, `.badge*`). No hardcoded hex.
- Datetime display format: `"Sat, 21/08/2026, 20:00"` (3-char day) — there is already a `DAY_ABBR` pattern in `gmail-importer.js`.

**Git:** Follow the project convention — commit to `main` with descriptive messages after each task (the project's CLAUDE.md uses checkpoint commits on main; zero-approval). Deploy only at the end (Task 16).

---

## File Structure

**Create:**
- `backend/services/football-data-client.js` — thin fetch wrapper for football-data.org (auth, one method per competition).
- `backend/services/fixtures-sync.js` — orchestration: loop competitions, upsert teams + fixtures, detect changes.
- `backend/utils/fixtures-format.js` — pure helpers: UTC→UK-local string, `homeAway` SQL predicate, tracked-team seed list, kickoff change detection. (Pure → unit-tested.)
- `backend/routes/fixtures.js` — Express router: competitions, fixtures, meta, sync, edit, teams.
- `backend/test/fixtures-format.test.js` — `node:assert` tests for the pure helpers.
- `frontend/src/pages/SeasonFixtures.jsx` — page shell (tabs + filter state + view switch + data fetch).
- `frontend/src/components/fixtures/LeagueTabs.jsx` — competition tab bar.
- `frontend/src/components/fixtures/FixtureFilters.jsx` — team/month/home-away/tracked/view controls.
- `frontend/src/components/fixtures/FixtureCard.jsx` — one fixture (crests, tags, ticket strip, actions).
- `frontend/src/components/fixtures/FixtureEditModal.jsx` — manual edit.
- `frontend/src/components/fixtures/calendarLinks.js` — pure: Google Calendar URL + `.ics` builder.
- `frontend/src/styles/fixtures.css` — page-scoped styles (imported by the page).

**Modify:**
- `backend/database.js` — add tables + seed competitions + seed tracked teams (idempotent).
- `backend/server.js` — mount router + weekly cron.
- `frontend/src/App.jsx` — route `/fixtures` + sidebar item.

---

## Task 1: Database schema + seed (seasons, teams, fixtures) `[MODEL: Haiku]`

**Files:**
- Modify: `backend/database.js` (add to the `db.exec(\`...\`)` block before `module.exports`, and add idempotent seeds after it).

- [ ] **Step 1: Add the three tables** inside the existing `db.exec(\`...\`)` template (alongside the other `CREATE TABLE IF NOT EXISTS`). Paste exactly:

```sql
  CREATE TABLE IF NOT EXISTS seasons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    competition_code TEXT NOT NULL UNIQUE,
    source_season TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    is_default INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_team_id INTEGER UNIQUE,
    name TEXT NOT NULL,
    full_name TEXT,
    tla TEXT,
    crest_url TEXT,
    is_tracked INTEGER DEFAULT 0,
    is_primary INTEGER DEFAULT 0,
    active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fixtures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id INTEGER UNIQUE NOT NULL,
    season_id INTEGER REFERENCES seasons(id),
    competition_code TEXT DEFAULT 'PL',
    matchday INTEGER,
    stage TEXT,
    home_team_id INTEGER,
    away_team_id INTEGER,
    home_team TEXT,
    away_team TEXT,
    kickoff_utc TEXT,
    status TEXT,
    is_tracked INTEGER DEFAULT 0,
    previous_kickoff_utc TEXT,
    last_changed_at DATETIME,
    tickets_onsale_at TEXT,
    tickets_status TEXT DEFAULT 'unknown',
    tickets_info TEXT,
    tickets_source TEXT,
    manually_overridden INTEGER DEFAULT 0,
    last_synced_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_fixtures_season ON fixtures(season_id);
  CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff ON fixtures(kickoff_utc);
  CREATE INDEX IF NOT EXISTS idx_fixtures_competition ON fixtures(competition_code);
```

- [ ] **Step 2: Seed the 7 competitions** (idempotent) after the `db.exec` block, before `module.exports`:

```js
// Seed competitions (league tabs). INSERT OR IGNORE keeps it idempotent.
const COMPETITIONS = [
  ['Premier League 2026/27', 'PL',  '2026', '2026-08-21', '2027-05-30', 1, 0],
  ['La Liga 2026/27',        'PD',  '2026', null, null, 0, 1],
  ['Serie A 2026/27',        'SA',  '2026', null, null, 0, 2],
  ['Champions League 2026/27','CL', '2026', null, null, 0, 3],
  ['Eredivisie 2026/27',     'DED', '2026', null, null, 0, 4],
  ['Bundesliga 2026/27',     'BL1', '2026', null, null, 0, 5],
  ['Ligue 1 2026/27',        'FL1', '2026', null, null, 0, 6],
];
const _seedSeason = db.prepare(
  `INSERT OR IGNORE INTO seasons (name, competition_code, source_season, start_date, end_date, is_default, sort_order)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
for (const c of COMPETITIONS) { try { _seedSeason.run(...c); } catch (_) {} }
```

- [ ] **Step 3: Seed tracked teams** (by football-data team id; idempotent — only inserts a stub row that the first sync will enrich with crest/name). Add after the competition seed:

```js
// Tracked teams Omri works with — football-data team ids are stable.
// First sync fills crest_url/full_name; here we ensure the row exists with the tracking flag.
const TRACKED_TEAMS = [
  [57,  'Arsenal',          1], // [api_team_id, display name, is_primary]
  [61,  'Chelsea',          0],
  [67,  'Newcastle United', 0],
  [64,  'Liverpool',        0],
  [65,  'Manchester City',  0],
  [66,  'Manchester United',0],
  [63,  'Fulham',           0],
  [402, 'Brentford',        0],
  [354, 'Crystal Palace',   0],
  [62,  'Everton',          0],
];
const _seedTeam = db.prepare(
  `INSERT INTO teams (api_team_id, name, is_tracked, is_primary)
   VALUES (?, ?, 1, ?)
   ON CONFLICT(api_team_id) DO UPDATE SET is_tracked=1, is_primary=excluded.is_primary`
);
for (const t of TRACKED_TEAMS) { try { _seedTeam.run(t[0], t[1], t[2]); } catch (_) {} }
```

> NOTE: the team ids above are football-data's well-known PL ids (Arsenal 57, Chelsea 61, Liverpool 64, Man City 65, Man Utd 66, Fulham 63, Newcastle 67, Everton 62, Crystal Palace 354, Brentford 402). The sync (Task 4) logs any tracked id that never appears in the API response so the list can be corrected.

- [ ] **Step 4: Verify the DB initializes** (no API key needed):

Run: `cd backend && node -e "const db=require('./database'); console.log('seasons', db.prepare('SELECT count(*) c FROM seasons').get().c); console.log('tracked', db.prepare('SELECT count(*) c FROM teams WHERE is_tracked=1').get().c); console.log('fixtures table ok', !!db.prepare('SELECT name FROM sqlite_master WHERE type=? AND name=?').get('table','fixtures'));"`
Expected: `seasons 7`, `tracked 10`, `fixtures table ok true`.

- [ ] **Step 5: Commit**

```bash
git add backend/database.js
git commit -m "feat(fixtures): add seasons/teams/fixtures tables + seed competitions & tracked teams"
```

---

## Task 2: Pure formatting/helper utilities (+ tests) `[MODEL: Sonnet]`

These are pure functions so they can be unit-tested cheaply and reused by both sync and routes.

**Files:**
- Create: `backend/utils/fixtures-format.js`
- Create: `backend/test/fixtures-format.test.js`

- [ ] **Step 1: Write the failing tests** in `backend/test/fixtures-format.test.js`:

```js
const assert = require('node:assert');
const { toUkLocalString, kickoffChanged, homeAwayClause } = require('../utils/fixtures-format');

// 1) UTC -> UK local "Sat, 21/08/2026, 20:00". 21 Aug = BST (UTC+1): 19:00Z -> 20:00 local.
assert.strictEqual(toUkLocalString('2026-08-21T19:00:00Z'), 'Fri, 21/08/2026, 20:00');
// 2) Winter (GMT, UTC+0): 5 Dec 2026 15:00Z -> 15:00 local.
assert.strictEqual(toUkLocalString('2026-12-05T15:00:00Z'), 'Sat, 05/12/2026, 15:00');
// 3) null in -> null out (no crash)
assert.strictEqual(toUkLocalString(null), null);

// 4) change detection: only a real difference counts
assert.strictEqual(kickoffChanged('2026-08-21T19:00:00Z', '2026-08-21T19:00:00Z'), false);
assert.strictEqual(kickoffChanged('2026-08-21T19:00:00Z', '2026-08-22T13:00:00Z'), true);
assert.strictEqual(kickoffChanged(null, '2026-08-21T19:00:00Z'), false); // first-time set is not a "change"

// 5) homeAwayClause builds the right SQL fragment + params
assert.deepStrictEqual(homeAwayClause('home', 57), { sql: 'home_team_id = ?', params: [57] });
assert.deepStrictEqual(homeAwayClause('away', 57), { sql: 'away_team_id = ?', params: [57] });
assert.deepStrictEqual(homeAwayClause('all', 57),  { sql: '(home_team_id = ? OR away_team_id = ?)', params: [57, 57] });
assert.deepStrictEqual(homeAwayClause('home', null), { sql: null, params: [] }); // no team => ignored

console.log('fixtures-format: all assertions passed');
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node backend/test/fixtures-format.test.js`
Expected: FAIL — `Cannot find module '../utils/fixtures-format'`.

- [ ] **Step 3: Implement `backend/utils/fixtures-format.js`:**

```js
'use strict';

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Convert an ISO UTC timestamp to a UK-local display string "Ddd, DD/MM/YYYY, HH:MM"
 * (Europe/London — BST/GMT handled by Intl). Returns null for falsy input.
 */
function toUkLocalString(utcIso) {
  if (!utcIso) return null;
  const d = new Date(utcIso);
  if (isNaN(d)) return null;
  // Use Intl to get Europe/London wall-clock parts.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d).reduce((a, p) => (a[p.type] = p.value, a), {});
  // en-GB short weekday is already "Fri" etc.; normalize "24" hour to "00".
  const hour = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.weekday}, ${parts.day}/${parts.month}/${parts.year}, ${hour}:${parts.minute}`;
}

/** True only when there is a real, non-null change from oldUtc to newUtc. */
function kickoffChanged(oldUtc, newUtc) {
  if (!oldUtc || !newUtc) return false;
  return new Date(oldUtc).getTime() !== new Date(newUtc).getTime();
}

/**
 * Build the SQL fragment for the home/away filter. Only meaningful with a team id.
 * @returns {{sql: string|null, params: any[]}}
 */
function homeAwayClause(homeAway, apiTeamId) {
  if (!apiTeamId) return { sql: null, params: [] };
  if (homeAway === 'home') return { sql: 'home_team_id = ?', params: [apiTeamId] };
  if (homeAway === 'away') return { sql: 'away_team_id = ?', params: [apiTeamId] };
  return { sql: '(home_team_id = ? OR away_team_id = ?)', params: [apiTeamId, apiTeamId] };
}

module.exports = { toUkLocalString, kickoffChanged, homeAwayClause, DAY_ABBR };
```

> If Step 4 shows the `en-GB` short weekday differs from the expected (locale quirk), switch to computing the weekday from `DAY_ABBR[<Europe/London weekday index>]`. Keep the test as the source of truth.

- [ ] **Step 4: Run the tests — expect PASS**

Run: `node backend/test/fixtures-format.test.js`
Expected: `fixtures-format: all assertions passed`. If a weekday assertion fails due to locale, apply the note above and re-run.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/fixtures-format.js backend/test/fixtures-format.test.js
git commit -m "feat(fixtures): pure format/filter helpers with node:assert tests"
```

---

## Task 3: football-data.org API client `[MODEL: Haiku]`

**Files:**
- Create: `backend/services/football-data-client.js`

- [ ] **Step 1: Implement the client:**

```js
'use strict';

const BASE = 'https://api.football-data.org/v4';

/** Returns true if an API key is configured. */
function hasApiKey() {
  return !!process.env.FOOTBALL_DATA_API_KEY;
}

/**
 * Fetch all matches for a competition + season.
 * @param {string} competitionCode e.g. 'PL'
 * @param {string} sourceSeason e.g. '2026'
 * @returns {Promise<Array>} the raw `matches[]` array (empty array if none)
 * @throws if the HTTP call fails (caller decides whether to continue)
 */
async function fetchMatches(competitionCode, sourceSeason) {
  const url = `${BASE}/competitions/${competitionCode}/matches?season=${sourceSeason}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`football-data ${competitionCode} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data.matches) ? data.matches : [];
}

module.exports = { hasApiKey, fetchMatches };
```

- [ ] **Step 2: Smoke-check it loads** (no network):

Run: `node -e "const c=require('./backend/services/football-data-client'); console.log('hasApiKey', c.hasApiKey(), 'fetchMatches', typeof c.fetchMatches);"`
Expected: `hasApiKey false fetchMatches function` (false when no key set — correct).

- [ ] **Step 3: Commit**

```bash
git add backend/services/football-data-client.js
git commit -m "feat(fixtures): football-data.org API client"
```

---

## Task 4: Sync service (teams + fixtures upsert, change detection, multi-competition) `[MODEL: Sonnet]`

**Files:**
- Create: `backend/services/fixtures-sync.js`

- [ ] **Step 1: Implement `syncFixtures`:**

```js
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
```

- [ ] **Step 2: Verify graceful no-key behavior:**

Run: `node -e "require('./backend/services/fixtures-sync').syncFixtures().then(r=>console.log(JSON.stringify(r)))"`
Expected: `{"skipped":true,"reason":"no api key"}` (and a warning logged). Confirms it never crashes without a key.

- [ ] **Step 3: Commit**

```bash
git add backend/services/fixtures-sync.js
git commit -m "feat(fixtures): multi-competition sync with team upsert + reschedule detection"
```

---

## Task 5: REST router `[MODEL: Sonnet]`

**Files:**
- Create: `backend/routes/fixtures.js`
- Modify: `backend/server.js` (mount the router)

- [ ] **Step 1: Implement `backend/routes/fixtures.js`:**

```js
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
  const HEBREW = { PL:'אנגלית', PD:'ספרדית', SA:'איטלקית', CL:"צ'מפיונס", DED:'הולנדית', BL1:'גרמנית', FL1:'צרפתית' };
  const rows = db.prepare('SELECT * FROM seasons WHERE active=1 ORDER BY sort_order').all();
  const out = rows.map(s => ({
    competition_code: s.competition_code,
    name: s.name,
    hebrew_label: HEBREW[s.competition_code] || s.competition_code,
    is_default: s.is_default,
    sort_order: s.sort_order,
    fixture_count: db.prepare('SELECT COUNT(*) c FROM fixtures WHERE competition_code=?').get(s.competition_code).c,
    last_synced_at: db.prepare('SELECT MAX(last_synced_at) m FROM fixtures WHERE competition_code=?').get(s.competition_code).m,
  }));
  res.json(out);
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

  const { kickoff_utc, tickets_onsale_at, tickets_status, tickets_info } = req.body || {};
  const next = {
    kickoff_utc: kickoff_utc ?? fx.kickoff_utc,
    tickets_onsale_at: tickets_onsale_at ?? fx.tickets_onsale_at,
    tickets_status: tickets_status ?? fx.tickets_status,
    tickets_info: tickets_info ?? fx.tickets_info,
  };
  db.prepare(`UPDATE fixtures SET kickoff_utc=?, tickets_onsale_at=?, tickets_status=?, tickets_info=?,
              tickets_source='manual', manually_overridden=1 WHERE id=?`)
    .run(next.kickoff_utc, next.tickets_onsale_at, next.tickets_status, next.tickets_info, id);

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
```

> ROUTE ORDER NOTE: `/competitions`, `/meta`, `/teams`, `/sync` are declared before `/:id` so the literal paths aren't captured by the `:id` param. Keep this order.

- [ ] **Step 2: Mount the router** in `backend/server.js`. After the existing `app.use('/api/orders', ordersRouter);` line, add:

```js
app.use('/api/fixtures', require('./routes/fixtures'));
```

- [ ] **Step 3: Verify routes load + respond** (no key needed; tables seeded but empty fixtures):

Run: `cd backend && node -e "require('./routes/fixtures'); console.log('router loads ok');"`
Expected: `router loads ok` (no throw).

Then start the server locally and curl competitions:
Run: `cd backend && (node server.js &) ; sleep 2 ; curl -s localhost:3001/api/fixtures/competitions ; kill %1 2>/dev/null`
Expected: JSON array of 7 competitions with `fixture_count:0`, PL `is_default:1`. (If auth blocks it, that's fine — confirm via the no-throw load check; full verification happens after deploy in Task 16.)

- [ ] **Step 4: Commit**

```bash
git add backend/routes/fixtures.js backend/server.js
git commit -m "feat(fixtures): REST router (competitions, list+filters, meta, sync, edit, teams)"
```

---

## Task 6: Weekly cron `[MODEL: Haiku]`

**Files:**
- Modify: `backend/server.js` (add a `cron.schedule` near the other jobs, ~line 465+).

- [ ] **Step 1: Add the weekly full sync.** Place alongside the other `cron.schedule(...)` blocks:

```js
// Weekly fixtures sync — Mondays 06:30 UTC (all 7 competitions). Reschedules get ≥5wk notice,
// so weekly is enough to never miss a move with time to act.
cron.schedule('30 6 * * 1', async () => {
  try {
    const { syncFixtures } = require('./services/fixtures-sync');
    const r = await syncFixtures();
    console.log('[cron] fixtures weekly sync:', JSON.stringify(r.totals || r));
  } catch (e) {
    console.error('[cron] fixtures weekly sync failed:', e.message);
  }
});
```

- [ ] **Step 2: Verify the server still boots** (syntax check):

Run: `cd backend && node -e "require('./server.js')" & sleep 2; curl -s localhost:3001/api/health; kill %1 2>/dev/null`
Expected: `{"status":"ok",...}`.

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(fixtures): weekly cron sync (Mon 06:30 UTC)"
```

---

## Task 7: Calendar-link builder (pure, frontend) `[MODEL: Haiku]`

**Files:**
- Create: `frontend/src/components/fixtures/calendarLinks.js`

- [ ] **Step 1: Implement pure builders:**

```js
// Pure helpers — no React. Build a Google Calendar "add event" URL and an .ics blob URL.

function fmtUtc(iso) {
  // 2026-08-21T19:00:00Z -> 20260821T190000Z
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl({ title, startUtc, endUtc, details = '', location = '' }) {
  const end = endUtc || new Date(new Date(startUtc).getTime() + 2 * 3600 * 1000).toISOString();
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmtUtc(startUtc)}/${fmtUtc(end)}`,
    details, location,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

export function icsBlobUrl({ title, startUtc, endUtc, details = '', location = '' }) {
  const end = endUtc || new Date(new Date(startUtc).getTime() + 2 * 3600 * 1000).toISOString();
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT',
    `DTSTART:${fmtUtc(startUtc)}`, `DTEND:${fmtUtc(end)}`,
    `SUMMARY:${title}`, `DESCRIPTION:${details}`, `LOCATION:${location}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  return URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
}
```

- [ ] **Step 2: Sanity check in node** (Blob/URL exist in browser; just verify the gcal URL builder logically):

Run: `node -e "global.URLSearchParams=require('url').URLSearchParams; const f=(iso)=>new Date(iso).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''); console.log(f('2026-08-21T19:00:00Z'))"`
Expected: `20260821T190000Z`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/fixtures/calendarLinks.js
git commit -m "feat(fixtures): Google Calendar + .ics link builders"
```

---

## Task 8: Route, sidebar, page shell `[MODEL: Sonnet]`

**Files:**
- Modify: `frontend/src/App.jsx` (route + sidebar nav)
- Create: `frontend/src/pages/SeasonFixtures.jsx`
- Create: `frontend/src/styles/fixtures.css`

- [ ] **Step 1: Add the route** in the `<Routes>` block (protected area), matching the existing pattern:

```jsx
<Route path="/fixtures" element={<SeasonFixtures />} />
```
And the import at the top with the other page imports:
```jsx
import SeasonFixtures from './pages/SeasonFixtures';
```

- [ ] **Step 2: Add the sidebar nav item.** In the sidebar, add a new section + item (follow the existing `NavLink` pattern exactly):

```jsx
<div className="sidebar-section-label">Season</div>
<NavLink to="/fixtures" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
  לוח עונה
</NavLink>
```

- [ ] **Step 3: Create the page shell** `frontend/src/pages/SeasonFixtures.jsx`. This shell owns: active competition, filters, view mode, data fetch. Child components are built in later tasks; for now stub them inline so the page renders.

```jsx
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import './../styles/fixtures.css';
// Later tasks add these imports:
// import LeagueTabs from '../components/fixtures/LeagueTabs';
// import FixtureFilters from '../components/fixtures/FixtureFilters';
// import FixtureCard from '../components/fixtures/FixtureCard';

export default function SeasonFixtures() {
  const [params, setParams] = useSearchParams();
  const competition = params.get('competition') || 'PL';
  const [competitions, setCompetitions] = useState([]);
  const [meta, setMeta] = useState({ teams: [], months: [], matchdays: [], last_synced_at: null });
  const [fixtures, setFixtures] = useState([]);
  const [view, setView] = useState('calendar');   // 'calendar' | 'matchweek'
  const [filters, setFilters] = useState({ team: '', month: '', homeAway: 'all', tracked: false });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);

  const loadMeta = useCallback(() => {
    Promise.all([
      fetch('/api/fixtures/competitions', { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/fixtures/meta?competition=${competition}`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([comps, m]) => { setCompetitions(comps); setMeta(m); }).catch(e => setError(e.message));
  }, [competition]);

  const loadFixtures = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ competition });
    if (filters.team) q.set('team', filters.team);
    if (filters.month) q.set('month', filters.month);
    if (filters.team && filters.homeAway !== 'all') q.set('homeAway', filters.homeAway);
    if (filters.tracked) q.set('tracked', '1');
    fetch(`/api/fixtures?${q.toString()}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => setFixtures(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [competition, filters]);

  useEffect(loadMeta, [loadMeta]);
  useEffect(loadFixtures, [loadFixtures]);

  function setCompetition(code) { setParams(p => { p.set('competition', code); return p; }); setFilters({ team: '', month: '', homeAway: 'all', tracked: false }); }

  async function syncNow() {
    setSyncing(true);
    try {
      await fetch('/api/fixtures/sync', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ competition_code: competition }) });
      loadMeta(); loadFixtures();
    } catch (e) { setError(e.message); } finally { setSyncing(false); }
  }

  const activeComp = competitions.find(c => c.competition_code === competition);

  return (
    <div className="page fixtures-page">
      <div className="page-header">
        <div>
          <h1>לוח עונה</h1>
          <p className="subtitle">{activeComp ? activeComp.name : 'Premier League 2026/27'}</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" disabled={syncing} onClick={syncNow}>{syncing ? 'מסנכרן…' : 'סנכרן עכשיו'}</button>
          {meta.last_synced_at && <span className="muted">עודכן: {meta.last_synced_at}</span>}
        </div>
      </div>

      {/* Task 9 */} {/* <LeagueTabs competitions={competitions} active={competition} onSelect={setCompetition} /> */}
      {/* Task 10 */} {/* <FixtureFilters meta={meta} filters={filters} onChange={setFilters} view={view} onView={setView} /> */}

      {error && <div className="error-box">{error}</div>}
      {loading ? <div className="loading">טוען…</div> :
        fixtures.length === 0 ? <div className="empty">אין משחקים שמתאימים לסננים</div> :
        <div className="fixtures-list">
          {fixtures.map(f => (
            <div key={f.id} className="card" style={{ padding: 12, marginBottom: 8 }}>
              <strong>{f.kickoff_local || '—'}</strong> · {f.home_team} vs {f.away_team}
              {f.is_tracked ? ' ⭐' : ''}{f.last_changed_at ? ' ⚠️' : ''}
            </div>
          ))}
        </div>}
    </div>
  );
}
```

- [ ] **Step 4: Create `frontend/src/styles/fixtures.css`** with a minimal starting block (expanded in Task 15):

```css
.fixtures-page .header-actions { display: flex; align-items: center; gap: 12px; }
.fixtures-page .muted { color: var(--text-muted); font-size: 13px; }
.fixtures-page .empty { padding: 40px; text-align: center; color: var(--text-muted); }
```

- [ ] **Step 5: Verify the page builds & renders** via preview (see Verification Protocol at the bottom). Navigate to `/fixtures`. Expected: header "לוח עונה", "סנכרן עכשיו" button, and either the empty state or a flat list (data appears only after a real sync — fine).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.jsx frontend/src/pages/SeasonFixtures.jsx frontend/src/styles/fixtures.css
git commit -m "feat(fixtures): route, sidebar item, page shell with data fetch"
```

---

## Task 9: League tabs component `[MODEL: Sonnet]` (consult `frontend-design`)

**Files:**
- Create: `frontend/src/components/fixtures/LeagueTabs.jsx`
- Modify: `frontend/src/pages/SeasonFixtures.jsx` (wire it in — uncomment import + usage)

- [ ] **Step 1: Implement the tab bar.** PL first + emphasized; optional small flag (decorative, drop if it clutters). Counts come from `competitions[].fixture_count`.

```jsx
const FLAG = { PL:'🏴', PD:'🇪🇸', SA:'🇮🇹', CL:'🇪🇺', DED:'🇳🇱', BL1:'🇩🇪', FL1:'🇫🇷' };

export default function LeagueTabs({ competitions, active, onSelect }) {
  return (
    <div className="league-tabs" role="tablist">
      {competitions.map(c => (
        <button
          key={c.competition_code}
          role="tab"
          aria-selected={c.competition_code === active}
          className={`league-tab ${c.competition_code === active ? 'active' : ''} ${c.is_default ? 'primary' : ''}`}
          onClick={() => onSelect(c.competition_code)}
        >
          <span className="flag" aria-hidden>{FLAG[c.competition_code] || ''}</span>
          <span className="label">{c.hebrew_label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the page** — uncomment the import and replace the Task 9 placeholder with:
```jsx
<LeagueTabs competitions={competitions} active={competition} onSelect={setCompetition} />
```

- [ ] **Step 3: Verify** via preview: 7 tabs render, אנגלית first + visually emphasized, clicking a tab changes the URL `?competition=` and reloads. (Counts may be 0 pre-sync.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/fixtures/LeagueTabs.jsx frontend/src/pages/SeasonFixtures.jsx
git commit -m "feat(fixtures): league tabs (PL default + emphasized)"
```

---

## Task 10: Filter bar `[MODEL: Sonnet]` (consult `frontend-design`)

**Files:**
- Create: `frontend/src/components/fixtures/FixtureFilters.jsx`
- Modify: `frontend/src/pages/SeasonFixtures.jsx` (wire in)

- [ ] **Step 1: Implement the combinable filters** (team dropdown with crest + count, month dropdown, home/away segmented control enabled only with a team, tracked toggle, view switch, clear):

```jsx
export default function FixtureFilters({ meta, filters, onChange, view, onView }) {
  const set = (patch) => onChange({ ...filters, ...patch });
  const teamSelected = !!filters.team;
  const active = filters.team || filters.month || filters.tracked || filters.homeAway !== 'all';
  return (
    <div className="fixture-filters">
      <select value={filters.team} onChange={e => set({ team: e.target.value, homeAway: 'all' })}>
        <option value="">כל הקבוצות</option>
        {meta.teams.map(t => (
          <option key={t.api_team_id} value={t.api_team_id}>{(t.is_tracked ? '★ ' : '') + t.name + ` (${t.cnt})`}</option>
        ))}
      </select>

      <select value={filters.month} onChange={e => set({ month: e.target.value })}>
        <option value="">כל העונה</option>
        {meta.months.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      <div className={`seg ${teamSelected ? '' : 'disabled'}`} title={teamSelected ? '' : 'בחר קבוצה'}>
        {['all', 'home', 'away'].map(v => (
          <button key={v} disabled={!teamSelected} className={filters.homeAway === v ? 'on' : ''} onClick={() => set({ homeAway: v })}>
            {v === 'all' ? 'הכל' : v === 'home' ? 'בית' : 'חוץ'}
          </button>
        ))}
      </div>

      <label className="track-toggle"><input type="checkbox" checked={filters.tracked} onChange={e => set({ tracked: e.target.checked })} /> רק הקבוצות שלי</label>

      <div className="seg view-switch">
        <button className={view === 'calendar' ? 'on' : ''} onClick={() => onView('calendar')}>לוח חודשי</button>
        <button className={view === 'matchweek' ? 'on' : ''} onClick={() => onView('matchweek')}>רשימת מחזור</button>
      </div>

      {active && <button className="btn btn-ghost btn-sm" onClick={() => onChange({ team: '', month: '', homeAway: 'all', tracked: false })}>נקה סננים</button>}
    </div>
  );
}
```

- [ ] **Step 2: Wire into the page** (uncomment import + replace the Task 10 placeholder):
```jsx
<FixtureFilters meta={meta} filters={filters} onChange={setFilters} view={view} onView={setView} />
```

- [ ] **Step 3: Verify** via preview: selecting a team enables home/away; "רק הקבוצות שלי" toggles; "נקה סננים" appears when a filter is active and resets. (Cross-check the combined filter once data exists in Task 16.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/fixtures/FixtureFilters.jsx frontend/src/pages/SeasonFixtures.jsx
git commit -m "feat(fixtures): combinable filter bar (team/month/home-away/tracked/view)"
```

---

## Task 11: Fixture card `[MODEL: Sonnet]` (consult `frontend-design` — this is the visual centerpiece)

**Files:**
- Create: `frontend/src/components/fixtures/FixtureCard.jsx`

Match the spec's §8.5 reference (FTN-style row): date/time · home crest VS away crest · names · competition+matchday · stadium + flag · ticket strip · 📅 / ✎ actions. Crests ~24–28px with `tla` fallback. Home/away tag for tracked teams; ⚠️ when `last_changed_at`. Ticket strip colored by `tickets_status`.

- [ ] **Step 1: Implement the card:**

```jsx
import { googleCalendarUrl, icsBlobUrl } from './calendarLinks';

const TICKET_LABEL = { unknown: 'לא ידוע', not_yet: 'טרם', on_sale: 'במכירה', bought: 'נקנה', closed: 'נסגר' };
const TICKET_BADGE = { unknown: 'badge-gray', not_yet: 'badge-amber', on_sale: 'badge-green', bought: 'badge-blue', closed: 'badge-gray' };

function Crest({ url, tla }) {
  return url
    ? <img className="crest" src={url} alt={tla || ''} width="26" height="26" onError={e => { e.target.style.display = 'none'; }} />
    : <span className="crest crest-fallback">{tla || '?'}</span>;
}

export default function FixtureCard({ fx, trackedTeamIds, onEdit }) {
  const homeTracked = trackedTeamIds.has(fx.home_team_id);
  const awayTracked = trackedTeamIds.has(fx.away_team_id);
  const matchTitle = `${fx.home_team} vs ${fx.away_team}`;

  const cal = (kind) => {
    const isTickets = kind === 'tickets';
    const start = isTickets ? fx.tickets_onsale_at : fx.kickoff_utc;
    if (!start) return;
    const title = isTickets ? `🎟️ כרטיסים: ${matchTitle}` : matchTitle;
    window.open(googleCalendarUrl({ title, startUtc: start, details: fx.tickets_info || '', location: '' }), '_blank');
  };

  return (
    <div className={`fixture-card ${fx.is_tracked ? 'tracked' : 'dim'} ${homeTracked && fx.home_primary ? 'primary' : ''}`}>
      <div className="fc-when"><div className="fc-date">{(fx.kickoff_local || '—').split(',').slice(0, 2).join(',')}</div></div>

      <div className="fc-teams">
        <span className="fc-side"><Crest url={fx.home_crest} tla={fx.home_tla} /> <span className={homeTracked ? 'team on' : 'team'}>{fx.home_team}</span></span>
        <span className="fc-vs">VS</span>
        <span className="fc-side"><span className={awayTracked ? 'team on' : 'team'}>{fx.away_team}</span> <Crest url={fx.away_crest} tla={fx.away_tla} /></span>
        {(homeTracked || awayTracked) && <span className={`badge ${homeTracked ? 'badge-green' : 'badge-gray'}`}>{homeTracked ? '🔴 בית' : '⚪ חוץ'}</span>}
        {fx.last_changed_at && <span className="fc-changed" title={`זז מ-${fx.previous_kickoff_local} ל-${fx.kickoff_local}`}>⚠️</span>}
      </div>

      <div className="fc-meta">{fx.competition_code}{fx.matchday ? ` · מחזור ${fx.matchday}` : ''}{fx.stage ? ` · ${fx.stage}` : ''}</div>

      <div className="fc-tickets">
        <span className={`badge ${TICKET_BADGE[fx.tickets_status] || 'badge-gray'}`}>🎟️ {TICKET_LABEL[fx.tickets_status] || '—'}</span>
        {fx.tickets_onsale_local && <span className="muted"> · {fx.tickets_onsale_local}</span>}
        <span className="fc-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => cal('match')}>📅 משחק</button>
          {fx.tickets_onsale_at && <button className="btn btn-ghost btn-sm" onClick={() => cal('tickets')}>🎟️ תזכורת</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => onEdit(fx)}>✎ ערוך</button>
        </span>
      </div>
    </div>
  );
}
```

> `fx.home_primary` isn't returned by the API yet — derive `primary` highlight in the parent from the team meta (a team with `is_primary`). Simplest: pass `primaryTeamId` and compare. Adjust the className accordingly when wiring in Task 12. Do not leave an undefined reference — compute it where the card is used.

- [ ] **Step 2: Commit** (rendered/verified in Task 12 where it's wired into the views)

```bash
git add frontend/src/components/fixtures/FixtureCard.jsx
git commit -m "feat(fixtures): fixture card (crests, home/away, change flag, ticket strip, calendar/edit)"
```

---

## Task 12: Monthly calendar + matchweek views `[MODEL: Sonnet]` (consult `frontend-design`)

**Files:**
- Modify: `frontend/src/pages/SeasonFixtures.jsx` (replace the flat list with grouped views + wire FixtureCard + edit modal hook)

- [ ] **Step 1: Add grouping + render both views.** Replace the flat-list block in the page with:

```jsx
// derived sets/maps
const trackedTeamIds = new Set(meta.teams.filter(t => t.is_tracked).map(t => t.api_team_id));
const primaryTeamId = (meta.teams.find(t => t.is_primary) || {}).api_team_id;

function groupByDate(list) {
  const m = new Map();
  for (const f of list) { const k = (f.kickoff_local || '—').split(',').slice(1, 2).join('').trim() || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
  return [...m.entries()];
}
function groupByMatchday(list) {
  const m = new Map();
  for (const f of list) { const k = f.matchday ?? '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(f); }
  return [...m.entries()].sort((a, b) => (a[0] === '—' ? 1 : b[0] === '—' ? -1 : a[0] - b[0]));
}

const groups = view === 'calendar' ? groupByDate(fixtures) : groupByMatchday(fixtures);
```

And the render:

```jsx
{loading ? <div className="loading">טוען…</div> :
 fixtures.length === 0 ? <div className="empty">אין משחקים שמתאימים לסננים<br/><button className="btn btn-ghost btn-sm" onClick={() => setFilters({ team:'', month:'', homeAway:'all', tracked:false })}>נקה סננים</button></div> :
 <div className={`fixtures-${view}`}>
   {groups.map(([key, items]) => (
     <section key={key} className="fx-group">
       <h3 className="fx-group-title">{view === 'matchweek' ? `מחזור ${key}` : key}</h3>
       {items.map(f => (
         <FixtureCard key={f.id} fx={{ ...f, home_primary: f.home_team_id === primaryTeamId }} trackedTeamIds={trackedTeamIds} onEdit={setEditing} />
       ))}
     </section>
   ))}
 </div>}

{editing && <FixtureEditModal fixture={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); loadFixtures(); }} />}
```

Add the imports + `const [editing, setEditing] = useState(null);` to the page. (FixtureEditModal comes from Task 13 — import it now; it's created next.)

- [ ] **Step 2: Verify** via preview (after a real sync exists, or temporarily insert a couple of test fixtures via node). Expected: calendar view groups cards by date; toggling to "רשימת מחזור" regroups by matchday; tracked teams emphasized; non-tracked dimmed.

> To preview before a real API key exists, insert two sample fixtures:
> `cd backend && node -e "const db=require('./database'); const s=db.prepare('SELECT id FROM seasons WHERE competition_code=?').get('PL').id; db.prepare('INSERT OR IGNORE INTO fixtures (external_id,season_id,competition_code,matchday,home_team_id,away_team_id,home_team,away_team,kickoff_utc,status,is_tracked) VALUES (9001,?,?,1,57,354,?,?,?,?,1),(9002,?,?,1,61,63,?,?,?,?,1)').run(s,'PL','Arsenal','Crystal Palace','2026-08-21T19:00:00Z','TIMED',s,'PL','Chelsea','Fulham','2026-08-22T14:00:00Z','TIMED'); console.log('inserted sample fixtures');"`
> Remove them after: `node -e "require('./backend/database').prepare('DELETE FROM fixtures WHERE external_id IN (9001,9002)').run()"`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SeasonFixtures.jsx
git commit -m "feat(fixtures): monthly calendar + matchweek grouped views"
```

---

## Task 13: Manual edit modal `[MODEL: Sonnet]`

**Files:**
- Create: `frontend/src/components/fixtures/FixtureEditModal.jsx`

- [ ] **Step 1: Implement the modal** (reuse the project's modal styling conventions). Edits kickoff (UK local → stored), ticket status/onsale/info. Saves via `PUT /api/fixtures/:id`.

```jsx
import { useState } from 'react';

const STATUSES = [['unknown','לא ידוע'],['not_yet','טרם'],['on_sale','במכירה'],['bought','נקנה'],['closed','נסגר']];

// datetime-local <-> ISO helpers (treat input as UK local wall-clock; store ISO UTC).
function isoToLocalInput(iso) { if (!iso) return ''; const d = new Date(iso); const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
function localInputToIso(v) { return v ? new Date(v).toISOString() : null; }

export default function FixtureEditModal({ fixture, onClose, onSaved }) {
  const [kickoff, setKickoff] = useState(isoToLocalInput(fixture.kickoff_utc));
  const [onsale, setOnsale] = useState(isoToLocalInput(fixture.tickets_onsale_at));
  const [status, setStatus] = useState(fixture.tickets_status || 'unknown');
  const [info, setInfo] = useState(fixture.tickets_info || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function save() {
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/fixtures/${fixture.id}`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kickoff_utc: localInputToIso(kickoff), tickets_onsale_at: localInputToIso(onsale), tickets_status: status, tickets_info: info }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      onSaved(data);
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <h3>עריכת משחק — {fixture.home_team} vs {fixture.away_team}</h3>
        <label>שעת משחק (שעון בריטניה)<input type="datetime-local" value={kickoff} onChange={e => setKickoff(e.target.value)} /></label>
        <label>סטטוס כרטיסים<select value={status} onChange={e => setStatus(e.target.value)}>{STATUSES.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label>תאריך יציאה למכירה<input type="datetime-local" value={onsale} onChange={e => setOnsale(e.target.value)} /></label>
        <label>הערות<textarea value={info} onChange={e => setInfo(e.target.value)} rows={3} /></label>
        {err && <div className="error-box">{err}</div>}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>ביטול</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'שומר…' : 'שמור'}</button>
        </div>
      </div>
    </div>
  );
}
```

> If `.modal-overlay/.modal-box/.modal-footer` classes don't already exist globally, add minimal styles for them in `fixtures.css` (Task 15). The existing Orders page uses an inline ModalShell — you may reuse that pattern instead; either is acceptable as long as it matches the app's look.

- [ ] **Step 2: Verify** via preview: click ✎ on a card → modal opens → change status → save → card reflects the new status and shows it survived (re-sync won't overwrite, because PUT set `manually_overridden=1`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/fixtures/FixtureEditModal.jsx frontend/src/styles/fixtures.css
git commit -m "feat(fixtures): manual edit modal (kickoff + ticket fields)"
```

---

## Task 14: Polish styling to the §8.5/§9 bar `[MODEL: Sonnet]` (consult `frontend-design`)

**Files:**
- Modify: `frontend/src/styles/fixtures.css`

- [ ] **Step 1: Flesh out the styles.** Use only CSS variables. Cover: league tabs (PL `.primary` emphasized; `.active` accent), filter bar layout (wraps on mobile), fixture card row (date column, big crests ~26px, `VS`, badges), `.dim` for non-tracked (reduced opacity), `.primary` left accent border in `--green`, ticket strip, change ⚠️ color `--amber`/`--red`, group titles, modal styles if needed, responsive single-column under ~640px, RTL-correct alignment. Build to the visual reference in spec §8.5 and the quality bar in §9.

(Implementer writes the CSS using the existing variables; no fixed snippet mandated here — match the dashboard's aesthetic. Keep crest fallback chip legible.)

- [ ] **Step 2: Verify** via preview at desktop and mobile widths (use `preview_resize`): tracked teams pop, non-tracked recede, crests crisp, tabs read clearly with PL emphasized, layout holds at 375px width, Hebrew RTL correct.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/fixtures.css
git commit -m "style(fixtures): polish board to design bar (tabs, cards, responsive, RTL)"
```

---

## Task 15: API key, initial sync, end-to-end verification `[MODEL: Opus]`

**Files:** none (ops + verification). This is the cross-cutting QA pass.

- [ ] **Step 1: Set the API key** as a Fly secret (Omri provides it):

```bash
flyctl secrets set FOOTBALL_DATA_API_KEY=<key> --app game-dashboard-omri
```

- [ ] **Step 2: Build + deploy:**

```bash
cd frontend && npm run build && cd .. && flyctl deploy --app game-dashboard-omri
```

- [ ] **Step 3: Trigger the first sync** (all competitions) and check the summary:

```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"require('/app/backend/services/fixtures-sync').syncFixtures().then(r=>console.log(JSON.stringify(r.totals)))\""
```
Expected: non-zero `inserted` (≈380 for PL alone; more across 7 comps). Check the per-competition log for any errors (CL season shape, etc.).

- [ ] **Step 4: Verify tracked-team ids resolved.** Confirm each seeded tracked id appears in `teams` with a crest:
```bash
flyctl ssh console --app game-dashboard-omri --command "node -e \"const db=require('/app/backend/database'); db.prepare('SELECT api_team_id,name,is_tracked,crest_url IS NOT NULL has_crest FROM teams WHERE is_tracked=1 ORDER BY name').all().forEach(t=>console.log(t.api_team_id,t.name,t.has_crest))\""
```
Expected: all 10 tracked teams have `has_crest=1`. If any tracked id never matched (no crest, name still the stub), correct its `api_team_id` in the Task 1 seed and re-sync.

- [ ] **Step 5: Verify the page end-to-end** against the live app (or preview pointed at prod data). Walk the acceptance criteria from spec §13:
  - 7 tabs; PL default + emphasized; switching reloads.
  - Calendar default; matchweek toggle works.
  - **Combined filter**: Arsenal + a December month + Home → only Arsenal home games that month.
  - Tracked/Arsenal emphasized; home/away tags; crests prominent.
  - Reschedule ⚠️: simulate by editing a fixture's `kickoff_utc` in DB to an old value, then re-sync the real value → ⚠️ with from→to tooltip appears.
  - Manual edit persists across a re-sync (`manually_overridden`).
  - "Add to calendar" opens a Google Calendar event for both match and ticket reminders.
  - Responsive + RTL correct.

- [ ] **Step 6: Update project docs.** Add a short "Season Fixtures" section to `game-dashboard/CLAUDE.md` (tables, endpoints, weekly cron, the `FOOTBALL_DATA_API_KEY` secret, how to run a manual sync). Commit.

```bash
git add CLAUDE.md && git commit -m "docs: document Season Fixtures module"
```

- [ ] **Step 7: Final commit / confirm clean tree.**

```bash
git status   # expect clean
```

---

## Verification Protocol (frontend tasks)

For any task that changes the page/components, verify in the browser preview rather than asking the user:
1. Ensure a dev server is running (`preview_start` if needed; the Vite dev server proxies `/api` to the backend — if it doesn't, run the backend too, or verify against deployed data in Task 15).
2. Navigate to `/fixtures`, reload if no HMR.
3. `preview_console_logs` for errors; `preview_snapshot` for structure; `preview_resize` for mobile/RTL.
4. Fix → re-check. Share a `preview_screenshot` of the working board at the end of Task 14.

---

## Self-Review (done by plan author)

- **Spec coverage:** tabs (T9), monthly+matchweek (T12), filters incl. home/away combined (T10/T5), crests (T11), reschedule detection (T2/T4/T11), ticket fields + manual edit (T1/T5/T13), calendar add (T7/T11), weekly sync + manual (T4/T5/T6), 7 competitions (T1/T4), UI/UX bar (T9–T14 with frontend-design), API key + deploy (T15). All spec §§ map to a task.
- **Placeholder scan:** no TBD/TODO; every code step has concrete code. The one open derivation (`home_primary`) is explicitly resolved where the card is used (T12).
- **Type consistency:** field names (`external_id`, `kickoff_utc`, `is_tracked`, `tickets_status`, `manually_overridden`, `kickoff_local`, `home_crest/away_crest/home_tla/away_tla`) are consistent across DB (T1), sync (T4), router (T5), and UI (T8–T13). `homeAwayClause`, `toUkLocalString`, `kickoffChanged`, `syncFixtures({competition_code})` signatures match their callers.

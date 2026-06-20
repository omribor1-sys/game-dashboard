# Season Fixtures Board — Design Spec (Phase 1)

**Date:** 2026-06-20
**Project:** game-dashboard (https://game-dashboard-omri.fly.dev)
**Status:** Approved for implementation
**Author:** Claude (Opus) — brainstormed with Omri
**Implementation note:** This spec is written to be executed by a follow-up implementation
plan. During implementation, the `frontend-design` skill MUST be consulted for the UI work so
the page meets a high visual/UX bar. Backend follows the existing project conventions exactly.

---

## 1. Goal

Give Omri a single, highly visual board to plan the football season ahead for his ticket-resale
business. He must be able to, at a glance:

- See every fixture of the 2026/27 Premier League season (21 Aug 2026 → 30 May 2027).
- Instantly spot the teams he works with (Arsenal primary; Chelsea, Newcastle, Liverpool, Man
  City, Man United, Fulham, Brentford, Crystal Palace, Everton, and more he can add).
- Distinguish **home vs away** for his teams (he mostly buys tickets for home games).
- Filter by **team**, by **month**, and by **home/away** — combinable (e.g. "Arsenal home games
  in December").
- Know when a fixture's **date/time changes** (reschedules are the highest-value signal for a
  reseller — a Sat 15:00 → Sun 14:00 move materially changes ticket logistics).
- Track, per fixture, **ticket-purchase info**: when tickets go on sale, a status, and notes.
- Add a fixture to their **calendar** — either a match reminder or a ticket-purchase reminder.

The data must be **reliable and refreshed at least weekly**, with a **manual sync** button and
**manual edit** of any fixture for corrections.

This is the foundation of a larger system that will later add change alerts, inventory linking,
an automatic ticket-onsale scanner, and more leagues. Those are explicitly **out of scope here**
(see §11), but the data model is built so they slot in without a rewrite.

---

## 2. Scope

### In scope (Phase 1)
- New backend: `seasons`, `teams`, `fixtures` tables; a sync service against football-data.org;
  REST endpoints; a weekly cron + manual sync.
- Minimal change detection: store the previous kickoff and flag a fixture that moved.
- Per-fixture ticket-purchase fields (manual entry now; auto-scanner later).
- New frontend page `/fixtures`: monthly calendar (default) + matchweek list toggle, combinable
  filters, team crests, change indicators, ticket info, manual edit, calendar-add.

### Explicitly OUT of scope (later phases — see §11)
- Linking fixtures to existing `games`/`inventory`/`orders` (Phase 3).
- Change alerts to WhatsApp/Telegram (Phase 2).
- Automatic ticket-onsale scanner (Phase 3).
- Additional leagues / competitions and a full auto-scraper (Phase 4).

---

## 3. Data source

**Provider:** football-data.org (free tier).
**Why:** free tier covers the current season, returns a **stable integer match `id`** (essential
for detecting reschedules without creating duplicates), includes `utcDate`, `matchday`,
home/away teams **with crest URLs**, and `lastUpdated`. Extends to 12 competitions under the same
API for Phase 4.

**Auth:** free registration → one API key → header `X-Auth-Token: <key>`.
Store the key as a Fly secret: `FOOTBALL_DATA_API_KEY`. The backend reads it from
`process.env.FOOTBALL_DATA_API_KEY`. If the env var is missing, the sync service logs a clear
warning and no-ops (it must never crash the app).

**Rate limit:** 10 requests/min on the free tier. Our sync is one request per competition, so we
are far under the limit.

**Primary endpoint (all PL 2026/27 fixtures):**
```
GET https://api.football-data.org/v4/competitions/PL/matches?season=2026
Header: X-Auth-Token: <key>
```
(`season=2026` means the 2026/27 season — football-data keys seasons by start year.)

**Fixture JSON shape (per element of `matches[]`):**
```json
{
  "id": 537271,
  "utcDate": "2026-08-21T19:00:00Z",
  "status": "TIMED",
  "matchday": 1,
  "homeTeam": { "id": 57, "name": "Arsenal FC", "shortName": "Arsenal", "tla": "ARS", "crest": "https://crests.football-data.org/57.png" },
  "awayTeam": { "id": 64, "name": "Liverpool FC", "shortName": "Liverpool", "tla": "LIV", "crest": "https://crests.football-data.org/64.png" },
  "lastUpdated": "2026-06-18T08:20:24Z"
}
```
`status` values we care about: `SCHEDULED`, `TIMED`, `POSTPONED`, `FINISHED`.

---

## 4. Data model

Three new tables, added to `backend/database.js` in the same `db.exec(...)` block and with the
same `try { ALTER TABLE ... } catch(_) {}` migration style used elsewhere. All use `node:sqlite`.

### 4.1 `seasons`
```sql
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                 -- "Premier League 2026/27"
  competition_code TEXT NOT NULL,     -- "PL"
  source_season TEXT NOT NULL,        -- "2026"  (football-data season key)
  start_date TEXT,                    -- "2026-08-21"
  end_date TEXT,                      -- "2027-05-30"
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
Seed one row on first deploy: Premier League 2026/27, `PL`, `2026`.

### 4.2 `teams`
Holds ALL teams seen in the season (so opponents get crests too), with tracking flags.
```sql
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_team_id INTEGER UNIQUE,         -- football-data team id (stable), e.g. 57
  name TEXT NOT NULL,                 -- canonical short name we display, e.g. "Arsenal"
  full_name TEXT,                     -- "Arsenal FC"
  tla TEXT,                           -- "ARS"
  crest_url TEXT,                     -- https://crests.football-data.org/57.png
  is_tracked INTEGER DEFAULT 0,       -- 1 = a team Omri works with
  is_primary INTEGER DEFAULT 0,       -- 1 = Arsenal (extra emphasis)
  active INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```
**Canonical name mapping:** football-data's `shortName` ("Arsenal", "Liverpool") is what we
display. Map by `api_team_id` (stable) so a name change at the source never breaks tracking. Seed
the tracked set (see §10) by `api_team_id` with `is_tracked=1`; Arsenal also `is_primary=1`.

### 4.3 `fixtures`
```sql
CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id INTEGER UNIQUE NOT NULL,    -- football-data match id (THE key for de-dup + change detection)
  season_id INTEGER REFERENCES seasons(id),
  competition_code TEXT DEFAULT 'PL',
  matchday INTEGER,                        -- 1..38
  home_team_id INTEGER,                    -- api_team_id
  away_team_id INTEGER,                    -- api_team_id
  home_team TEXT,                          -- canonical name snapshot
  away_team TEXT,
  kickoff_utc TEXT,                        -- ISO 8601 UTC, e.g. "2026-08-21T19:00:00Z"
  status TEXT,                             -- SCHEDULED | TIMED | POSTPONED | FINISHED
  is_tracked INTEGER DEFAULT 0,            -- derived: 1 if home or away team is_tracked

  -- change detection (minimal, Phase 1)
  previous_kickoff_utc TEXT,               -- set when kickoff_utc changes
  last_changed_at DATETIME,                -- when we last detected a change

  -- ticket-purchase info (manual now, auto-scanner later)
  tickets_onsale_at TEXT,                  -- ISO datetime when tickets go on sale (nullable)
  tickets_status TEXT DEFAULT 'unknown',   -- unknown | not_yet | on_sale | bought | closed
  tickets_info TEXT,                       -- free text: source, price, notes
  tickets_source TEXT,                     -- 'manual' | 'scanner' (Phase 3)

  manually_overridden INTEGER DEFAULT 0,   -- 1 = user edited; sync must NOT overwrite protected fields
  last_synced_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fixtures_season ON fixtures(season_id);
CREATE INDEX IF NOT EXISTS idx_fixtures_kickoff ON fixtures(kickoff_utc);
```

**`tickets_status` enum** (English keys stored; Hebrew labels rendered in UI):
`unknown` (לא ידוע), `not_yet` (טרם), `on_sale` (במכירה), `bought` (נקנה), `closed` (נסגר).

---

## 5. Backend — sync service

New file: `backend/services/fixtures-sync.js`. Exports `syncFixtures(options)`.

### Algorithm
1. If `!process.env.FOOTBALL_DATA_API_KEY` → log warning, return `{ skipped: true, reason: 'no api key' }`. Never throw.
2. Load the active season (`competition_code`, `source_season`).
3. `GET /v4/competitions/{code}/matches?season={source_season}` with the auth header.
4. **Upsert teams first**: for each unique team in the response, upsert into `teams` by
   `api_team_id` (insert if new with `is_tracked=0`; always refresh `crest_url`, `full_name`,
   `tla`, and `name` from `shortName`). Do NOT clobber `is_tracked`/`is_primary` on existing rows.
5. **Upsert fixtures** by `external_id`:
   - Compute `is_tracked` = (home or away `api_team_id` has `teams.is_tracked=1`).
   - **New fixture** → insert all fields; `tickets_status='unknown'`.
   - **Existing fixture**:
     - If `kickoff_utc` differs from stored AND the stored row is not protected on this field:
       set `previous_kickoff_utc = <old>`, update `kickoff_utc`, set `last_changed_at = now`.
     - Always refresh `status`, `matchday`, team snapshots, `last_synced_at`.
     - **Never** overwrite ticket fields (`tickets_*`) or kickoff if `manually_overridden=1`
       — those are user-owned until the scanner phase. (Sync still updates `status`/`matchday`.)
6. Return a summary: `{ teams_upserted, fixtures_inserted, fixtures_updated, fixtures_changed, changed: [ {external_id, home, away, from, to} ] }`. Log it.

### Timezone
The API gives UTC. **Display** uses UK local time (Europe/London — BST = UTC+1 Apr–Oct, GMT in
winter), consistent with the existing project rule that UK game times are shown in UK local time.
Store `kickoff_utc` as the source of truth; convert to Europe/London at render time (frontend) or
provide a derived `kickoff_local` in the API response (backend) — see §6. Do not store a second
copy that can drift.

---

## 6. Backend — REST endpoints

New file `backend/routes/fixtures.js`, mounted at `/api/fixtures` in the main server (follow how
existing routers are mounted). All endpoints session-protected like the rest of the app.

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /api/fixtures` | List fixtures with filters | Query params: `month=YYYY-MM`, `matchday`, `team=<api_team_id>`, `homeAway=home|away|all`, `tracked=1`, `season_id`. Returns each fixture **plus** `kickoff_local` (Europe/London, formatted `"Sat, 21/08/2026, 20:00"` to match the project's datetime style) and the home/away `crest_url`, `tla` joined from `teams`. |
| `GET /api/fixtures/meta` | Filter metadata | Returns `{ teams: [...with crest + fixture counts], months: [...], matchdays: [...], last_synced_at }` for building filter controls. Counts power the "Arsenal (38)" labels. |
| `POST /api/fixtures/sync` | Manual "sync now" | Calls `syncFixtures()`, returns the summary. |
| `PUT /api/fixtures/:id` | Manual edit of one fixture | Editable: `kickoff_utc` (or local→UTC), `tickets_onsale_at`, `tickets_status`, `tickets_info`. Sets `manually_overridden=1`, `tickets_source='manual'`. Logs to `audit_log` (existing table) like other manual changes. |
| `GET /api/fixtures/teams` | List teams + flags | For a "manage tracked teams" UI. |
| `POST /api/fixtures/teams` | Update tracking flags | Body: `{ api_team_id, is_tracked, is_primary }`. After change, recompute `is_tracked` on affected fixtures. |

**`homeAway` semantics:** only meaningful together with `team`. `home` → fixtures where
`home_team_id = team`; `away` → where `away_team_id = team`. Without `team`, `homeAway` is ignored
(or, if `tracked=1`, interpret relative to tracked teams — keep it simple: ignore unless `team`
set). The combinable example "Arsenal + December + home" = `?team=57&month=2026-12&homeAway=home`.

---

## 7. Backend — scheduling

Add to the existing cron setup (where the daily jobs live):
- **Weekly full sync** — e.g. Monday 06:30 UTC: `syncFixtures()`. Weekly matches the league's
  ≥5-week reschedule-notice rule, so it will never miss a move with time to act.
- Manual sync is always available via `POST /api/fixtures/sync` (the "סנכרן עכשיו" button).

(Phase 2 may tighten to 2–3×/week over the rolling 8-week horizon; not now.)

---

## 8. Frontend — the Season Board

New page `frontend/src/pages/SeasonFixtures.jsx`, route `/fixtures`, sidebar item under a new
**"Season"** (or existing "Analytics") section. Wrap in `<div className="page">`. Reuse existing
CSS variables and classes (`.card`, `.btn`, `.badge*`, `ModalShell`) — **no hardcoded hex**.

### 8.1 Page header
- Title: **"לוח עונה"** + subtitle "Premier League 2026/27".
- Right side: **"סנכרן עכשיו"** button (`.btn .btn-primary`) + muted text "עודכן לאחרונה: …"
  (from `meta.last_synced_at`). While syncing → spinner + disabled.

### 8.2 Filter bar (combinable — all filters AND together)
A sticky row of controls beneath the header:
- **קבוצה** — dropdown listing all teams with **crest icon + name + count** ("Arsenal (38)").
  Tracked teams pinned to the top. "כל הקבוצות" default.
- **חודש** — month stepper / dropdown (Aug 2026 … May 2027) + "כל העונה".
- **בית/חוץ** — segmented control `הכל · בית · חוץ` (enabled only when a team is selected;
  show a subtle disabled state otherwise with a tooltip "בחר קבוצה").
- **רק הקבוצות שלי** — toggle; when on, dims/hides non-tracked fixtures.
- **תצוגה** — segmented control `לוח חודשי · רשימת מחזור` (view switch).
- A "נקה סננים" link when any filter is active.

Filters drive the `GET /api/fixtures` query. Keep current filter state in the URL query string so
a view is shareable/bookmarkable and survives refresh.

### 8.3 View A — Monthly calendar (default)
- Month navigation `← אוגוסט 2026 →` (respects the month filter).
- Days that have fixtures show **fixture cards** grouped under the date. (A true 7-column grid is
  nice-to-have; a clean **date-grouped list within the month** is acceptable and more readable on
  mobile — implementer's choice, but it must feel like "the month at a glance".)
- Non-tracked fixtures are visually subdued (lower contrast) so tracked ones pop.

### 8.4 View B — Matchweek list (toggle)
- Same fixture cards, grouped by **Matchweek** (MW1, MW2 …) with a small header per group
  ("מחזור 1 · 21–23/8"). Reuse the accordion pattern (`GameAccordion`) if collapsing is wanted.

### 8.5 Fixture card anatomy (shared by both views)
```
┌────────────────────────────────────────────────────────────┐
│ שבת 21/08 · 20:00      [🔴 בית]                    ⚠️       │
│ [crest] Arsenal   vs   Coventry City [crest]               │
│ Emirates Stadium · מחזור 1                                  │
│ 🎟️ כרטיסים: במכירה · 01/07 14:00     [📅 ▾]   [✎ ערוך]    │
└────────────────────────────────────────────────────────────┘
```
- **Crests** large and prominent ("מוקצנים" — Omri's request): ~36–44px, both teams.
- **Home/away tag** for tracked teams: 🔴 בית / ⚪ חוץ (use existing badge classes; home = green
  accent, away = gray). Primary team (Arsenal) gets a stronger highlight (e.g. a left accent
  border in `--green`).
- **Change indicator** ⚠️: shown when `last_changed_at` set; tooltip "זז מ-[previous] ל-[נוכחי]".
- **Ticket strip** 🎟️: shows `tickets_status` (Hebrew label) + `tickets_onsale_at` if present.
  Clicking opens the edit modal. Color the strip by status (on_sale=green, not_yet=amber,
  bought=blue, closed=gray, unknown=muted) using existing badge colors.
- **Calendar button** `📅` (see §8.7).
- **Edit button** `✎` → manual edit modal (§8.6).

### 8.6 Manual edit modal (reuse `ModalShell`)
Fields: kickoff date + time (UK local; converted to UTC on save), `tickets_status` (select),
`tickets_onsale_at` (datetime), `tickets_info` (textarea). Save → `PUT /api/fixtures/:id`. On save
the card refreshes and shows a subtle "נערך ידנית" marker (so it's clear sync won't overwrite it).

### 8.7 Calendar / reminder card (📅)
Each fixture offers a small menu with two actions:
- **📅 תזכורת משחק** — calendar event at kickoff (UK local), title "Arsenal vs Coventry City",
  location = stadium, default reminder e.g. 1 day before.
- **🎟️ תזכורת רכש כרטיסים** — calendar event at `tickets_onsale_at` (only enabled when that
  field is set), title "🎟️ כרטיסים: Arsenal vs Coventry City", with notes from `tickets_info`.

**Implementation (frontend-only, no backend dependency, reliable cross-device):** generate a
**Google Calendar template link**:
```
https://calendar.google.com/calendar/render?action=TEMPLATE
  &text=<encoded title>
  &dates=<startUTC>/<endUTC>     (e.g. 20260821T190000Z/20260821T210000Z)
  &details=<encoded notes>
  &location=<encoded location>
```
Also provide an **.ics download** as a fallback (same event data) for non-Google calendars.
(Optional future enhancement: wire to the connected Google Calendar MCP to create the event
directly — not required for Phase 1.)

### 8.8 States
- **Loading**: skeleton cards or `.loading`.
- **Empty** (filters match nothing): friendly "אין משחקים שמתאימים לסננים" + "נקה סננים".
- **No API key / never synced**: a one-line banner "עדיין לא סונכרנו משחקים — לחץ 'סנכרן עכשיו'".
- **Sync error**: non-blocking toast/banner with the error; the board keeps showing cached data.

---

## 9. UI/UX quality bar

The implementation MUST consult the `frontend-design` skill. Principles to honor:
- **Visual hierarchy**: tracked teams and Arsenal are the loudest things on the page; non-tracked
  fixtures recede. The eye should land on "my games this month" in under a second.
- **Consistency**: reuse the existing dark-sidebar / light-card aesthetic, CSS variables, badge
  and button classes. The page must look native to the dashboard, not bolted on.
- **Scannability**: strong date/time typography, big crests, generous whitespace, aligned columns.
- **Color with meaning**: reuse `--green` (home/on-sale/active), `--amber` (warning/not-yet),
  `--red` (reschedule/danger), gray (away/closed). Don't introduce a new palette.
- **Responsive**: usable on a phone (Omri checks on the go). Filter bar collapses gracefully;
  cards stack single-column on narrow screens.
- **RTL**: Hebrew labels render correctly; wrap any inline Latin/numbers so they don't garble.
- **Feedback**: every action (sync, save, calendar-add) gives immediate visual confirmation.
- **No dead ends**: empty/error/loading states are all designed, never a blank screen.

---

## 10. Seed data — tracked teams

Seed `teams.is_tracked=1` for these (Arsenal also `is_primary=1`). Match by `api_team_id` after
the first sync populates the table — i.e. the sync inserts all teams, then a seed step flags the
tracked ones by name→id. (Hardcode the football-data team ids in the seed; resolve/verify them on
first sync and log any name that didn't match so the list can be corrected.)

Arsenal (primary), Chelsea, Newcastle United, Liverpool, Manchester City, Manchester United,
Fulham, Brentford, Crystal Palace, Everton. (Omri can add/remove later via the teams endpoint.)

---

## 11. Future phases (not now — recorded so the model fits them)

- **Phase 2 — Change alerts:** push reschedule events (already detected & stored) to
  WhatsApp/Telegram via the existing notifier. Tighten sync cadence over the 8-week horizon.
- **Phase 3 — Inventory linking + onsale scanner:** join fixtures to `games`/`inventory`/`orders`
  (each card shows "you hold N tickets, €X"); an automatic scanner fills `tickets_onsale_at`/
  `tickets_status` (`tickets_source='scanner'`), respecting `manually_overridden`.
- **Phase 4 — Multi-league + full automation:** add competitions (CL `CL`, La Liga `PD`, etc.)
  via the same `competition_code`-parameterized fetcher; richer auto-scraping.

---

## 12. Action items for Omri

1. **Register** a free key at football-data.org and provide it → it's set as the Fly secret
   `FOOTBALL_DATA_API_KEY`. (Until then, the page builds and runs; it just shows the "not synced"
   banner.)
2. **Confirm** the tracked-team list in §10 (add any missing clubs).

---

## 13. Acceptance criteria (Phase 1 done when…)

- `seasons`, `teams`, `fixtures` tables exist; weekly cron + `POST /api/fixtures/sync` populate
  all PL 2026/27 fixtures with crests, matchday, UK-local kickoff.
- `/fixtures` shows a monthly calendar by default and a matchweek list via toggle.
- Filters by team, month, and home/away work and combine (verified: "Arsenal + December + home").
- Tracked teams and Arsenal are visually emphasized; home/away tags render; crests are prominent.
- A rescheduled fixture (simulate by editing kickoff then re-syncing a changed value) shows ⚠️
  with the from→to tooltip.
- Each fixture supports manual edit of kickoff + ticket fields, and the edit survives a re-sync
  (`manually_overridden`).
- Each fixture offers "add to calendar" for both a match reminder and a ticket-purchase reminder.
- The page is responsive, RTL-correct, and matches the existing dashboard styling.

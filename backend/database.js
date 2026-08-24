const { DatabaseSync } = require('node:sqlite');
const path = require('path');

// In production (Fly.io), use persistent volume at /data
const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/data/games.db'
  : path.join(__dirname, 'games.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys via SQL
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

// Migrations
try { db.exec("ALTER TABLE games ADD COLUMN notes TEXT DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE inventory ADD COLUMN member_number TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN order_number TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN sales_channel TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN ticket_quantity INTEGER DEFAULT 1"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN category TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN row_seat TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN game_datetime TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE orders ADD COLUMN deleted_at DATETIME"); } catch (_) {}
try { db.exec("ALTER TABLE games ADD COLUMN completed INTEGER DEFAULT 0"); } catch (_) {}
// Hot Games (curated high-demand fixtures) — persist across syncs; sync never touches these.
try { db.exec("ALTER TABLE fixtures ADD COLUMN is_hot INTEGER DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE fixtures ADD COLUMN hot_reason TEXT"); } catch (_) {}
try { db.exec("ALTER TABLE fixtures ADD COLUMN hot_tier TEXT"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT,
    tab_name TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_revenue REAL,
    total_ticket_cost REAL,
    eli_cost REAL,
    total_all_costs REAL,
    net_profit REAL,
    margin_percent REAL,
    tickets_sold INTEGER,
    avg_buy_price REAL,
    avg_sell_price REAL,
    status_breakdown TEXT,
    issues TEXT
  );

  CREATE TABLE IF NOT EXISTS extra_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    label TEXT,
    amount REAL
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER REFERENCES games(id) ON DELETE SET NULL,
    game_name TEXT NOT NULL,
    game_date TEXT,
    seat TEXT,
    section TEXT,
    category TEXT,
    buy_price REAL DEFAULT 0,
    sell_price REAL DEFAULT 0,
    status TEXT DEFAULT 'Available',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_name TEXT,
    buyer_email TEXT,
    buyer_phone TEXT,
    total_amount REAL DEFAULT 0,
    status TEXT DEFAULT 'Pending',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE,
    sell_price REAL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts DATETIME DEFAULT CURRENT_TIMESTAMP,
    source TEXT NOT NULL,
    action TEXT NOT NULL,
    table_name TEXT,
    record_id TEXT,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    note TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

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

  CREATE TABLE IF NOT EXISTS standings (
    competition_code TEXT NOT NULL,
    group_name TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL,
    team_id INTEGER,
    team_name TEXT,
    crest_url TEXT,
    played INTEGER, won INTEGER, draw INTEGER, lost INTEGER,
    goals_for INTEGER, goals_against INTEGER, goal_difference INTEGER,
    points INTEGER, form TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (competition_code, group_name, position)
  );
`);

// Final scores for played fixtures (added 2026-08-24)
try { db.exec('ALTER TABLE fixtures ADD COLUMN home_score INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE fixtures ADD COLUMN away_score INTEGER'); } catch (_) {}
try { db.exec('ALTER TABLE fixtures ADD COLUMN winner TEXT'); } catch (_) {}

// Seed default watermark on first deploy (set to today so only future emails are checked)
try {
  const _today = new Date();
  const _ds = `${_today.getFullYear()}/${String(_today.getMonth()+1).padStart(2,'0')}/${String(_today.getDate()).padStart(2,'0')}`;
  db.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('gmail_last_checked_at', '${_ds}')`);
} catch (_) {}

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

module.exports = db;

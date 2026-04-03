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
`);

module.exports = db;

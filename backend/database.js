const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'games.db');
const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys via SQL
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

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
`);

module.exports = db;

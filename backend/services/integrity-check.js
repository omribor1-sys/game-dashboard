'use strict';

const db = require('../database');

/**
 * Run all data integrity checks.
 *
 * Returns:
 *  ok             — true if zero issues (warnings don't affect ok)
 *  issues         — critical problems that need immediate attention
 *  warnings       — non-critical anomalies worth reviewing
 *  stats          — basic counts
 *  revenue_summary — per-game revenue breakdown (informational)
 *  checked_at     — ISO timestamp
 */
function runIntegrityCheck() {
  const issues   = [];
  const warnings = [];

  // ── 1. Duplicate active order_numbers ────────────────────────────────────
  const dupOrders = db.prepare(`
    SELECT order_number, COUNT(*) AS n
    FROM orders
    WHERE deleted_at IS NULL
      AND order_number IS NOT NULL
      AND order_number != ''
    GROUP BY order_number
    HAVING n > 1
  `).all();
  for (const row of dupOrders) {
    issues.push(`מספר הזמנה כפול: #${row.order_number} מופיע ${row.n} פעמים`);
  }

  // ── 2. Confirmed orders with total_amount = 0 ────────────────────────────
  const zeroAmount = db.prepare(`
    SELECT order_number, game_name, id
    FROM orders
    WHERE deleted_at IS NULL
      AND status = 'Confirmed'
      AND (total_amount IS NULL OR total_amount = 0)
    ORDER BY created_at DESC
    LIMIT 50
  `).all();
  for (const row of zeroAmount) {
    const ref = row.order_number ? `#${row.order_number}` : `id=${row.id}`;
    issues.push(`הזמנה מאושרת ללא סכום: ${ref} — ${row.game_name || 'ללא משחק'}`);
  }

  // ── 3. SQ > BQ per game (impossible — sold > total) ─────────────────────
  const sqGtBq = db.prepare(`
    SELECT
      game_name,
      COUNT(*) AS bq,
      SUM(CASE WHEN status IN ('Sold','Delivered') THEN 1 ELSE 0 END) AS sq
    FROM inventory
    GROUP BY game_name
    HAVING sq > bq
  `).all();
  for (const row of sqGtBq) {
    issues.push(`נמכרו יותר כרטיסים ממה שיש: ${row.game_name} — SQ=${row.sq} > BQ=${row.bq}`);
  }

  // ── 4. Orders whose game_name not in inventory (warning) ─────────────────
  const orphans = db.prepare(`
    SELECT game_name, COUNT(*) AS n
    FROM orders
    WHERE deleted_at IS NULL
      AND game_name IS NOT NULL
      AND game_name != ''
      AND game_name NOT IN (SELECT DISTINCT game_name FROM inventory)
    GROUP BY game_name
    ORDER BY n DESC
    LIMIT 50
  `).all();
  for (const row of orphans) {
    warnings.push(`${row.n} הזמנה/ות עם שם משחק לא קיים במלאי: "${row.game_name}"`);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const total_active_orders = db.prepare(`
    SELECT COUNT(*) AS n FROM orders WHERE deleted_at IS NULL
  `).get().n;

  const invRow = db.prepare(`
    SELECT
      COUNT(*) AS total_tickets,
      SUM(CASE WHEN status IN ('Sold','Delivered') THEN 1 ELSE 0 END) AS total_sold
    FROM inventory
  `).get();

  const stats = {
    total_active_orders,
    total_tickets: invRow.total_tickets || 0,
    total_sold:    invRow.total_sold    || 0,
  };

  // ── Revenue summary per game (informational) ──────────────────────────────
  const revenue_summary = db.prepare(`
    SELECT
      game_name,
      COUNT(*) AS order_count,
      ROUND(COALESCE(SUM(total_amount), 0), 2) AS total_revenue
    FROM orders
    WHERE deleted_at IS NULL
      AND (status IS NULL OR status != 'Cancelled')
      AND game_name IS NOT NULL
    GROUP BY game_name
    ORDER BY total_revenue DESC
  `).all();

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    stats,
    revenue_summary,
    checked_at: new Date().toISOString(),
  };
}

module.exports = { runIntegrityCheck };

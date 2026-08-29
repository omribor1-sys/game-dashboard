'use strict';

const db = require('../database');
const { sharesTeam } = require('../utils/normalize');

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

  // ── 4. Same game_datetime AND a shared team = the same game under two names ──
  // Same kickoff alone is not a duplicate: on a final matchday every fixture starts
  // at once. Only a shared team proves it is one physical game (same rule as
  // normalizeGameName step 2.5).
  const dupDatetimes = db.prepare(`
    SELECT game_datetime, COUNT(DISTINCT game_name) AS name_count,
           GROUP_CONCAT(DISTINCT game_name) AS names
    FROM orders
    WHERE deleted_at IS NULL
      AND game_datetime IS NOT NULL
      AND game_datetime != ''
    GROUP BY game_datetime
    HAVING name_count > 1
    ORDER BY game_datetime DESC
    LIMIT 20
  `).all();
  for (const row of dupDatetimes) {
    const names = String(row.names ?? '').split(',').map(s => s.trim()).filter(Boolean);
    const clashes = names.filter((n, i) => names.some((m, j) => i !== j && sharesTeam(n, m)));
    if (clashes.length > 1) {
      issues.push(`אותו מועד משחק עם שמות שונים — ${row.game_datetime}: ${clashes.join(', ')}`);
    }
  }

  // ── 4b. One game_name spanning several kickoffs = orders filed under the wrong game ──
  // The mirror image of check 4. A fixture has exactly ONE kickoff, so a game_name
  // carrying orders at two different game_datetimes means a normaliser merged an
  // unrelated sale into it. Both real incidents (Newcastle/West Brom 2026-08-25,
  // Crystal Palace/Man City 2026-08-28) show up here immediately, and neither was
  // visible to any other check — the orders looked perfectly healthy on their own.
  // Scoped to a rolling 90-day window (plus anything in the future). Last season's
  // contamination is closed history Omri will not reopen, and re-reporting it every
  // morning would train him to ignore this alert — which is how the next live one
  // gets missed. A window also needs no season table and no yearly edit.
  const CURRENT_WINDOW_DAYS = 90;
  const cutoff = Date.now() - CURRENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const slotRows = db.prepare(`
    SELECT DISTINCT game_name, game_datetime
    FROM orders
    WHERE deleted_at IS NULL
      AND game_name IS NOT NULL AND game_name != ''
      AND game_datetime IS NOT NULL AND game_datetime != ''
  `).all();

  // "Sat, 28/08/2026, 20:00" → ms. Unparseable rows are skipped, never guessed.
  const slotMs = (s) => {
    const m = String(s).match(/(\d{2})\/(\d{2})\/(\d{4}),\s*(\d{2}):(\d{2})/);
    if (!m) return null;
    return Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4], +m[5]);
  };

  const byGame = new Map();
  for (const r of slotRows) {
    const ms = slotMs(r.game_datetime);
    if (ms === null || ms < cutoff) continue;
    if (!byGame.has(r.game_name)) byGame.set(r.game_name, new Set());
    byGame.get(r.game_name).add(r.game_datetime);
  }
  for (const [game_name, slots] of byGame) {
    if (slots.size > 1) {
      issues.push(`משחק אחד עם ${slots.size} מועדים שונים — "${game_name}": ${[...slots].join(', ')}`);
    }
  }

  // ── 5. Orders whose game_name not in inventory (warning) ─────────────────
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

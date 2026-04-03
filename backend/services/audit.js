'use strict';
/**
 * Audit logger — every automated change to the DB goes through here.
 * Source should be: 'gmail-import' | 'stubhub-sync' | 'integrity-check' | 'manual'
 */
const db = require('../database');

const insert = db.prepare(`
  INSERT INTO audit_log (source, action, table_name, record_id, field, old_value, new_value, note)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

function log({ source, action, table_name, record_id, field, old_value, new_value, note }) {
  try {
    insert.run(
      source      || 'unknown',
      action      || 'unknown',
      table_name  || null,
      record_id   != null ? String(record_id) : null,
      field       || null,
      old_value   != null ? String(old_value) : null,
      new_value   != null ? String(new_value) : null,
      note        || null,
    );
  } catch (e) {
    console.error('[audit] failed to log:', e.message);
  }
}

// Log a new order insertion
function logInsert(source, order_number, game_name) {
  log({ source, action: 'INSERT', table_name: 'orders', record_id: order_number, note: game_name });
}

// Log a field update on an order
function logUpdate(source, order_number, field, old_value, new_value) {
  log({ source, action: 'UPDATE', table_name: 'orders', record_id: order_number, field, old_value, new_value });
}

// Log inventory status change
function logInventoryUpdate(source, inventory_id, field, old_value, new_value) {
  log({ source, action: 'UPDATE', table_name: 'inventory', record_id: inventory_id, field, old_value, new_value });
}

// Get recent audit log (last N entries)
function getRecent(limit = 100) {
  return db.prepare('SELECT * FROM audit_log ORDER BY ts DESC LIMIT ?').all(limit);
}

// Get summary of changes since a given datetime
function getSinceSummary(since) {
  return db.prepare(`
    SELECT source, action, table_name, field, COUNT(*) n
    FROM audit_log
    WHERE ts >= ?
    GROUP BY source, action, table_name, field
    ORDER BY n DESC
  `).all(since);
}

module.exports = { log, logInsert, logUpdate, logInventoryUpdate, getRecent, getSinceSummary };

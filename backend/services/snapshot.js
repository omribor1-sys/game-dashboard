'use strict';

const fs   = require('fs');
const path = require('path');
const db   = require('../database');

const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/data/games.db'
  : path.join(__dirname, '../games.db');

const BACKUP_DIR = process.env.NODE_ENV === 'production'
  ? '/data/backups'
  : path.join(__dirname, '../backups');

const MAX_SNAPSHOTS = 14; // keep 2 weeks of daily snapshots

/**
 * Create a timestamped snapshot of the database.
 * Checkpoints WAL first so the copy is fully consistent.
 * Rotates old snapshots beyond MAX_SNAPSHOTS.
 *
 * @param {string} label  e.g. 'daily', 'pre-gmail-import', 'manual'
 * @returns {{ filename, path, size_kb }}
 */
function createSnapshot(label) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  // Flush WAL pages into the main db file so the copy is complete
  try { db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get(); } catch (_) {}

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const datePart  = `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())}`;
  const timePart  = `${pad(now.getUTCHours())}-${pad(now.getUTCMinutes())}`;
  const safeLabel = String(label || 'snapshot').replace(/[^a-zA-Z0-9_-]/g, '-');
  const filename  = `${datePart}_${timePart}_${safeLabel}.db`;
  const destPath  = path.join(BACKUP_DIR, filename);

  fs.copyFileSync(DB_PATH, destPath);
  const size_kb = Math.round(fs.statSync(destPath).size / 1024);

  console.log(`[snapshot] Created: ${filename} (${size_kb} KB)`);

  _rotate();

  return { filename, path: destPath, size_kb };
}

/**
 * List all local snapshots, newest first.
 * @returns {Array<{ filename, size_kb, created_at }>}
 */
function listSnapshots() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return {
        filename:   f,
        size_kb:    Math.round(stat.size / 1024),
        created_at: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

/** Remove oldest snapshots beyond MAX_SNAPSHOTS. */
function _rotate() {
  if (!fs.existsSync(BACKUP_DIR)) return;

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(f => ({ f, mtime: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime); // newest first

  for (const { f } of files.slice(MAX_SNAPSHOTS)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, f));
      console.log(`[snapshot] Rotated out: ${f}`);
    } catch (e) {
      console.error(`[snapshot] Failed to delete ${f}:`, e.message);
    }
  }
}

module.exports = { createSnapshot, listSnapshots };

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');
const cron    = require('node-cron');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/games', require('./routes/games'));

const { inventoryRouter, ordersRouter } = require('./routes/inventory');
app.use('/api/inventory', inventoryRouter);
app.use('/api/orders',    ordersRouter);

// ── Admin / manual trigger endpoints ─────────────────────────────────────────
app.post('/api/admin/check-emails', async (req, res) => {
  try {
    // Snapshot before import so we can roll back if something goes wrong
    try { require('./services/snapshot').createSnapshot('pre-gmail-import'); } catch (_) {}

    const { checkEmailsAndImport, sendSummaryEmail } = require('./services/gmail-importer');
    const { sendWhatsAppSummary } = require('./services/whatsapp-notifier');
    const { google } = require('googleapis');

    const futureOnly = req.query.futureOnly === 'true' || req.body.futureOnly === true;
    const ignoreRead = req.query.ignoreRead === 'true' || req.body.ignoreRead === true;
    const { stats, importedOrders } = await checkEmailsAndImport({ futureOnly, ignoreRead });

    // Send notifications if anything was imported
    if (stats.imported > 0) {
      // Email summary
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob'
      );
      auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
      await sendSummaryEmail(auth, stats, importedOrders).catch(e => console.error('[admin] email err:', e.message));

      // WhatsApp summary
      await sendWhatsAppSummary(stats, importedOrders).catch(e => console.error('[admin] whatsapp err:', e.message));
    }

    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// WhatsApp test endpoint
app.post('/api/admin/test-whatsapp', async (req, res) => {
  try {
    const { sendWhatsApp } = require('./services/whatsapp-notifier');
    await sendWhatsApp('🎟️ GameYield WhatsApp test — connection OK!');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// StubHub sync — accepts scraped orders from local Chrome skill
// Body: { orders: [{ order_number, game_name, game_datetime, ticket_quantity, category, row_seat, buyer_name, total_amount, sales_channel }] }

// Normalize StubHub raw game names to canonical names stored in DB.
// Strips date suffixes (e.g. " | Sat, 11/04/2026, 12:30") and fuzzy-matches
// against existing game_names so duplicates like "Arsenal FC vs AFC Bournemouth"
// and "Arsenal vs Bournemouth" are merged automatically.
// Hardcoded StubHub raw name → canonical DB name mapping.
// Add entries here whenever a new raw variant is discovered.
const GAME_NAME_MAP = {
  'arsenal fc vs afc bournemouth': 'Arsenal vs Bournemouth',
  'afc bournemouth vs arsenal fc': 'Bournemouth vs Arsenal',
  'manchester city fc vs arsenal fc': 'Manchester City vs Arsenal',
  'arsenal fc vs manchester city fc': 'Arsenal vs Manchester City',
  'arsenal fc vs newcastle united fc': 'Arsenal vs Newcastle United',
  'newcastle united fc vs arsenal fc': 'Newcastle United vs Arsenal',
  'newcastle united fc vs afc bournemouth': 'Newcastle vs Bournemouth',
  'chelsea fc vs manchester united': 'Chelsea vs Manchester United',
  'chelsea fc vs manchester city fc': 'Chelsea vs Manchester City',
  'tottenham hotspur fc vs brighton & hove albion fc': 'Tottenham vs Brighton',
  'tottenham hotspur vs brighton & hove albion fc': 'Tottenham vs Brighton',
  'brentford fc vs everton fc': 'Brentford vs Everton',
  'liverpool fc vs fulham fc': 'Liverpool vs Fulham',
  'fulham fc vs aston villa fc': 'Fulham vs Aston Villa',
  'arsenal fc vs sporting cp': 'Arsenal vs Sporting CP',
  'arsenal fc vs sporting cp - champions league 2025-2026': 'Arsenal vs Sporting CP',
  'arsenal fc vs fulham fc': 'Arsenal vs Fulham',
  'brentford fc vs west ham united fc': 'Brentford vs West Ham',
  'brentford fc vs crystal palace fc': 'Brentford vs Crystal Palace',
  'tottenham hotspur vs nottingham forest fc': 'Tottenham Hotspur vs Nottingham Forest FC',
  'liverpool fc vs galatasaray': 'Liverpool FC vs Galatasaray',
  'carabao cup final 2026 - arsenal fc vs manchester city fc': 'Manchester City VS Arsenal CARABAO CUP 22 03 2026',
  'arsenal vs bayer leverkusen': 'Arsenal vs Bayer Leverkusen 17 03 2026',
  'chelsea fc vs manchester city fc': 'Chelsea vs Manchester City',
  'manchester city fc vs southampton fc - fa cup - semi-final': 'Manchester City vs Southampton - FA Cup Semi-Final',
};

function normalizeGameName(rawName, db) {
  if (!rawName) return rawName;
  // Step 1: strip date/time suffix " | Day, DD/MM/YYYY, HH:MM"
  let name = rawName.replace(/\s*\|.*$/, '').trim();
  // Step 2: hardcoded mapping (fastest, most reliable)
  const mapped = GAME_NAME_MAP[name.toLowerCase()];
  if (mapped) return mapped;
  // Step 3: fuzzy-match against existing canonical names in DB
  const words = name.split(/\s+/).filter(w => w.length > 3 && !/^(vs|vs\.|AFC|FC|United|City)$/i.test(w));
  if (words.length >= 2) {
    const likeClause = words.slice(0, 2).map(() => 'game_name LIKE ?').join(' AND ');
    const params = words.slice(0, 2).map(w => `%${w}%`);
    const match = db.prepare(
      `SELECT game_name FROM orders WHERE ${likeClause} AND deleted_at IS NULL LIMIT 1`
    ).get(...params);
    if (match) return match.game_name;
  }
  return name;
}

app.post('/api/admin/stubhub-sync', async (req, res) => {
  try {
    const db = require('./database');
    const { logInsert, logUpdate } = require('./services/audit');
    const { orders: incoming } = req.body;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ error: 'orders array required' });
    }

    const report = { inserted: [], updated: [], unchanged: [] };

    // ── Phase 1: detect what will change (read-only, no writes yet) ─────────
    const pending = [];
    for (const o of incoming) {
      const num = String(o.order_number || '').trim();
      if (!num) continue;
      // Normalize game name before any lookup or insert
      o.game_name = normalizeGameName(o.game_name, db);

      const existing = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(num);

      if (!existing) {
        const wasDeleted = db.prepare('SELECT id FROM orders WHERE order_number = ? AND deleted_at IS NOT NULL').get(num);
        if (wasDeleted) { report.unchanged.push(num); continue; }
        pending.push({ type: 'insert', o, num });
      } else {
        // ⚠️  PROTECTED FIELDS (never auto-update): total_amount, buyer_email
        const changes = {};
        const fields = ['game_name', 'game_datetime', 'category', 'buyer_name', 'ticket_quantity', 'row_seat'];
        for (const f of fields) {
          const incoming_val = o[f] != null ? String(o[f]).trim() : null;
          const existing_val = existing[f] != null ? String(existing[f]).trim() : null;
          if (incoming_val && incoming_val !== existing_val) {
            changes[f] = { from: existing_val, to: incoming_val };
          }
        }
        if (Object.keys(changes).length === 0) { report.unchanged.push(num); continue; }
        pending.push({ type: 'update', o, num, existing, changes });
      }
    }

    // ── Phase 2: snapshot BEFORE any writes (only if there's something to write)
    if (pending.length > 0) {
      try { require('./services/snapshot').createSnapshot('pre-stubhub-sync'); } catch (_) {}
    }

    // ── Phase 3: execute writes ──────────────────────────────────────────────
    for (const item of pending) {
      const { type, o, num } = item;
      if (type === 'insert') {
        db.prepare(`
          INSERT INTO orders
            (buyer_name, buyer_email, status, notes,
             game_name, order_number, sales_channel,
             total_amount, ticket_quantity, category, row_seat, game_datetime)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
          o.buyer_name    || null,
          o.buyer_email   || null,
          'Confirmed',
          null,
          o.game_name     || null,
          num,
          o.sales_channel || 'StubHub',
          o.total_amount  || 0,
          o.ticket_quantity || 1,
          o.category      || null,
          o.row_seat      || null,
          o.game_datetime || null,
        );
        logInsert('stubhub-sync', num, o.game_name);
        report.inserted.push({ order_number: num, game_name: o.game_name });
      } else {
        const { changes } = item;
        const setClauses = Object.keys(changes).map(f => `${f} = ?`).join(', ');
        const values = Object.keys(changes).map(f => o[f]);
        db.prepare(`UPDATE orders SET ${setClauses} WHERE order_number = ?`).run(...values, num);
        for (const [field, { from, to }] of Object.entries(changes)) {
          logUpdate('stubhub-sync', num, field, from, to);
        }
        report.updated.push({ order_number: num, changes });
      }
    }

    console.log(`[stubhub-sync] inserted=${report.inserted.length} updated=${report.updated.length} unchanged=${report.unchanged.length}`);
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/audit-log — view recent automated changes
app.get('/api/admin/audit-log', (req, res) => {
  try {
    const { getRecent, getSinceSummary } = require('./services/audit');
    const limit = parseInt(req.query.limit) || 200;
    const since = req.query.since || null; // ISO date string
    if (since) {
      res.json(getSinceSummary(since));
    } else {
      res.json(getRecent(limit));
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/daily-report — send WhatsApp report of what changed in last 24h
app.post('/api/admin/daily-report', async (req, res) => {
  try {
    const db = require('./database');
    const { sendWhatsApp } = require('./services/whatsapp-notifier');
    const { getSinceSummary } = require('./services/audit');

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    const changes = getSinceSummary(since);
    const totalOrders = db.prepare("SELECT COUNT(*) n FROM orders").get().n;
    const upcomingOrders = db.prepare("SELECT COUNT(*) n FROM orders WHERE game_datetime >= date('now') AND (status IS NULL OR status != 'Cancelled')").get().n;

    let msg = `📊 *GameYield יומי — ${new Date().toLocaleDateString('he-IL')}*\n\n`;
    msg += `📦 סה"כ הזמנות: ${totalOrders} | עתידיות: ${upcomingOrders}\n\n`;

    if (changes.length === 0) {
      msg += '✅ אין שינויים אוטומטיים ב-24 שעות האחרונות\n';
    } else {
      msg += '*שינויים אוטומטיים (24 שעות):*\n';
      changes.forEach(c => {
        const action = c.action === 'INSERT' ? '➕ הוכנס' : '✏️ עודכן';
        msg += `${action} ${c.n}× — ${c.source} → ${c.table_name}${c.field ? '.' + c.field : ''}\n`;
      });
    }

    await sendWhatsApp(msg);
    res.json({ ok: true, changes: changes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Snapshot endpoints ─────────────────────────────────────────────────────

// GET /api/admin/snapshots — list local snapshots
app.get('/api/admin/snapshots', (req, res) => {
  try {
    const { listSnapshots } = require('./services/snapshot');
    res.json(listSnapshots());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/snapshots — create manual snapshot
app.post('/api/admin/snapshots', (req, res) => {
  try {
    const { createSnapshot } = require('./services/snapshot');
    const label = (req.body.label || 'manual').replace(/[^a-zA-Z0-9_-]/g, '-');
    const result = createSnapshot(label);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Integrity check endpoints ──────────────────────────────────────────────

// GET /api/admin/integrity — run integrity check, return JSON
app.get('/api/admin/integrity', (req, res) => {
  try {
    const { runIntegrityCheck } = require('./services/integrity-check');
    res.json(runIntegrityCheck());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/integrity/notify — run check + send WhatsApp if issues
app.post('/api/admin/integrity/notify', async (req, res) => {
  try {
    const { runIntegrityCheck } = require('./services/integrity-check');
    const { sendWhatsApp }      = require('./services/whatsapp-notifier');
    const result = runIntegrityCheck();
    await sendWhatsApp(_buildIntegrityMessage(result)).catch(e =>
      console.error('[admin] integrity notify WhatsApp failed:', e.message)
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/backup-drive', async (req, res) => {
  try {
    const { backupToDrive } = require('./services/gdrive-backup');
    const result = await backupToDrive();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/rename-game-in-orders — bulk rename game_name in orders table
// Body: { renames: [{ from: "old name", to: "new name" }] }
app.post('/api/admin/rename-game-in-orders', (req, res) => {
  try {
    const db = require('./database');
    const { renames } = req.body;
    if (!Array.isArray(renames)) return res.status(400).json({ error: 'renames must be an array' });
    const results = [];
    const stmt = db.prepare('UPDATE orders SET game_name = ? WHERE game_name = ?');
    for (const { from, to } of renames) {
      if (!from || !to) continue;
      const r = stmt.run(to, from);
      results.push({ from, to, updated: r.changes });
    }
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/normalize-all-order-names
// Strips date suffixes and applies GAME_NAME_MAP to ALL orders in DB
app.post('/api/admin/normalize-all-order-names', (req, res) => {
  try {
    const db = require('./database');
    const rows = db.prepare('SELECT DISTINCT game_name FROM orders WHERE game_name IS NOT NULL').all();
    const results = [];
    for (const { game_name } of rows) {
      const normalized = normalizeGameName(game_name, db);
      if (normalized !== game_name) {
        const r = db.prepare('UPDATE orders SET game_name = ? WHERE game_name = ?').run(normalized, game_name);
        results.push({ from: game_name, to: normalized, updated: r.changes });
      }
    }
    res.json({ ok: true, fixed: results.length, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Missing-costs check ────────────────────────────────────────────────────
// Returns games that have orders/revenue but no ticket cost data entered
app.get('/api/admin/missing-costs', (req, res) => {
  try {
    const db = require('./database');
    const missing = _getMissingCosts(db);
    res.json(missing);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/missing-costs/notify — send WhatsApp asking for missing costs
app.post('/api/admin/missing-costs/notify', async (req, res) => {
  try {
    const db = require('./database');
    const { sendWhatsApp } = require('./services/whatsapp-notifier');
    const missing = _getMissingCosts(db);
    if (missing.length === 0) {
      await sendWhatsApp('✅ GameYield — כל המשחקים עם הזמנות כוללים עלויות. אין פעולה נדרשת.');
    } else {
      let msg = `⚠️ *GameYield — נתונים חסרים*\n\n`;
      msg += `ל-${missing.length} משחק/ים יש הזמנות אך חסרות עלויות רכישה:\n\n`;
      missing.forEach((g, i) => {
        msg += `${i + 1}. *${g.game_name}*\n`;
        msg += `   📦 הזמנות: ${g.order_count} | הכנסות: €${g.total_revenue.toFixed(2)}\n`;
      });
      msg += `\nאנא הזן עלויות דרך הדשבורד: https://game-dashboard-omri.fly.dev`;
      await sendWhatsApp(msg);
    }
    res.json({ ok: true, missing_count: missing.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function _getMissingCosts(db) {
  // Only PAST games that have revenue but no cost data.
  // game_datetime format in orders: "Day, DD/MM/YYYY, HH:MM" → parse to ISO for comparison.
  // Also falls back to games.date or inventory.game_date (both in YYYY-MM-DD).
  return db.prepare(`
    SELECT
      o.game_name,
      COUNT(*)                          AS order_count,
      ROUND(SUM(o.total_amount), 2)     AS total_revenue,
      COALESCE(g.total_ticket_cost, 0)  AS total_ticket_cost,
      g.completed,
      MAX(o.game_datetime)              AS game_datetime,
      -- Parse "Day, DD/MM/YYYY, HH:MM" → "YYYY-MM-DD" for the latest order
      MAX(
        CASE WHEN o.game_datetime IS NOT NULL AND length(o.game_datetime) >= 15
          THEN substr(o.game_datetime,12,4)||'-'||substr(o.game_datetime,9,2)||'-'||substr(o.game_datetime,6,2)
        END
      ) AS game_date_iso
    FROM orders o
    LEFT JOIN games g ON g.name = o.game_name
    WHERE o.deleted_at IS NULL
      AND (o.status IS NULL OR o.status != 'Cancelled')
    GROUP BY o.game_name
    HAVING
      SUM(o.total_amount) > 0
      AND (g.id IS NULL OR COALESCE(g.total_ticket_cost, 0) = 0)
      AND COALESCE(g.completed, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM inventory i
        WHERE i.game_name = o.game_name AND COALESCE(i.buy_price, 0) > 0
      )
      AND (
        -- game_datetime parsed to ISO is in the past
        (
          MAX(CASE WHEN o.game_datetime IS NOT NULL AND length(o.game_datetime) >= 15
            THEN substr(o.game_datetime,12,4)||'-'||substr(o.game_datetime,9,2)||'-'||substr(o.game_datetime,6,2)
          END) IS NOT NULL
          AND MAX(CASE WHEN o.game_datetime IS NOT NULL AND length(o.game_datetime) >= 15
            THEN substr(o.game_datetime,12,4)||'-'||substr(o.game_datetime,9,2)||'-'||substr(o.game_datetime,6,2)
          END) < date('now')
        )
        OR
        -- OR fallback: games table date is in the past
        (g.date IS NOT NULL AND g.date < date('now'))
        OR
        -- OR fallback: inventory game_date is in the past
        EXISTS (
          SELECT 1 FROM inventory i
          WHERE i.game_name = o.game_name AND i.game_date IS NOT NULL AND i.game_date < date('now')
        )
      )
    ORDER BY game_date_iso DESC
  `).all();
}

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// ── Helper: build Hebrew WhatsApp integrity message ────────────────────────
function _buildIntegrityMessage(result) {
  const dateStr = new Date().toLocaleDateString('he-IL');
  let msg = `🔍 *בדיקת שלמות נתונים — ${dateStr}*\n\n`;

  if (result.ok && result.warnings.length === 0) {
    msg += `✅ כל הנתונים תקינים\n`;
    msg += `📦 ${result.stats.total_active_orders} הזמנות פעילות | `;
    msg += `${result.stats.total_tickets} כרטיסים | `;
    msg += `${result.stats.total_sold} נמכרו\n`;
  } else {
    if (result.issues.length > 0) {
      msg += `🔴 *בעיות קריטיות (${result.issues.length}):*\n`;
      result.issues.forEach(i => { msg += `• ${i}\n`; });
      msg += '\n';
    }
    if (result.warnings.length > 0) {
      msg += `🟡 *אזהרות (${result.warnings.length}):*\n`;
      result.warnings.forEach(w => { msg += `• ${w}\n`; });
      msg += '\n';
    }
    msg += `📦 ${result.stats.total_active_orders} הזמנות פעילות | `;
    msg += `${result.stats.total_tickets} כרטיסים | `;
    msg += `${result.stats.total_sold} נמכרו\n`;
  }
  return msg;
}

// ── Scheduled jobs ────────────────────────────────────────────────────────────

// Gmail check — every day at 08:00 UTC
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Running daily Gmail email check…');
  try {
    const { checkEmailsAndImport, sendSummaryEmail } = require('./services/gmail-importer');
    const { sendWhatsAppSummary } = require('./services/whatsapp-notifier');
    const { google } = require('googleapis');

    // Daily cron: import only future-game orders (futureOnly=true)
    const { stats, importedOrders } = await checkEmailsAndImport({ futureOnly: true });

    // Send notifications if there are new orders or no-date orders
    const hasNewOrNoDate = stats.imported > 0 || (importedOrders && importedOrders.some(o => !o.game_date));
    if (hasNewOrNoDate) {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob'
      );
      auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

      // Email summary
      await sendSummaryEmail(auth, stats, importedOrders).catch(e =>
        console.error('[CRON] Email summary failed:', e.message)
      );

      // WhatsApp summary
      await sendWhatsAppSummary(stats, importedOrders).catch(e =>
        console.error('[CRON] WhatsApp summary failed:', e.message)
      );
    }
  } catch (e) {
    console.error('[CRON] Gmail check failed:', e.message);
  }
});

// Daily WhatsApp report — every day at 19:00 UTC (22:00 Israel)
cron.schedule('0 19 * * *', async () => {
  console.log('[CRON] Sending daily WhatsApp report…');
  try {
    const db = require('./database');
    const { sendWhatsApp } = require('./services/whatsapp-notifier');
    const { getSinceSummary } = require('./services/audit');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 19);
    const changes = getSinceSummary(since);
    const totalOrders = db.prepare("SELECT COUNT(*) n FROM orders").get().n;
    const upcomingOrders = db.prepare("SELECT COUNT(*) n FROM orders WHERE game_datetime >= date('now') AND (status IS NULL OR status != 'Cancelled')").get().n;
    let msg = `📊 *GameYield יומי — ${new Date().toLocaleDateString('he-IL')}*\n\n`;
    msg += `📦 סה"כ הזמנות: ${totalOrders} | עתידיות: ${upcomingOrders}\n\n`;
    if (changes.length === 0) {
      msg += '✅ אין שינויים אוטומטיים ב-24 שעות האחרונות\n';
    } else {
      msg += '*שינויים אוטומטיים (24 שעות):*\n';
      changes.forEach(c => {
        const action = c.action === 'INSERT' ? '➕ הוכנס' : '✏️ עודכן';
        msg += `${action} ${c.n}× — ${c.source}${c.field ? ' → ' + c.field : ''}\n`;
      });
    }
    await sendWhatsApp(msg).catch(e => console.error('[CRON] WhatsApp daily report failed:', e.message));
  } catch (e) {
    console.error('[CRON] Daily report failed:', e.message);
  }
});

// Daily local snapshot — every day at 01:00 UTC
cron.schedule('0 1 * * *', () => {
  console.log('[CRON] Running daily snapshot…');
  try {
    const { createSnapshot } = require('./services/snapshot');
    createSnapshot('daily');
  } catch (e) {
    console.error('[CRON] Daily snapshot failed:', e.message);
  }
});

// Google Drive backup — every day at 02:00 UTC (changed from bi-weekly)
cron.schedule('0 2 * * *', async () => {
  console.log('[CRON] Running scheduled Drive backup…');
  try {
    const { backupToDrive } = require('./services/gdrive-backup');
    await backupToDrive();
  } catch (e) {
    console.error('[CRON] Drive backup failed:', e.message);
  }
});

// Integrity check — every day at 07:45 UTC (15 min before Gmail import)
cron.schedule('45 7 * * *', async () => {
  console.log('[CRON] Running daily integrity check…');
  try {
    const { runIntegrityCheck } = require('./services/integrity-check');
    const { sendWhatsApp }      = require('./services/whatsapp-notifier');
    const result = runIntegrityCheck();
    // Always send — OK confirmation or alerts
    await sendWhatsApp(_buildIntegrityMessage(result)).catch(e =>
      console.error('[CRON] Integrity WhatsApp failed:', e.message)
    );
    if (!result.ok) {
      console.error('[CRON] Integrity issues found:', result.issues);
    }
  } catch (e) {
    console.error('[CRON] Integrity check failed:', e.message);
  }
});

// Missing-costs check — every Sunday at 09:00 UTC (12:00 Israel)
cron.schedule('0 9 * * 0', async () => {
  console.log('[CRON] Running weekly missing-costs check…');
  try {
    const db = require('./database');
    const { sendWhatsApp } = require('./services/whatsapp-notifier');
    const missing = _getMissingCosts(db);
    if (missing.length > 0) {
      let msg = `⚠️ *GameYield — בדיקת שבועית: נתונים חסרים*\n\n`;
      msg += `ל-${missing.length} משחק/ים יש הזמנות אך חסרות עלויות רכישה:\n\n`;
      missing.forEach((g, i) => {
        msg += `${i + 1}. *${g.game_name}*\n`;
        msg += `   📦 הזמנות: ${g.order_count} | הכנסות: €${g.total_revenue.toFixed(2)}\n`;
      });
      msg += `\nאנא הזן עלויות דרך הדשבורד: https://game-dashboard-omri.fly.dev`;
      await sendWhatsApp(msg).catch(e => console.error('[CRON] missing-costs WhatsApp failed:', e.message));
    }
  } catch (e) {
    console.error('[CRON] Missing-costs check failed:', e.message);
  }
});

// ── Serve frontend ────────────────────────────────────────────────────────────
const frontendDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Startup: normalize all order game_names ───────────────────────────────
(function normalizeOrdersOnStartup() {
  try {
    const db = require('./database');
    const rows = db.prepare('SELECT DISTINCT game_name FROM orders WHERE game_name IS NOT NULL').all();
    let fixed = 0;
    for (const { game_name } of rows) {
      const normalized = normalizeGameName(game_name, db);
      if (normalized !== game_name) {
        db.prepare('UPDATE orders SET game_name = ? WHERE game_name = ?').run(normalized, game_name);
        console.log(`[startup] normalized: "${game_name}" → "${normalized}"`);
        fixed++;
      }
    }
    if (fixed > 0) console.log(`[startup] Fixed ${fixed} order game_name(s)`);
  } catch (e) {
    console.error('[startup] normalize orders failed:', e.message);
  }
})();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📸 Snapshot:        daily at 01:00 UTC  → /data/backups/ (14 days)`);
  console.log(`💾 Drive backup:    daily at 02:00 UTC  → Google Drive`);
  console.log(`🔍 Integrity check: daily at 07:45 UTC  → WhatsApp alert`);
  console.log(`📧 Gmail check:     daily at 08:00 UTC  → import new orders\n`);
});

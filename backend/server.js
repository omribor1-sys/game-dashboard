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
app.post('/api/admin/stubhub-sync', (req, res) => {
  try {
    const db = require('./database');
    const { logInsert, logUpdate } = require('./services/audit');
    const { orders: incoming } = req.body;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      return res.status(400).json({ error: 'orders array required' });
    }

    const report = { inserted: [], updated: [], unchanged: [] };

    for (const o of incoming) {
      const num = String(o.order_number || '').trim();
      if (!num) continue;

      const existing = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(num);

      if (!existing) {
        // Skip if this order_number was manually deleted by user
        const wasDeleted = db.prepare('SELECT id FROM orders WHERE order_number = ? AND deleted_at IS NOT NULL').get(num);
        if (wasDeleted) {
          report.unchanged.push(num); // silently skip
          continue;
        }
        // Insert new order
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
        continue;
      }

      // Check fields that might need updating
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

      if (Object.keys(changes).length === 0) {
        report.unchanged.push(num);
        continue;
      }

      // Apply updates + log each change
      const setClauses = Object.keys(changes).map(f => `${f} = ?`).join(', ');
      const values = Object.keys(changes).map(f => o[f]);
      db.prepare(`UPDATE orders SET ${setClauses} WHERE order_number = ?`).run(...values, num);
      for (const [field, { from, to }] of Object.entries(changes)) {
        logUpdate('stubhub-sync', num, field, from, to);
      }
      report.updated.push({ order_number: num, changes });
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

app.post('/api/admin/backup-drive', async (req, res) => {
  try {
    const { backupToDrive } = require('./services/gdrive-backup');
    const result = await backupToDrive();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

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

// Google Drive backup — every Friday and Sunday at 02:00 UTC
cron.schedule('0 2 * * 0,5', async () => {
  console.log('[CRON] Running scheduled Drive backup…');
  try {
    const { backupToDrive } = require('./services/gdrive-backup');
    await backupToDrive();
  } catch (e) {
    console.error('[CRON] Drive backup failed:', e.message);
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  console.log(`📧 Gmail check: daily at 08:00 UTC`);
  console.log(`💾 Drive backup: every Friday & Sunday at 02:00 UTC\n`);
});

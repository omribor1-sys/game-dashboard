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
        report.inserted.push({ order_number: num, game_name: o.game_name });
        continue;
      }

      // Check fields that might need updating
      const changes = {};
      const fields = ['game_name', 'game_datetime', 'category', 'buyer_name', 'total_amount', 'ticket_quantity', 'row_seat'];
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

      // Apply updates
      const setClauses = Object.keys(changes).map(f => `${f} = ?`).join(', ');
      const values = Object.keys(changes).map(f => o[f]);
      db.prepare(`UPDATE orders SET ${setClauses} WHERE order_number = ?`).run(...values, num);
      report.updated.push({ order_number: num, changes });
    }

    console.log(`[stubhub-sync] inserted=${report.inserted.length} updated=${report.updated.length} unchanged=${report.unchanged.length}`);
    res.json(report);
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

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
    const { checkEmailsAndImport } = require('./services/gmail-importer');
    const futureOnly = req.query.futureOnly === 'true' || req.body.futureOnly === true;
    const ignoreRead = req.query.ignoreRead === 'true' || req.body.ignoreRead === true;
    const { stats } = await checkEmailsAndImport({ futureOnly, ignoreRead });
    res.json(stats);
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
    const { google } = require('googleapis');
    const { stats, importedOrders } = await checkEmailsAndImport();
    // Send summary email if anything was imported
    if (stats.imported > 0) {
      const auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        'urn:ietf:wg:oauth:2.0:oob'
      );
      auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
      await sendSummaryEmail(auth, stats, importedOrders);
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

/**
 * Auth routes — no requireAuth middleware here (these are public)
 *
 * POST /api/auth/login           — username + password → sets gd_auth cookie
 * POST /api/auth/logout          — clears gd_auth cookie
 * GET  /api/auth/me              — returns { username } or 401
 * POST /api/auth/forgot-password — sends reset email to omribor1@gmail.com
 * POST /api/auth/reset-password  — validates token, stores new password hash
 */

const express = require('express');
const router = express.Router();
const {
  verifyPassword,
  hashPassword,
  createToken,
  verifyToken,
  parseCookies,
  setAuthCookie,
  clearAuthCookie,
  createResetToken,
} = require('../services/auth');

function getDb() { return require('../database'); }

// ── Ensure users table exists and seed initial admin ──────────────────────────

function ensureUsersTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                   INTEGER PRIMARY KEY,
      username             TEXT UNIQUE NOT NULL,
      password_hash        TEXT NOT NULL,
      role                 TEXT DEFAULT 'admin',
      created_at           TEXT DEFAULT (datetime('now')),
      reset_token          TEXT,
      reset_token_expires  TEXT
    )
  `);

  // Seed from env vars if no users exist yet
  const count = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (count === 0) {
    const username = process.env.AUTH_ADMIN_USERNAME || 'omri';
    const plainPassword = process.env.AUTH_ADMIN_PASSWORD;
    if (!plainPassword) {
      console.warn('[auth] No AUTH_ADMIN_PASSWORD set — skipping initial user seed. Set it in Fly.io secrets.');
      return;
    }
    const password_hash = hashPassword(plainPassword);
    db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, password_hash, 'admin');
    console.log(`[auth] Created initial admin user: ${username}`);
  }
}

// Run once on module load
try { ensureUsersTable(); } catch (e) { console.error('[auth] ensureUsersTable failed:', e.message); }

// ── POST /api/auth/login ───────────────────────────────────────────────────────

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });

    if (!verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = createToken(user.username);
    setAuthCookie(res, token);
    res.json({ ok: true, username: user.username, role: user.role });
  } catch (e) {
    console.error('[auth/login]', e.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', (req, res) => {
  const cookies = parseCookies(req);
  const user = verifyToken(cookies['gd_auth']);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const db = getDb();
    const row = db.prepare('SELECT username, role FROM users WHERE username = ?').get(user.username);
    if (!row) return res.status(401).json({ error: 'User not found' });
    res.json({ username: row.username, role: row.role });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  // Always return success to avoid username enumeration
  try {
    const db = getDb();
    const { username } = req.body;
    const user = username
      ? db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim())
      : db.prepare("SELECT * FROM users WHERE role = 'admin' LIMIT 1").get();

    if (!user) return res.json({ ok: true }); // silent — don't reveal existence

    const token = createResetToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expires, user.id);

    const resetUrl = `https://game-dashboard-omri.fly.dev/reset-password?token=${token}`;

    // Send via Gmail API (same credentials already in env)
    await sendResetEmail(resetUrl).catch(e => console.error('[auth/forgot-password] email failed:', e.message));

    res.json({ ok: true });
  } catch (e) {
    console.error('[auth/forgot-password]', e.message);
    res.json({ ok: true }); // Always return OK
  }
});

// ── POST /api/auth/reset-password ────────────────────────────────────────────

router.post('/reset-password', (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'token and newPassword required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE reset_token = ?').get(token);
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });
    if (!user.reset_token_expires || new Date(user.reset_token_expires) < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired. Please request a new one.' });
    }

    const password_hash = hashPassword(newPassword);
    db.prepare('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?')
      .run(password_hash, user.id);

    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (e) {
    console.error('[auth/reset-password]', e.message);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ── Helper: send reset email via Gmail API ────────────────────────────────────

async function sendResetEmail(resetUrl) {
  const { google } = require('googleapis');
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob'
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  const gmail = google.gmail({ version: 'v1', auth });

  const to = 'omribor1@gmail.com';
  const subject = 'GameYield — Password Reset';
  const body = [
    'Hello Omri,',
    '',
    'You requested a password reset for GameYield.',
    '',
    `Click the link below to set a new password (valid for 1 hour):`,
    resetUrl,
    '',
    'If you did not request this, ignore this email.',
    '',
    '— GameYield',
  ].join('\n');

  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString('base64url');

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
  console.log('[auth] Password reset email sent to', to);
}

module.exports = router;

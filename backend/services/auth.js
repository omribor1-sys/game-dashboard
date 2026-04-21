/**
 * Auth service — Node 24 built-in crypto only (no extra npm packages)
 *
 * Password storage : PBKDF2-SHA512, 100 000 iterations, 64-byte output
 * Session tokens   : HMAC-SHA256 signed, format: username.expiry.sig
 * Cookie name      : gd_auth (HTTP-only, SameSite=Strict)
 */

const crypto = require('crypto');

const COOKIE_NAME = 'gd_auth';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds
const TOKEN_ALGORITHM = 'sha256';

// ── Password hashing ──────────────────────────────────────────────────────────

function hashPassword(plainText) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(plainText, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(plainText, stored) {
  const [salt, expectedHash] = stored.split(':');
  if (!salt || !expectedHash) return false;
  const hash = crypto.pbkdf2Sync(plainText, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

// ── Session tokens ────────────────────────────────────────────────────────────

function _getSecret() {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET env var not set');
  return s;
}

/** Create a signed session token valid for `maxAge` seconds */
function createToken(username, maxAge = COOKIE_MAX_AGE) {
  const expiry = Math.floor(Date.now() / 1000) + maxAge;
  const payload = `${username}.${expiry}`;
  const sig = crypto.createHmac(TOKEN_ALGORITHM, _getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** Verify token — returns { username } or null */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [username, expiryStr, sig] = parts;
  const payload = `${username}.${expiryStr}`;
  const expectedSig = crypto.createHmac(TOKEN_ALGORITHM, _getSecret()).update(payload).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expectedSig, 'hex'))) return null;
  const expiry = parseInt(expiryStr, 10);
  if (Date.now() / 1000 > expiry) return null;
  return { username };
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function parseCookies(req) {
  const cookies = {};
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try { cookies[k] = decodeURIComponent(v); } catch { cookies[k] = v; }
  }
  return cookies;
}

function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV !== 'development';
  const cookieParts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
  ];
  if (isProduction) cookieParts.push('Secure');
  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; SameSite=Strict`);
}

// ── Password reset tokens ─────────────────────────────────────────────────────

function createResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  COOKIE_NAME,
  hashPassword,
  verifyPassword,
  createToken,
  verifyToken,
  parseCookies,
  setAuthCookie,
  clearAuthCookie,
  createResetToken,
};

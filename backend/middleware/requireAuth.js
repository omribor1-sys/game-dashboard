/**
 * requireAuth middleware — validates gd_auth cookie on every protected request.
 * Attach this to any route (or the whole app) that needs authentication.
 * Returns 401 JSON if token is missing or invalid.
 */

const { parseCookies, verifyToken } = require('../services/auth');

function requireAuth(req, res, next) {
  const cookies = parseCookies(req);
  const token = cookies['gd_auth'];
  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.user = user;
  next();
}

module.exports = requireAuth;

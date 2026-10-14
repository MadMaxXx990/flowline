'use strict';
const jwt = require('jsonwebtoken');

/**
 * Determine whether a request is an API call.
 * Uses req.originalUrl (full URL) because req.path is router-relative
 * and would be wrong inside nested routers (e.g. /dashboard instead of
 * /admin/dashboard).
 */
const isApiRequest = req => req.originalUrl.startsWith('/api/');

/**
 * authenticate
 *
 * Reads the JWT from the httpOnly cookie "fl_token".
 *
 * - No cookie / invalid token:
 *     API requests  → 401 JSON
 *     Page requests → redirect to /login
 * - Valid token: attaches req.user = { id, role, employeeId }, calls next().
 */
const authenticate = (req, res, next) => {
  const token = req.cookies && req.cookies.fl_token;

  if (!token) {
    if (isApiRequest(req)) return res.status(401).json({ error: 'No token provided.' });
    return res.redirect('/login');
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    if (isApiRequest(req)) return res.status(401).json({ error: 'Invalid or expired token.' });
    return res.redirect('/login');
  }
};

/**
 * authorize(...roles)
 *
 * Must be called after authenticate (so req.user is always set when this runs).
 *
 * - req.user missing (should not happen after authenticate, but guard anyway):
 *     API  → 401 JSON
 *     Page → redirect to /login
 *
 * - Authenticated but WRONG role:
 *     API  → 403 JSON
 *     Page → HTTP 403 + render errors/403   ← NEVER redirect to /login
 *
 * - Correct role: calls next().
 *
 * Usage: authorize('Administrator', 'Manager')
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    // Unauthenticated (defensive — authenticate should have caught this)
    if (isApiRequest(req)) return res.status(401).json({ error: 'Not authenticated.' });
    return res.redirect('/login');
  }

  if (!roles.includes(req.user.role)) {
    // Authenticated but wrong role — never redirect to /login
    if (isApiRequest(req)) return res.status(403).json({ error: 'Access denied.' });
    return res.status(403).render('errors/403');
  }

  next();
};

module.exports = { authenticate, authorize };

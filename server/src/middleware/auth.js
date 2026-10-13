'use strict';
const jwt = require('jsonwebtoken');

/**
 * Verify the JWT stored in the httpOnly cookie "fl_token".
 * - API paths (/api/...) get a JSON 401 on failure (preserves existing API behaviour).
 * - Page paths redirect to /login on failure.
 * On success, attaches the same req.user shape as before:
 *   { id, role, employeeId }
 */
const authenticate = (req, res, next) => {
  const token = req.cookies && req.cookies.fl_token;
  const isApi = req.path.startsWith('/api/');

  if (!token) {
    if (isApi) return res.status(401).json({ error: 'No token provided.' });
    return res.redirect('/login');
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    if (isApi) return res.status(401).json({ error: 'Invalid or expired token.' });
    return res.redirect('/login');
  }
};

/**
 * Restrict access to specific roles.
 * Usage: authorize('Administrator', 'Manager')
 * - API paths return JSON 403.
 * - Page paths render the 403 error view with status 403.
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not authenticated.' });
    return res.redirect('/login');
  }
  if (!roles.includes(req.user.role)) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'Access denied.' });
    return res.status(403).render('errors/403');
  }
  next();
};

module.exports = { authenticate, authorize };

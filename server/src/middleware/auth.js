'use strict';
const jwt = require('jsonwebtoken');

/**
 * Determine whether a request is an API call.
 * Uses req.originalUrl (full URL) because req.path is router-relative.
 */
const isApiRequest = req => req.originalUrl.startsWith('/api/');

/**
 * authenticate
 *
 * 1. Reads the JWT from the httpOnly cookie "fl_token".
 * 2. Verifies the signature.
 * 3. Re-queries the database for the user record to catch deactivated / deleted accounts.
 * 4. Sets req.user = { id, role, employeeId } from the DATABASE row (not the token).
 *
 * On failure:
 *   API requests  → 401 JSON (no cookie cleared — client should handle)
 *   Page requests → clear cookie, flash message, redirect to /login
 */
const authenticate = async (req, res, next) => {
  const token = req.cookies && req.cookies.fl_token;
  const { setFlash } = require('./flash');

  const failPage = (msg) => {
    res.clearCookie('fl_token', { path: '/' });
    if (msg) setFlash(res, 'danger', msg);
    return res.redirect('/login');
  };

  if (!token) {
    if (isApiRequest(req)) return res.status(401).json({ error: 'No token provided.' });
    return res.redirect('/login');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    if (isApiRequest(req)) return res.status(401).json({ error: 'Invalid or expired token.' });
    return failPage('Your session has expired. Please log in again.');
  }

  // Re-query the database so deactivated/deleted users cannot use stale tokens.
  const { User, Role, Employee } = require('../models');
  const user = await User.findOne({
    where: { id: payload.id },
    include: [
      { model: Role,     as: 'role' },
      { model: Employee, as: 'employee', attributes: ['first_name', 'last_name', 'employee_id', 'profile_photo_url'] },
    ],
  });

  if (!user || user.is_deleted || user.status === 'inactive') {
    if (isApiRequest(req)) return res.status(401).json({ error: 'Account is inactive or deleted.' });
    return failPage('Your account has been deactivated. Contact an administrator.');
  }

  // Set req.user from the live database values (not stale token values).
  req.user = {
    id:         user.id,
    role:       user.role?.role_name ?? payload.role,
    employeeId: user.employee_id,
  };

  // Expose a display name for EJS views (sidebar avatar).
  // Prefer "First Last" from the linked employee; fall back to username.
  const empRecord = user.employee;
  res.locals.displayName = (empRecord && empRecord.first_name)
    ? `${empRecord.first_name} ${empRecord.last_name}`.trim()
    : user.username;

  // Expose the employee's profile photo URL so the sidebar can show it.
  // Null when no employee row or no photo uploaded yet.
  res.locals.profilePhotoEmployeeId = empRecord ? empRecord.employee_id : null;
  res.locals.profilePhotoUrl = (empRecord && empRecord.profile_photo_url) ? empRecord.profile_photo_url : null;

  next();
};

/**
 * authorize(...roles)
 *
 * Must be called after authenticate (so req.user is always set when this runs).
 *
 * - req.user missing: API → 401 JSON; Page → redirect to /login
 * - Wrong role: API → 403 JSON; Page → HTTP 403 + render errors/403 (NEVER redirect to /login)
 * - Correct role: calls next().
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    if (isApiRequest(req)) return res.status(401).json({ error: 'Not authenticated.' });
    return res.redirect('/login');
  }

  if (!roles.includes(req.user.role)) {
    if (isApiRequest(req)) return res.status(403).json({ error: 'Access denied.' });
    return res.status(403).render('errors/403');
  }

  next();
};

module.exports = { authenticate, authorize, isApiRequest };

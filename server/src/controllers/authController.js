'use strict';
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { Op }  = require('sequelize');
const { User, Employee, Role, Notification } = require('../models');
const { log }            = require('../lib/activityLog');
const { clearLoginLimit } = require('../middleware/rateLimit');
const { setFlash }        = require('../middleware/flash');

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_DASHBOARD = {
  Administrator: '/admin/dashboard',
  Manager:       '/manager/dashboard',
  Employee:      '/employee/dashboard',
};

/**
 * Set the JWT cookie. httpOnly + sameSite=lax always; secure only in production.
 * Lifetime matches JWT_EXPIRES_IN (default 8 h → 28800 s).
 */
const setTokenCookie = (res, token) => {
  const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
  // Parse "8h" / "1d" / raw-number-seconds into milliseconds
  const ms = (() => {
    if (typeof expiresIn === 'number') return expiresIn * 1000;
    const match = String(expiresIn).match(/^(\d+)([smhd])$/);
    if (!match) return 8 * 60 * 60 * 1000;
    const n = parseInt(match[1], 10);
    return { s: 1, m: 60, h: 3600, d: 86400 }[match[2]] * n * 1000;
  })();
  res.cookie('fl_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path:     '/',
    maxAge:   ms,
    secure:   process.env.NODE_ENV === 'production',
  });
};

// ── GET /login ────────────────────────────────────────────────────────────────
const loginForm = (req, res) => {
  // If already authenticated redirect to their dashboard
  const token = req.cookies && req.cookies.fl_token;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      const dest = ROLE_DASHBOARD[payload.role] || '/login';
      return res.redirect(dest);
    } catch { /* expired / invalid — fall through to render */ }
  }
  res.render('auth/login', { error: null, username: '' });
};

// ── POST /login ───────────────────────────────────────────────────────────────
const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).render('auth/login', {
      error: 'Username and password are required.',
      username: username || '',
    });
  }

  const user = await User.findOne({
    where: { username, is_deleted: false },
    include: [
      { model: Role,     as: 'role' },
      { model: Employee, as: 'employee' },
    ],
  });

  if (!user) {
    return res.status(401).render('auth/login', {
      error: 'Invalid credentials.',
      username,
    });
  }

  if (user.status === 'inactive') {
    return res.status(403).render('auth/login', {
      error: 'Account deactivated. Contact an administrator.',
      username,
    });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    await user.increment('failed_login_attempts');
    return res.status(401).render('auth/login', {
      error: 'Invalid credentials.',
      username,
    });
  }

  // Successful login
  await user.update({ last_login: new Date(), failed_login_attempts: 0 });
  clearLoginLimit(req.ip, username);
  await log(user.id, 'login', 'User logged in.', 'users', user.id);

  const payload = {
    id:         user.id,
    role:       user.role?.role_name,
    employeeId: user.employee_id,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  });

  setTokenCookie(res, token);

  const dest = ROLE_DASHBOARD[payload.role] || '/login';
  return res.redirect(dest);
};

// ── POST /logout ──────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  if (req.user) {
    await log(req.user.id, 'logout', 'User logged out.', 'users', req.user.id);
  }
  res.clearCookie('fl_token', { path: '/' });
  return res.redirect('/login');
};

// ── GET /forgot-password ──────────────────────────────────────────────────────
const forgotForm = (_req, res) => {
  res.render('auth/forgot', { error: null, result: null, username: '' });
};

// ── POST /forgot-password ─────────────────────────────────────────────────────
// Generates a random token, stores it plain in reset_token with a 1-hour expiry,
// and returns it in the response for thesis-demo purposes (same behaviour as before).
const forgot = async (req, res) => {
  const { username } = req.body;

  if (!username) {
    return res.status(400).render('auth/forgot', {
      error: 'Username is required.',
      result: null,
      username: '',
    });
  }

  const safeMsg = 'If that username exists, a reset token has been generated.';

  const user = await User.findOne({ where: { username, is_deleted: false } });
  if (!user) {
    // Always show the same message — prevents username enumeration
    return res.render('auth/forgot', {
      error: null,
      result: { message: safeMsg, demo_token: null, demo_note: null },
      username,
    });
  }

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await user.update({ reset_token: token, reset_expires: expires });
  await log(user.id, 'password_reset_request', 'Password reset requested.', 'users', user.id);

  // Only expose the raw token when running in demo mode.
  // In production (DEMO_RESET_TOKEN != 'true') the token is never returned
  // in the HTTP response — it would be emailed instead.
  const demoMode = process.env.DEMO_RESET_TOKEN === 'true';

  return res.render('auth/forgot', {
    error: null,
    result: {
      message:    safeMsg,
      demo_token: demoMode ? token : null,
      demo_note:  demoMode
        ? 'Demo mode: copy this token to use the reset form. Set DEMO_RESET_TOKEN=false in production.'
        : null,
    },
    username,
  });
};

// ── GET /reset-password ───────────────────────────────────────────────────────
const resetForm = (req, res) => {
  res.render('auth/reset', { error: null, success: false, token: req.query.token || '' });
};

// ── POST /reset-password ──────────────────────────────────────────────────────
const reset = async (req, res) => {
  const { token, new_password, confirm } = req.body;

  if (!token || !new_password) {
    return res.status(400).render('auth/reset', {
      error: 'Token and new password are required.',
      success: false,
      token: token || '',
    });
  }
  if (new_password.length < 8) {
    return res.status(400).render('auth/reset', {
      error: 'Password must be at least 8 characters.',
      success: false,
      token,
    });
  }
  if (confirm && new_password !== confirm) {
    return res.status(400).render('auth/reset', {
      error: 'Passwords do not match.',
      success: false,
      token,
    });
  }

  const user = await User.findOne({
    where: {
      reset_token:   token,
      reset_expires: { [Op.gt]: new Date() },
      is_deleted:    false,
    },
  });

  if (!user) {
    return res.status(400).render('auth/reset', {
      error: 'Invalid or expired reset token.',
      success: false,
      token,
    });
  }

  await user.update({
    password:              await bcrypt.hash(new_password, 10),
    reset_token:           null,
    reset_expires:         null,
    failed_login_attempts: 0,
  });
  await log(user.id, 'password_reset', 'Password was reset successfully.', 'users', user.id);

  setFlash(res, 'success', 'Password updated. You can now log in.');
  return res.redirect('/login');
};

// ── GET / — root redirect ─────────────────────────────────────────────────────
const rootRedirect = (req, res) => {
  const token = req.cookies && req.cookies.fl_token;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      return res.redirect(ROLE_DASHBOARD[payload.role] || '/login');
    } catch { /* fall through */ }
  }
  return res.redirect('/login');
};

module.exports = { loginForm, login, logout, forgotForm, forgot, resetForm, reset, rootRedirect };

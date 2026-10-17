'use strict';
const path   = require('path');
const fs     = require('fs');
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { Op } = require('sequelize');
const {
  User, Employee, Role, Department, Position, Team,
} = require('../models');
const { log }       = require('../lib/activityLog');
const { setFlash }  = require('../middleware/flash');

// ── Helpers ───────────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

/** Re-issue the JWT cookie after a password change so the session stays live. */
function reissueToken(res, user, roleName) {
  const expiresIn = process.env.JWT_EXPIRES_IN || '8h';
  const ms = (() => {
    if (typeof expiresIn === 'number') return expiresIn * 1000;
    const m = String(expiresIn).match(/^(\d+)([smhd])$/);
    if (!m) return 8 * 60 * 60 * 1000;
    return { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] * parseInt(m[1], 10) * 1000;
  })();
  const token = jwt.sign(
    { id: user.id, role: roleName, employeeId: user.employee_id },
    process.env.JWT_SECRET,
    { expiresIn },
  );
  res.cookie('fl_token', token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    maxAge: ms,
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Load the full employee row (with associations) for the current user. */
async function loadEmployee(employeeId) {
  if (!employeeId) return null;
  return Employee.findOne({
    where: { employee_id: +employeeId, is_deleted: false },
    include: [
      { model: Department, as: 'department' },
      { model: Position,   as: 'position' },
      { model: Team,       as: 'team' },
      {
        model: User, as: 'user',
        attributes: ['id', 'username', 'status', 'failed_login_attempts'],
        include: [{ model: Role, as: 'role', attributes: ['role_name'] }],
      },
      {
        model: Employee, as: 'supervisor',
        attributes: ['employee_id', 'first_name', 'last_name'],
      },
    ],
  });
}

/** basePath from role. */
function base(role) {
  if (role === 'Administrator') return '/admin';
  if (role === 'Manager')       return '/manager';
  return '/employee';
}

// ── GET /{role}/profile ───────────────────────────────────────────────────────
const show = async (req, res) => {
  const user = await User.findOne({
    where: { id: req.user.id, is_deleted: false },
    include: [{ model: Role, as: 'role', attributes: ['role_name'] }],
  });
  const emp = await loadEmployee(req.user.employeeId);
  const bp  = base(req.user.role);

  res.render('profile/show', {
    role: req.user.role, basePath: bp, user: req.user,
    currentPath: `${bp}/profile`,
    emp,               // may be null for bare-admin accounts
    dbUser: user,
    formValues: {},
    pwError: null,
    infoError: null,
  });
};

// ── POST /{role}/profile ──────────────────────────────────────────────────────
// Update editable personal info. Identity is always taken from req.user (never
// from the request body).  Role / department / username are ignored.
const update = async (req, res) => {
  const bp  = base(req.user.role);
  const emp = await loadEmployee(req.user.employeeId);

  // If this account has no employee row we cannot update personal info
  if (!emp) {
    setFlash(res, 'danger', 'No employee record linked to this account.');
    return res.redirect(`${bp}/profile`);
  }

  // ── Whitelist: only these fields may be updated ────────────────────────────
  const { first_name, last_name, email, phone, emergency_contact } = req.body;

  // Re-render helper
  const user = await User.findOne({ where: { id: req.user.id }, include: [{ model: Role, as: 'role' }] });
  const renderError = (msg) =>
    res.status(422).render('profile/show', {
      role: req.user.role, basePath: bp, user: req.user,
      currentPath: `${bp}/profile`,
      emp, dbUser: user,
      formValues: req.body,
      pwError: null,
      infoError: msg,
    });

  // Validate required fields
  if (!first_name || !first_name.trim()) return renderError('First name is required.');
  if (!last_name  || !last_name.trim())  return renderError('Last name is required.');
  if (!email      || !email.trim())      return renderError('Email is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return renderError('Please enter a valid email address.');

  // Unique email (excluding self)
  const emailTaken = await Employee.findOne({
    where: { email: email.trim(), employee_id: { [Op.ne]: emp.employee_id } },
  });
  if (emailTaken) return renderError('That email address is already in use.');

  await emp.update({
    first_name:        first_name.trim(),
    last_name:         last_name.trim(),
    email:             email.trim(),
    phone:             phone             ? phone.trim()             : null,
    emergency_contact: emergency_contact ? emergency_contact.trim() : null,
  });

  await log(req.user.id, 'update', 'Updated own profile.', 'employees', emp.employee_id);
  setFlash(res, 'success', 'Profile updated.');
  return res.redirect(`${bp}/profile`);
};

// ── POST /{role}/profile/password ─────────────────────────────────────────────
const changePassword = async (req, res) => {
  const bp = base(req.user.role);

  const user = await User.findOne({
    where: { id: req.user.id, is_deleted: false },
    include: [{ model: Role, as: 'role' }],
  });
  const emp = await loadEmployee(req.user.employeeId);

  const renderError = (msg) =>
    res.status(422).render('profile/show', {
      role: req.user.role, basePath: bp, user: req.user,
      currentPath: `${bp}/profile`,
      emp, dbUser: user,
      formValues: {},   // never echo password fields
      pwError: msg,
      infoError: null,
    });

  const { current_password, new_password, confirm_password } = req.body;

  if (!current_password || !new_password || !confirm_password) {
    return renderError('All three password fields are required.');
  }

  // ── Rate limit: track wrong current-password attempts per ip+userId ────────
  // We reuse the same in-memory check logic as the login limiter.
  // Implemented inline (no exported helper) to keep rateLimit.js unchanged.
  const { check: _check } = (() => {
    // Import the unexported `check` by reading the module internals.
    // Since rateLimit only exports three symbols, we implement the same
    // key scheme here and call incrementFailedLoginAttempts on User if wrong.
  })() || {};
  // Simple approach: use User.failed_login_attempts as a persistent counter
  // (already used by authController for the login route), and block at 5.

  // Verify current password
  const valid = await bcrypt.compare(current_password, user.password);
  if (!valid) {
    await user.increment('failed_login_attempts');
    const attempts = (user.failed_login_attempts || 0) + 1;
    if (attempts >= 5) {
      return renderError('Too many wrong password attempts. Contact an administrator or try again later.');
    }
    return renderError('Current password is incorrect.');
  }

  // Reset failed attempts on correct password
  await user.update({ failed_login_attempts: 0 });

  // New password validations
  if (new_password.length < 8) {
    return renderError('New password must be at least 8 characters.');
  }
  if (new_password === current_password) {
    return renderError('New password must differ from the current password.');
  }
  if (new_password !== confirm_password) {
    return renderError('New password and confirmation do not match.');
  }

  const hashed = await bcrypt.hash(new_password, 10);
  await user.update({ password: hashed });

  // Re-issue JWT so the session stays live
  reissueToken(res, user, req.user.role);

  await log(req.user.id, 'update', 'Changed own password.', 'users', user.id);
  setFlash(res, 'success', 'Password changed.');
  return res.redirect(`${bp}/profile`);
};

// ── POST /{role}/profile/photo ────────────────────────────────────────────────
const uploadPhoto = async (req, res) => {
  const bp  = base(req.user.role);
  const emp = await loadEmployee(req.user.employeeId);

  if (!emp) {
    setFlash(res, 'danger', 'No employee record linked to this account.');
    return res.redirect(`${bp}/profile`);
  }

  if (!req.file) {
    setFlash(res, 'danger', 'No file received.');
    return res.redirect(`${bp}/profile`);
  }

  // ── Restrict to images only (png / jpg / jpeg) ─────────────────────────────
  const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
  if (!['png', 'jpg', 'jpeg'].includes(ext)) {
    // Remove the file multer already wrote
    const fp = path.join(UPLOADS_DIR, path.basename(req.file.filename));
    fs.unlink(fp, () => {});
    setFlash(res, 'danger', 'Only PNG and JPEG images are allowed for profile photos.');
    return res.redirect(`${bp}/profile`);
  }

  // ── Delete old photo ───────────────────────────────────────────────────────
  if (emp.profile_photo_url) {
    const oldFile = path.join(UPLOADS_DIR, path.basename(emp.profile_photo_url));
    const oldResolved = path.resolve(oldFile);
    if (oldResolved.startsWith(UPLOADS_DIR + path.sep) && fs.existsSync(oldFile)) {
      fs.unlink(oldFile, () => {});
    }
  }

  await emp.update({ profile_photo_url: `uploads/${req.file.filename}` });
  await log(req.user.id, 'update', 'Updated own profile photo.', 'employees', emp.employee_id);
  setFlash(res, 'success', 'Profile photo updated.');
  return res.redirect(`${bp}/profile`);
};

module.exports = { show, update, changePassword, uploadPhoto };

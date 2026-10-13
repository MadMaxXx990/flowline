'use strict';
const router = require('express').Router();
const c      = require('../controllers/authController');
const { authenticate }               = require('../middleware/auth');
const { loginLimiter, forgotLimiter } = require('../middleware/rateLimit');

// ── Root redirect ─────────────────────────────────────────────────────────────
router.get('/', c.rootRedirect);

// ── Login ─────────────────────────────────────────────────────────────────────
router.get('/login',  c.loginForm);
router.post('/login', loginLimiter, c.login);

// ── Logout (POST only — state-changing) ───────────────────────────────────────
router.post('/logout', authenticate, c.logout);

// ── Forgot password ───────────────────────────────────────────────────────────
router.get('/forgot-password',  c.forgotForm);
router.post('/forgot-password', forgotLimiter, c.forgot);

// ── Reset password ────────────────────────────────────────────────────────────
router.get('/reset-password',  c.resetForm);
router.post('/reset-password', c.reset);

module.exports = router;

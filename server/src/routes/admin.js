'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');

// All admin routes require authentication and the Administrator role.
router.use(authenticate, authorize('Administrator'));

// ── Dashboard stub ────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.render('dashboard/index', {
    role:     'Administrator',
    basePath: '/admin',
    user:     req.user,
  });
});

module.exports = router;

'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');

// All manager routes require authentication and the Manager role.
router.use(authenticate, authorize('Manager'));

// ── Dashboard stub ────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.render('dashboard/index', {
    role:     'Manager',
    basePath: '/manager',
    user:     req.user,
  });
});

module.exports = router;

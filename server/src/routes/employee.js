'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');

// All employee routes require authentication and the Employee role.
router.use(authenticate, authorize('Employee'));

// ── Dashboard stub ────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.render('dashboard/index', {
    role:     'Employee',
    basePath: '/employee',
    user:     req.user,
  });
});

module.exports = router;

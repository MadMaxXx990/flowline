'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const taskC  = require('../controllers/taskController');

// All employee routes require authentication and the Employee role.
router.use(authenticate, authorize('Employee'));

// ── Dashboard stub ────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.render('dashboard/index', {
    role: 'Employee', basePath: '/employee', user: req.user,
    currentPath: '/employee/dashboard',
  });
});

// ── Tasks (read-only) ─────────────────────────────────────────────────────────
// Employees see only tasks assigned to them (enforced in taskController.board / taskController.show)
router.get('/tasks',      taskC.board);
router.get('/tasks/:id',  taskC.show);

module.exports = router;

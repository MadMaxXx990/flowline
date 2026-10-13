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

// ── Tasks (read-only board + workflow actions) ────────────────────────────────
// Employees see only tasks assigned to them (enforced in taskController.board / taskController.show)
router.get('/tasks',      taskC.board);
router.get('/tasks/:id',  taskC.show);
// ── Employee workflow actions (POST only) ─────────────────────────────────────
router.post('/tasks/:id/progress',    taskC.postProgress);
router.post('/tasks/:id/submit',      taskC.submitForReview);
router.post('/tasks/:id/comments',    taskC.addComment);
router.post('/tasks/:id/attachments', require('../middleware/upload').single('file'), taskC.uploadAttachment);

module.exports = router;

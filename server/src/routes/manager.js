'use strict';
const router  = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload  = require('../middleware/upload');
const taskC   = require('../controllers/taskController');

// All manager routes require authentication and the Manager role.
router.use(authenticate, authorize('Manager'));

// ── Dashboard stub ────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.render('dashboard/index', {
    role: 'Manager', basePath: '/manager', user: req.user,
    currentPath: '/manager/dashboard',
  });
});

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/tasks',            taskC.board);
router.get('/tasks/new',        taskC.newForm);
router.post('/tasks',           upload.array('attachments', 10), taskC.store);
router.get('/tasks/:id',        taskC.show);
router.get('/tasks/:id/edit',   taskC.editForm);
router.post('/tasks/:id',       taskC.update);   // ?_method=PUT
router.delete('/tasks/:id',     taskC.destroy);  // ?_method=DELETE

module.exports = router;

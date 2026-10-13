'use strict';
const router   = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload   = require('../middleware/upload');

const deptC = require('../controllers/departmentController');
const posC  = require('../controllers/positionController');
const teamC = require('../controllers/teamController');
const empC  = require('../controllers/employeeController');
const taskC = require('../controllers/taskController');
const attC  = require('../controllers/attachmentController');
const notifC = require('../controllers/notificationController');

// All admin routes require authentication and the Administrator role.
router.use(authenticate, authorize('Administrator'));

// ── Dashboard stub ────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.render('dashboard/index', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/dashboard',
  });
});

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications',             notifC.index);
router.post('/notifications/read-all',   notifC.markAllRead);
router.post('/notifications/:id/read',   notifC.markRead);

// ── Files ─────────────────────────────────────────────────────────────────────
router.get('/files', attC.filesIndex);

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/tasks',               taskC.board);
router.get('/tasks/new',           taskC.newForm);
router.post('/tasks',              upload.array('attachments', 10), taskC.store);
router.get('/tasks/:id',           taskC.show);
router.get('/tasks/:id/edit',      taskC.editForm);
router.post('/tasks/:id',          taskC.update);   // ?_method=PUT
router.delete('/tasks/:id',        taskC.destroy);  // ?_method=DELETE
// ── Task workflow actions (POST only) ─────────────────────────────────────────
router.post('/tasks/:id/stage',       taskC.changeStage);
router.post('/tasks/:id/approve',     taskC.approve);
router.post('/tasks/:id/comments',    taskC.addComment);
router.delete('/tasks/:id/comments/:cid', taskC.deleteComment);  // ?_method=DELETE
router.post('/tasks/:id/attachments', upload.single('file'), taskC.uploadAttachment);

// ── Departments ───────────────────────────────────────────────────────────────
router.get('/departments',          deptC.index);
router.post('/departments',         deptC.store);
router.post('/departments/:id',     deptC.update);
router.delete('/departments/:id',   deptC.destroy);

// ── Positions ─────────────────────────────────────────────────────────────────
router.get('/positions',          posC.index);
router.post('/positions',         posC.store);
router.post('/positions/:id',     posC.update);
router.delete('/positions/:id',   posC.destroy);

// ── Teams ─────────────────────────────────────────────────────────────────────
router.get('/teams',          teamC.index);
router.post('/teams',         teamC.store);
router.post('/teams/:id',     teamC.update);
router.delete('/teams/:id',   teamC.destroy);

// ── Employees ─────────────────────────────────────────────────────────────────
// Note: photo is on a shared route in index.js — available to all logged-in roles.

router.get('/employees',              empC.index);
router.get('/employees/new',          empC.newForm);
router.post('/employees',             upload.single('profile_photo'), empC.store);
router.get('/employees/:id',          empC.show);
router.get('/employees/:id/edit',     empC.editForm);
router.post('/employees/:id',         upload.single('profile_photo'), empC.update);
router.delete('/employees/:id',       empC.destroy);

module.exports = router;
module.exports.loadTeamsData = teamC.loadTeamsData;

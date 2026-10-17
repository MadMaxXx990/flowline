'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const taskC  = require('../controllers/taskController');
const attC   = require('../controllers/attachmentController');
const notifC = require('../controllers/notificationController');
const dashC  = require('../controllers/dashboardController');
const attnC  = require('../controllers/attendanceController');

// All employee routes require authentication and the Employee role.
router.use(authenticate, authorize('Employee'));
router.use(require('../middleware/unreadCount'));

// ── Profile ───────────────────────────────────────────────────────────────────
const profC  = require('../controllers/profileController');
const upload = require('../middleware/upload');
router.get('/profile',           profC.show);
router.post('/profile',          profC.update);
router.post('/profile/password', profC.changePassword);
router.post('/profile/photo',    upload.single('profile_photo'), profC.uploadPhoto);

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', dashC.employee);

// ── Attendance ────────────────────────────────────────────────────────────────
router.get('/attendance',           attnC.index);
router.post('/attendance/time-in',  attnC.timeIn);   // must be before /:id
router.post('/attendance/time-out', attnC.timeOut);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications',             notifC.index);
router.post('/notifications/read-all',   notifC.markAllRead);
router.post('/notifications/:id/read',   notifC.markRead);

// ── Files ─────────────────────────────────────────────────────────────────────
router.get('/files', attC.filesIndex);

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

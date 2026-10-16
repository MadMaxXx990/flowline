'use strict';
const router  = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload  = require('../middleware/upload');
const taskC   = require('../controllers/taskController');
const attC    = require('../controllers/attachmentController');
const notifC  = require('../controllers/notificationController');
const dashC   = require('../controllers/dashboardController');
const repC    = require('../controllers/reportsController');
const attnC   = require('../controllers/attendanceController');

// All manager routes require authentication and the Manager role.
router.use(authenticate, authorize('Manager'));
router.use(require('../middleware/unreadCount'));

// ── Dashboard ─────────────────────────────────────────────────────────────────
router.get('/dashboard', dashC.manager);

// ── Attendance ────────────────────────────────────────────────────────────────
router.get('/attendance',      attnC.index);
router.post('/attendance',     attnC.store);
router.post('/attendance/:id', attnC.update);  // ?_method=PUT

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports',              repC.index);
router.get('/reports/export/excel', repC.exportExcel);
router.get('/reports/export/pdf',   repC.exportPdf);

// ── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications',             notifC.index);
router.post('/notifications/read-all',   notifC.markAllRead);
router.post('/notifications/:id/read',   notifC.markRead);

// ── Files ─────────────────────────────────────────────────────────────────────
router.get('/files', attC.filesIndex);

// ── Tasks ─────────────────────────────────────────────────────────────────────
router.get('/tasks',            taskC.board);
router.get('/tasks/new',        taskC.newForm);   // must be before /:id
router.post('/tasks',           upload.array('attachments', 10), taskC.store);
router.get('/tasks/:id',        taskC.show);
router.get('/tasks/:id/edit',   taskC.editForm);
router.post('/tasks/:id',       taskC.update);   // ?_method=PUT
router.delete('/tasks/:id',     taskC.destroy);  // ?_method=DELETE
// ── Task workflow actions (POST only) ─────────────────────────────────────────
router.post('/tasks/:id/stage',       taskC.changeStage);
router.post('/tasks/:id/approve',     taskC.approve);
router.post('/tasks/:id/comments',    taskC.addComment);
router.delete('/tasks/:id/comments/:cid', taskC.deleteComment);  // ?_method=DELETE
router.post('/tasks/:id/attachments', upload.single('file'), taskC.uploadAttachment);

module.exports = router;

'use strict';
const router   = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const upload   = require('../middleware/upload');

const deptC = require('../controllers/departmentController');
const posC  = require('../controllers/positionController');
const teamC = require('../controllers/teamController');
const empC  = require('../controllers/employeeController');

// All admin routes require authentication and the Administrator role.
router.use(authenticate, authorize('Administrator'));

// ── Dashboard stub ────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  res.render('dashboard/index', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/dashboard',
  });
});

// ── Departments ───────────────────────────────────────────────────────────────
router.get('/departments',          deptC.index);
router.post('/departments',         deptC.store);
router.post('/departments/:id',     deptC.update);   // ?_method=PUT via method-override
router.delete('/departments/:id',   deptC.destroy);  // ?_method=DELETE

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
// Photo route: any authenticated user may view; guard is just authenticate (already applied above)
router.get('/employees/:id/photo', empC.photo);

router.get('/employees',              empC.index);
router.get('/employees/new',          empC.newForm);
router.post('/employees',             upload.single('profile_photo'), empC.store);
router.get('/employees/:id',          empC.show);
router.get('/employees/:id/edit',     empC.editForm);
router.post('/employees/:id',         upload.single('profile_photo'), empC.update);   // ?_method=PUT
router.delete('/employees/:id',       empC.destroy);  // ?_method=DELETE

module.exports = router;
// Export loadTeamsData so the task form can reuse it without a HTTP round-trip
module.exports.loadTeamsData = teamC.loadTeamsData;

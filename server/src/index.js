require('dotenv').config();

// ── Startup checks ────────────────────────────────────────────────────────────
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error(
    'FATAL: JWT_SECRET is missing or shorter than 32 characters.\n' +
    'Set a strong JWT_SECRET (32+ characters) in server/.env and restart.'
  );
  process.exit(1);
}

const express        = require('express');
const helmet         = require('helmet');
const morgan         = require('morgan');
const path           = require('path');
const cookieParser   = require('cookie-parser');
const methodOverride = require('method-override');
const { flashMiddleware } = require('./middleware/flash');

const app = express();

// ── View engine (EJS) ─────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'"],
      imgSrc:      ["'self'", 'data:'],
      fontSrc:     ["'self'", 'data:'],
      formAction:  ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET));
app.use(methodOverride('_method'));
app.use(flashMiddleware);
// Unread notification count — runs after authenticate sets req.user
app.use(require('./middleware/unreadCount'));

// ── Static assets ─────────────────────────────────────────────────────────────
// Serve our own CSS/JS from public/
app.use(express.static(path.join(__dirname, 'public')));
// Serve installed npm packages for Bootstrap, Bootstrap Icons and Chart.js
app.use('/vendor/bootstrap',        express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap', 'dist')));
app.use('/vendor/bootstrap-icons',  express.static(path.join(__dirname, '..', 'node_modules', 'bootstrap-icons', 'font')));
app.use('/vendor/chart.js',         express.static(path.join(__dirname, '..', 'node_modules', 'chart.js', 'dist')));

// ── Shared authenticated routes (any logged-in role) ─────────────────────────
// Profile photo — available to any authenticated user, no role restriction
app.get('/employees/:id/photo', require('./middleware/auth').authenticate, require('./controllers/employeeController').photo);
// Attachments are served through the authenticated /attachments/:id/download route
app.get('/attachments/:id/download', require('./middleware/auth').authenticate, require('./controllers/attachmentController').download);

// ── Page routes (EJS) ─────────────────────────────────────────────────────────
app.use('/',          require('./routes/auth'));
app.use('/admin',     require('./routes/admin'));
app.use('/manager',   require('./routes/manager'));
app.use('/employee',  require('./routes/employee'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ── 404 — API paths return JSON; page paths render the 404 view ───────────────
app.use((req, res) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route not found' });
  }
  return res.status(404).render('errors/404');
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const { runOverdueJob } = require('./jobs/overdueJob');
const overdueIntervalMs = (parseInt(process.env.OVERDUE_CHECK_MINUTES) || 15) * 60 * 1000;

// ── Sequelize model startup check (read-only — never alters tables) ───────────
const {
  sequelize,
  Role, Department, Position, Team, Employee, User,
  WorkflowStage, TaskPriority, Task, TaskAssignment, TaskUpdate,
  TaskStageHistory, TaskComment, Approval, Attachment,
  Notification, Attendance, ActivityLog,
} = require('./models');

async function checkModels() {
  try {
    await sequelize.authenticate();
    console.log('[Sequelize] Connection established.');

    const checks = [
      ['roles',              () => Role.findOne()],
      ['departments',        () => Department.findOne()],
      ['positions',          () => Position.findOne()],
      ['teams',              () => Team.findOne()],
      ['employees',          () => Employee.findOne()],
      ['users',              () => User.findOne()],
      ['workflow_stages',    () => WorkflowStage.findOne()],
      ['task_priorities',    () => TaskPriority.findOne()],
      ['tasks',              () => Task.findOne()],
      ['task_assignments',   () => TaskAssignment.findOne()],
      ['task_updates',       () => TaskUpdate.findOne()],
      ['task_stage_history', () => TaskStageHistory.findOne()],
      ['task_comments',      () => TaskComment.findOne()],
      ['approvals',          () => Approval.findOne()],
      ['attachments',        () => Attachment.findOne()],
      ['notifications',      () => Notification.findOne()],
      ['attendance',         () => Attendance.findOne()],
      ['activity_logs',      () => ActivityLog.findOne()],
    ];

    for (const [table, query] of checks) {
      await query();
      console.log(`[Sequelize] ✓ ${table}`);
    }
    console.log('[Sequelize] All 18 models OK.');
  } catch (err) {
    console.error('[Sequelize] Startup check failed:', err.message);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Flowline API running on http://localhost:${PORT}`);
  runOverdueJob();
  setInterval(runOverdueJob, overdueIntervalMs);
  checkModels();
});

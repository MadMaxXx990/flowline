'use strict';
const { Op, fn, col, literal } = require('sequelize');
const {
  Task, TaskAssignment, TaskStageHistory,
  WorkflowStage, TaskPriority, Department,
  Employee, User, Attendance, Notification,
} = require('../models');
const { localDateStr, startOfLocalDay } = require('../lib/dates');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Return the start of today (midnight, server local time) */
function startOfToday() { return startOfLocalDay(); }

/** Build a 7-day completions array (aggregate, not row-scan) */
async function weeklyCompletions(taskWhere, completedId) {
  const sevenAgo = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 6); sevenAgo.setHours(0, 0, 0, 0);

  // Load only updated_at timestamps in range — small result set
  const rows = await Task.findAll({
    where: { ...taskWhere, stage_id: completedId, updated_at: { [Op.gte]: sevenAgo } },
    attributes: ['updated_at'],
    raw: true,
  });
  const map = {};
  rows.forEach(r => {
    const key = localDateStr(new Date(r.updated_at));  // local date of completion
    map[key] = (map[key] || 0) + 1;
  });
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const key = localDateStr(d);  // local date key — matches the grouping above
    return { date: key, label: d.toLocaleDateString('en', { weekday: 'short' }), count: map[key] || 0 };
  });
}

// ── ADMINISTRATOR ─────────────────────────────────────────────────────────────
const admin = async (req, res) => {
  const taskWhere = { is_deleted: false };

  const [completedStage, forReviewStage] = await Promise.all([
    WorkflowStage.findOne({ where: { stage_name: 'Completed'  } }),
    WorkflowStage.findOne({ where: { stage_name: 'For Review' } }),
  ]);
  const completedId  = completedStage?.stage_id;
  const forReviewId  = forReviewStage?.stage_id;

  // Stage counts (one query per stage — small fixed set)
  const stages = await WorkflowStage.findAll({ order: [['step_order', 'ASC']] });
  const stageCounts = await Promise.all(stages.map(async s => ({
    stage: s.stage_name,
    count: await Task.count({ where: { ...taskWhere, stage_id: s.stage_id } }),
  })));

  const totalTasks     = stageCounts.reduce((a, s) => a + s.count, 0);
  const completedCount = stageCounts.find(s => s.stage === 'Completed')?.count ?? 0;
  const overdueCount   = await Task.count({ where: { ...taskWhere, due_date: { [Op.lt]: new Date() }, stage_id: { [Op.ne]: completedId } } });

  // Priority counts
  const priorities = await TaskPriority.findAll({ order: [['priority_id', 'ASC']] });
  const priorityCounts = await Promise.all(priorities.map(async p => ({
    priority: p.priority_name,
    count: await Task.count({ where: { ...taskWhere, priority_id: p.priority_id } }),
  })));

  // Department task counts (via assignments join)
  const departments = await Department.findAll({ where: { is_deleted: false }, order: [['department_name', 'ASC']] });
  const deptCounts = await Promise.all(departments.map(async d => {
    const count = await Task.count({
      where: { ...taskWhere },
      include: [{ model: TaskAssignment, as: 'assignments', required: true,
        include: [{ model: Employee, as: 'employee', where: { department_id: d.department_id }, required: true }] }],
    });
    return { department: d.department_name, count };
  }));

  // Admin extras
  const [totalEmployees, presentToday, forReviewCount] = await Promise.all([
    Employee.count({ where: { is_deleted: false } }),
    Attendance.count({ where: { date: localDateStr(), attendance_status: 'Present' } }),
    Task.count({ where: { ...taskWhere, stage_id: forReviewId } }),
  ]);

  // Weekly chart + recent tasks
  const [weeklyChart, recentTasks] = await Promise.all([
    weeklyCompletions(taskWhere, completedId),
    Task.findAll({
      where: taskWhere,
      include: [{ model: WorkflowStage, as: 'stage' }, { model: TaskPriority, as: 'priority' },
        { model: TaskAssignment, as: 'assignments', include: [{ model: Employee, as: 'employee' }], limit: 3 }],
      order: [['created_at', 'DESC']], limit: 6,
    }),
  ]);

  res.render('dashboard/admin', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/dashboard',
    totalTasks, completedCount, overdueCount, forReviewCount,
    totalEmployees, presentToday,
    stageCounts, priorityCounts, deptCounts,
    weeklyChart, recentTasks,
  });
};

// ── MANAGER ───────────────────────────────────────────────────────────────────
const manager = async (req, res) => {
  const taskWhere = { is_deleted: false, created_by_user_id: req.user.id };

  const [completedStage, forReviewStage] = await Promise.all([
    WorkflowStage.findOne({ where: { stage_name: 'Completed'  } }),
    WorkflowStage.findOne({ where: { stage_name: 'For Review' } }),
  ]);
  const completedId = completedStage?.stage_id;
  const forReviewId = forReviewStage?.stage_id;

  const stages = await WorkflowStage.findAll({ order: [['step_order', 'ASC']] });
  const stageCounts = await Promise.all(stages.map(async s => ({
    stage: s.stage_name,
    count: await Task.count({ where: { ...taskWhere, stage_id: s.stage_id } }),
  })));

  const totalTasks     = stageCounts.reduce((a, s) => a + s.count, 0);
  const completedCount = stageCounts.find(s => s.stage === 'Completed')?.count ?? 0;
  const overdueCount   = await Task.count({ where: { ...taskWhere, due_date: { [Op.lt]: new Date() }, stage_id: { [Op.ne]: completedId } } });
  const pendingApproval = await Task.count({ where: { ...taskWhere, stage_id: forReviewId } });

  const [weeklyChart, recentTasks] = await Promise.all([
    weeklyCompletions(taskWhere, completedId),
    Task.findAll({
      where: taskWhere,
      include: [{ model: WorkflowStage, as: 'stage' }, { model: TaskPriority, as: 'priority' },
        { model: TaskAssignment, as: 'assignments', include: [{ model: Employee, as: 'employee' }], limit: 3 }],
      order: [['created_at', 'DESC']], limit: 6,
    }),
  ]);

  res.render('dashboard/manager', {
    role: 'Manager', basePath: '/manager', user: req.user,
    currentPath: '/manager/dashboard',
    totalTasks, completedCount, overdueCount, pendingApproval,
    stageCounts, weeklyChart, recentTasks,
  });
};

// ── EMPLOYEE ──────────────────────────────────────────────────────────────────
const employee = async (req, res) => {
  const empId = +req.user.employeeId;
  const taskWhere = { is_deleted: false, '$assignments.employee_id$': empId };

  const [completedStage] = await Promise.all([
    WorkflowStage.findOne({ where: { stage_name: 'Completed' } }),
  ]);
  const completedId = completedStage?.stage_id;

  const stages = await WorkflowStage.findAll({ order: [['step_order', 'ASC']] });
  const stageCounts = await Promise.all(stages.map(async s => ({
    stage: s.stage_name,
    count: await Task.count({
      where: { is_deleted: false, stage_id: s.stage_id },
      include: [{ model: TaskAssignment, as: 'assignments', where: { employee_id: empId }, required: true }],
    }),
  })));

  const totalTasks     = stageCounts.reduce((a, s) => a + s.count, 0);
  const completedCount = stageCounts.find(s => s.stage === 'Completed')?.count ?? 0;

  const now = new Date();
  const sevenAhead = new Date(); sevenAhead.setDate(sevenAhead.getDate() + 7);

  const [overdueCount, dueSoonCount] = await Promise.all([
    Task.count({
      where: { is_deleted: false, due_date: { [Op.lt]: now }, stage_id: { [Op.ne]: completedId } },
      include: [{ model: TaskAssignment, as: 'assignments', where: { employee_id: empId }, required: true }],
    }),
    Task.count({
      where: { is_deleted: false, due_date: { [Op.between]: [now, sevenAhead] }, stage_id: { [Op.ne]: completedId } },
      include: [{ model: TaskAssignment, as: 'assignments', where: { employee_id: empId }, required: true }],
    }),
  ]);

  const recentNotifications = await Notification.findAll({
    where: { user_id: req.user.id },
    order: [['created_at', 'DESC']],
    limit: 5,
  });

  res.render('dashboard/employee', {
    role: 'Employee', basePath: '/employee', user: req.user,
    currentPath: '/employee/dashboard',
    totalTasks, completedCount, overdueCount, dueSoonCount,
    stageCounts, recentNotifications,
  });
};

module.exports = { admin, manager, employee };

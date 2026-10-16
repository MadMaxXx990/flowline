'use strict';
const { Op } = require('sequelize');
const {
  Task, TaskAssignment, TaskPriority, WorkflowStage,
  Employee, Department, Team, Attendance,
} = require('../models');
const { localDateStr, startOfLocalDay, endOfLocalDay, parseLocalDate } = require('../lib/dates');
const {
  completionRate, enrichPerformanceRow, sortPerformanceRows,
  paginate, buildStageCounts, buildPriorityCounts,
} = require('../lib/reportMetrics');
const { buildExcel, buildPdf } = require('../lib/reportExports');

const PAGE_SIZE = 20;

// ── Sanitise cell values to prevent formula injection ─────────────────────────
const FORMULA_START = /^[=+\-@]/;
function safe(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return FORMULA_START.test(s) ? "'" + s : s;
}

// ── Shared data-gathering function ───────────────────────────────────────────
async function buildReportData(req) {
  const { date_from, date_to, department_id, team_id, stage_id, priority_id, employee_id } = req.query;

  const from = parseLocalDate(date_from) || startOfLocalDay(new Date(new Date().setDate(1)));
  const to   = parseLocalDate(date_to)   ? endOfLocalDay(parseLocalDate(date_to)) : endOfLocalDay();

  const taskWhere = { is_deleted: false, created_at: { [Op.between]: [from, to] } };
  if (req.user.role === 'Manager') taskWhere.created_by_user_id = req.user.id;
  if (stage_id)    taskWhere.stage_id    = +stage_id;
  if (priority_id) taskWhere.priority_id = +priority_id;

  const assignmentInclude = employee_id
    ? [{ model: TaskAssignment, as: 'assignments', where: { employee_id: +employee_id }, required: true }]
    : [];

  const [completedStage, stages, priorities] = await Promise.all([
    WorkflowStage.findOne({ where: { stage_name: 'Completed' } }),
    WorkflowStage.findAll({ order: [['step_order', 'ASC']] }),
    TaskPriority.findAll({ order: [['priority_id', 'ASC']] }),
  ]);
  const completedId = completedStage?.stage_id;

  const [totalTasks, completedTasks, overdueTasks] = await Promise.all([
    Task.count({ where: taskWhere, include: assignmentInclude }),
    Task.count({ where: { ...taskWhere, stage_id: completedId }, include: assignmentInclude }),
    Task.count({ where: { ...taskWhere, due_date: { [Op.lt]: new Date() }, stage_id: { [Op.ne]: completedId } }, include: assignmentInclude }),
  ]);

  // Stage counts + priority counts using parallel queries
  const [stageCntRaw, priorityCntRaw] = await Promise.all([
    Promise.all(stages.map(s =>
      Task.count({ where: { ...taskWhere, stage_id: s.stage_id }, include: assignmentInclude })
    )),
    Promise.all(priorities.map(p =>
      Task.count({ where: { ...taskWhere, priority_id: p.priority_id }, include: assignmentInclude })
    )),
  ]);

  const stageCounts    = buildStageCounts(stages, stageCntRaw);
  const priorityCounts = buildPriorityCounts(priorities, priorityCntRaw);

  // Employee performance
  const empWhere = { is_deleted: false };
  if (department_id) empWhere.department_id = +department_id;
  if (team_id)       empWhere.team_id       = +team_id;
  if (employee_id)   empWhere.employee_id   = +employee_id;

  const employees = await Employee.findAll({
    where: empWhere,
    include: [{ model: Department, as: 'department' }],
    order: [['last_name', 'ASC'], ['first_name', 'ASC']],
  });

  const rawPerf = await Promise.all(employees.map(async emp => {
    const empTaskWhere = { is_deleted: false, created_at: { [Op.between]: [from, to] } };
    if (req.user.role === 'Manager') empTaskWhere.created_by_user_id = req.user.id;
    const empAssign = [{ model: TaskAssignment, as: 'assignments', where: { employee_id: emp.employee_id }, required: true }];
    const [assigned, completed, overdue] = await Promise.all([
      Task.count({ where: empTaskWhere, include: empAssign }),
      Task.count({ where: { ...empTaskWhere, stage_id: completedId }, include: empAssign }),
      Task.count({ where: { ...empTaskWhere, due_date: { [Op.lt]: new Date() }, stage_id: { [Op.ne]: completedId } }, include: empAssign }),
    ]);
    return enrichPerformanceRow({ employee: emp, assigned, completed, overdue });
  }));

  const performance = sortPerformanceRows(rawPerf);

  // Attendance summary
  const attEmpIds = employees.map(e => e.employee_id);
  const attWhere  = { date: { [Op.between]: [from, to] } };
  if (attEmpIds.length > 0) attWhere.employee_id = { [Op.in]: attEmpIds };

  const { sequelize } = require('../models');
  const attSummary = await Attendance.findAll({
    attributes: ['attendance_status', [sequelize.fn('COUNT', sequelize.col('attendance_id')), 'cnt']],
    where: attWhere,
    group: ['attendance_status'],
    raw: true,
  });

  return {
    totalTasks, completedTasks, overdueTasks,
    completionRate: completionRate(completedTasks, totalTasks),
    stageCounts, priorityCounts, performance, attSummary,
    dateFrom: localDateStr(from),
    dateTo:   localDateStr(to),
  };
}

// ── GET /{role}/reports ───────────────────────────────────────────────────────
const index = async (req, res) => {
  const page     = Math.max(1, +req.query.page || 1);
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';

  const [departments, teams, stages, priorities, employees] = await Promise.all([
    Department.findAll({ where: { is_deleted: false }, order: [['department_name', 'ASC']] }),
    Team.findAll({ where: { is_deleted: false }, order: [['team_name', 'ASC']] }),
    WorkflowStage.findAll({ order: [['step_order', 'ASC']] }),
    TaskPriority.findAll({ order: [['priority_id', 'ASC']] }),
    Employee.findAll({ where: { is_deleted: false }, attributes: ['employee_id', 'first_name', 'last_name'], order: [['first_name', 'ASC']] }),
  ]);

  const data = await buildReportData(req);

  const { slice: perfPage, total: perfTotal, pages: perfPages } =
    paginate(data.performance, page, PAGE_SIZE);

  res.render('reports/index', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/reports`,
    departments, teams, stages, priorities, employees,
    query: {
      date_from:     req.query.date_from     || '',
      date_to:       req.query.date_to       || '',
      department_id: req.query.department_id || '',
      team_id:       req.query.team_id       || '',
      stage_id:      req.query.stage_id      || '',
      priority_id:   req.query.priority_id   || '',
      employee_id:   req.query.employee_id   || '',
    },
    ...data,
    performance: perfPage,
    perfTotal,
    perfPages,
    perfPage: page,
  });
};

// ── GET /{role}/reports/export/excel ─────────────────────────────────────────
const exportExcel = async (req, res) => {
  const data     = await buildReportData(req);
  const filename = `flowline-report-${data.dateFrom}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await buildExcel(data, safe, res);
  res.end();
};

// ── GET /{role}/reports/export/pdf ───────────────────────────────────────────
const exportPdf = async (req, res) => {
  const data     = await buildReportData(req);
  const filename = `flowline-report-${data.dateFrom}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  buildPdf(data, res);
};

module.exports = { index, exportExcel, exportPdf };

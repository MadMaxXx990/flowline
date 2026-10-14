'use strict';
const { Op } = require('sequelize');
const ExcelJS = require('exceljs');
const {
  Task, TaskAssignment, TaskPriority, WorkflowStage,
  Employee, Department, Team, Attendance,
} = require('../models');

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

  const from = date_from ? new Date(date_from) : new Date(new Date().setDate(1));
  const to   = date_to   ? new Date(date_to)   : new Date();
  to.setHours(23, 59, 59, 999);

  // Base task scope
  const taskWhere = { is_deleted: false, created_at: { [Op.between]: [from, to] } };
  if (req.user.role === 'Manager') taskWhere.created_by_user_id = req.user.id;
  if (stage_id)    taskWhere.stage_id    = +stage_id;
  if (priority_id) taskWhere.priority_id = +priority_id;

  // employee_id filter: tasks assigned to this employee
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
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  // Stage counts
  const stageCounts = await Promise.all(stages.map(async s => ({
    stage: s.stage_name,
    count: await Task.count({ where: { ...taskWhere, stage_id: s.stage_id }, include: assignmentInclude }),
  })));

  // Priority counts
  const priorityCounts = await Promise.all(priorities.map(async p => ({
    priority: p.priority_name,
    count: await Task.count({ where: { ...taskWhere, priority_id: p.priority_id }, include: assignmentInclude }),
  })));

  // Employee performance — single loop, uses Sequelize counts (not N+1 full scans)
  const empWhere = { is_deleted: false };
  if (department_id) empWhere.department_id = +department_id;
  if (team_id)       empWhere.team_id        = +team_id;

  const employees = await Employee.findAll({
    where: empWhere,
    include: [{ model: Department, as: 'department' }],
    order: [['last_name', 'ASC'], ['first_name', 'ASC']],
  });

  const performance = await Promise.all(employees.map(async emp => {
    const empTaskWhere = { is_deleted: false, created_at: { [Op.between]: [from, to] } };
    if (req.user.role === 'Manager') empTaskWhere.created_by_user_id = req.user.id;
    const empAssign = [{ model: TaskAssignment, as: 'assignments', where: { employee_id: emp.employee_id }, required: true }];
    const [assigned, completed, overdue] = await Promise.all([
      Task.count({ where: empTaskWhere,                                           include: empAssign }),
      Task.count({ where: { ...empTaskWhere, stage_id: completedId },             include: empAssign }),
      Task.count({ where: { ...empTaskWhere, due_date: { [Op.lt]: new Date() }, stage_id: { [Op.ne]: completedId } }, include: empAssign }),
    ]);
    return { employee: emp, assigned, completed, overdue,
      completion_rate: assigned > 0 ? Math.round((completed / assigned) * 100) : 0 };
  }));
  performance.sort((a, b) => b.completion_rate - a.completion_rate);

  // Attendance summary (all employees in scope, within date range)
  const { sequelize } = require('../models');
  const attSummary = await require('../models').Attendance.findAll({
    attributes: ['attendance_status', [sequelize.fn('COUNT', sequelize.col('attendance_id')), 'cnt']],
    where: { date: { [Op.between]: [from, to] } },
    group: ['attendance_status'],
    raw: true,
  });

  return {
    totalTasks, completedTasks, overdueTasks, completionRate,
    stageCounts, priorityCounts, performance, attSummary,
    dateFrom: from.toISOString().split('T')[0],
    dateTo:   to.toISOString().split('T')[0],
  };
}

// ── GET /{role}/reports ───────────────────────────────────────────────────────
const index = async (req, res) => {
  const page   = Math.max(1, +req.query.page || 1);
  const offset = (page - 1) * PAGE_SIZE;
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';

  // Load filter options
  const [departments, teams, stages, priorities, employees] = await Promise.all([
    Department.findAll({ where: { is_deleted: false }, order: [['department_name', 'ASC']] }),
    Team.findAll({ where: { is_deleted: false }, order: [['team_name', 'ASC']] }),
    WorkflowStage.findAll({ order: [['step_order', 'ASC']] }),
    TaskPriority.findAll({ order: [['priority_id', 'ASC']] }),
    Employee.findAll({ where: { is_deleted: false }, attributes: ['employee_id', 'first_name', 'last_name'], order: [['first_name', 'ASC']] }),
  ]);

  const data = await buildReportData(req);

  // Paginate employee performance
  const totalEmps = data.performance.length;
  const perfPage  = data.performance.slice(offset, offset + PAGE_SIZE);

  res.render('reports/index', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/reports`,
    departments, teams, stages, priorities, employees,
    query: {
      date_from:   req.query.date_from   || '',
      date_to:     req.query.date_to     || '',
      department_id: req.query.department_id || '',
      team_id:     req.query.team_id     || '',
      stage_id:    req.query.stage_id    || '',
      priority_id: req.query.priority_id || '',
      employee_id: req.query.employee_id || '',
    },
    ...data,
    performance: perfPage,
    perfTotal: totalEmps,
    perfPages: Math.ceil(totalEmps / PAGE_SIZE),
    perfPage:  page,
  });
};

// ── GET /{role}/reports/export/excel ─────────────────────────────────────────
const exportExcel = async (req, res) => {
  const data = await buildReportData(req);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flowline';
  wb.created = new Date();

  // Summary sheet
  const sum = wb.addWorksheet('Summary');
  sum.addRow(['Flowline — Performance Report']);
  sum.addRow(['Period', `${data.dateFrom} to ${data.dateTo}`]);
  sum.addRow([]);
  sum.addRow(['Metric', 'Value']);
  sum.addRows([
    ['Total Tasks',       data.totalTasks],
    ['Completed',         data.completedTasks],
    ['Overdue',           data.overdueTasks],
    ['Completion Rate',   `${data.completionRate}%`],
  ]);
  sum.addRow([]);
  sum.addRow(['Stage', 'Count']);
  data.stageCounts.forEach(s => sum.addRow([safe(s.stage), s.count]));
  sum.addRow([]);
  sum.addRow(['Priority', 'Count']);
  data.priorityCounts.forEach(p => sum.addRow([safe(p.priority), p.count]));

  // Employee performance sheet
  const perf = wb.addWorksheet('Employee Performance');
  perf.addRow(['Employee', 'Department', 'Assigned', 'Completed', 'Overdue', 'Rate %']);
  data.performance.forEach(r => perf.addRow([
    safe(`${r.employee.first_name} ${r.employee.last_name}`),
    safe(r.employee.department?.department_name ?? ''),
    r.assigned, r.completed, r.overdue, r.completion_rate,
  ]));

  // Attendance sheet
  const att = wb.addWorksheet('Attendance');
  att.addRow(['Status', 'Count']);
  data.attSummary.forEach(a => att.addRow([safe(a.attendance_status), +a.cnt]));

  const filename = `flowline-report-${data.dateFrom}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
};

module.exports = { index, exportExcel };

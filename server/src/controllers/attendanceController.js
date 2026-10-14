'use strict';
const { Op } = require('sequelize');
const { Attendance, Employee, Department } = require('../models');
const { log }      = require('../lib/activityLog');
const { setFlash } = require('../middleware/flash');

const PAGE_SIZE = 20;

/** Return YYYY-MM-DD string for today (server local time) */
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

/** HH:MM string for the current time */
function nowTime() {
  const n = new Date();
  return `${n.getHours().toString().padStart(2,'0')}:${n.getMinutes().toString().padStart(2,'0')}`;
}

// ── LIST ──────────────────────────────────────────────────────────────────────
// Admin/Manager: all employees (with optional filters)
// Employee: own records only
const index = async (req, res) => {
  const { employee_id, from, to, attendance_status, page: qPage } = req.query;
  const page   = Math.max(1, +qPage || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = {};
  if (req.user.role === 'Employee') {
    where.employee_id = +req.user.employeeId;
  } else if (employee_id) {
    where.employee_id = +employee_id;
  }
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;   // stored as DATEONLY string
    if (to)   where.date[Op.lte] = to;
  }
  if (attendance_status) where.attendance_status = attendance_status;

  const { count, rows } = await Attendance.findAndCountAll({
    where,
    include: [{ model: Employee, as: 'employee', include: [{ model: Department, as: 'department' }] }],
    order:  [['date', 'DESC']],
    limit:  PAGE_SIZE,
    offset,
  });

  // For Admin/Manager filter dropdown
  const employees = req.user.role !== 'Employee'
    ? await Employee.findAll({ where: { is_deleted: false }, attributes: ['employee_id', 'first_name', 'last_name'], order: [['first_name', 'ASC']] })
    : [];

  // Today's own record (needed for Employee time-in/out buttons)
  let todayRecord = null;
  if (req.user.role === 'Employee') {
    todayRecord = await Attendance.findOne({
      where: { employee_id: +req.user.employeeId, date: todayStr() },
    }) || null;
  }

  const basePath = req.user.role === 'Administrator' ? '/admin'
                 : req.user.role === 'Manager'       ? '/manager'
                 : '/employee';

  res.render('attendance/index', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/attendance`,
    records: rows, total: count,
    pages: Math.ceil(count / PAGE_SIZE), page,
    employees, todayRecord,
    query: {
      employee_id:       employee_id       || '',
      from:              from              || '',
      to:                to                || '',
      attendance_status: attendance_status || '',
    },
  });
};

// ── CREATE (Admin / Manager) ──────────────────────────────────────────────────
const store = async (req, res) => {
  const { employee_id, date, time_in, time_out, attendance_status } = req.body;
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';

  if (!employee_id || !date || !attendance_status) {
    setFlash(res, 'danger', 'Employee, date and status are required.');
    return res.redirect(`${basePath}/attendance`);
  }

  const exists = await Attendance.findOne({
    where: { employee_id: +employee_id, date },
  });
  if (exists) {
    setFlash(res, 'danger', 'An attendance record already exists for this employee on that date.');
    return res.redirect(`${basePath}/attendance`);
  }

  const rec = await Attendance.create({
    employee_id:       +employee_id,
    date,
    time_in:           time_in           || null,
    time_out:          time_out          || null,
    attendance_status,
  });
  await log(req.user.id, 'create', `Logged attendance for employee ${employee_id}`, 'attendance', rec.attendance_id);
  setFlash(res, 'success', 'Attendance record created.');
  return res.redirect(`${basePath}/attendance`);
};

// ── UPDATE (Admin / Manager) — explicit whitelist ─────────────────────────────
const update = async (req, res) => {
  const id = +req.params.id;
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  const { time_in, time_out, attendance_status } = req.body;  // whitelist only

  const rec = await Attendance.findOne({ where: { attendance_id: id } });
  if (!rec) {
    setFlash(res, 'danger', 'Record not found.');
    return res.redirect(`${basePath}/attendance`);
  }

  await rec.update({ time_in: time_in || null, time_out: time_out || null, attendance_status });
  setFlash(res, 'success', 'Attendance record updated.');
  return res.redirect(`${basePath}/attendance`);
};

// ── DELETE (Admin only) — hard delete, same as original ───────────────────────
const destroy = async (req, res) => {
  const id = +req.params.id;
  await Attendance.destroy({ where: { attendance_id: id } });
  setFlash(res, 'success', 'Attendance record deleted.');
  return res.redirect('/admin/attendance');
};

// ── EMPLOYEE: self time-in ────────────────────────────────────────────────────
const timeIn = async (req, res) => {
  const empId = +req.user.employeeId;
  const today = todayStr();

  const exists = await Attendance.findOne({ where: { employee_id: empId, date: today } });
  if (exists) {
    setFlash(res, 'danger', 'Already timed in today.');
    return res.redirect('/employee/attendance');
  }

  await Attendance.create({
    employee_id:       empId,
    date:              today,
    time_in:           nowTime(),
    attendance_status: 'Present',
  });
  setFlash(res, 'success', `Timed in at ${nowTime()}.`);
  return res.redirect('/employee/attendance');
};

// ── EMPLOYEE: self time-out ───────────────────────────────────────────────────
const timeOut = async (req, res) => {
  const empId = +req.user.employeeId;
  const today = todayStr();

  const rec = await Attendance.findOne({ where: { employee_id: empId, date: today } });
  if (!rec) {
    setFlash(res, 'danger', 'No time-in found for today.');
    return res.redirect('/employee/attendance');
  }
  if (rec.time_out) {
    setFlash(res, 'danger', 'Already timed out today.');
    return res.redirect('/employee/attendance');
  }

  await rec.update({ time_out: nowTime() });
  setFlash(res, 'success', `Timed out at ${nowTime()}.`);
  return res.redirect('/employee/attendance');
};

module.exports = { index, store, update, destroy, timeIn, timeOut };

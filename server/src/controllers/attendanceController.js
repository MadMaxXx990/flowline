'use strict';
const { Op } = require('sequelize');
const { Attendance, Employee, Department } = require('../models');
const { log }          = require('../lib/activityLog');
const { setFlash }     = require('../middleware/flash');
const { localDateStr } = require('../lib/dates');

const PAGE_SIZE = 20;

// ── Shared constants ──────────────────────────────────────────────────────────
// One canonical list used by views/attendance/index.ejs, the seed, and all validation.
const ATTENDANCE_STATUSES = ['Present', 'Absent', 'On Leave'];

// Regex for YYYY-MM-DD and HH:MM
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** Return YYYY-MM-DD string for today in server local time. */
function todayStr() { return localDateStr(); }

/** HH:MM string for the current time */
function nowTime() {
  const n = new Date();
  return `${n.getHours().toString().padStart(2,'0')}:${n.getMinutes().toString().padStart(2,'0')}`;
}

/** Validate attendance fields. Returns an error string or null. */
function validateAttendance({ date, time_in, time_out, attendance_status }) {
  if (date && !DATE_RE.test(date)) return 'Date must be in YYYY-MM-DD format.';
  if (time_in  && !TIME_RE.test(time_in))  return 'Time In must be in HH:MM format.';
  if (time_out && !TIME_RE.test(time_out)) return 'Time Out must be in HH:MM format.';
  if (time_in && time_out && time_out < time_in) return 'Time Out cannot be earlier than Time In.';
  if (attendance_status && !ATTENDANCE_STATUSES.includes(attendance_status)) {
    return `Status must be one of: ${ATTENDANCE_STATUSES.join(', ')}.`;
  }
  return null;
}

// ── LIST ──────────────────────────────────────────────────────────────────────
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
    if (from) where.date[Op.gte] = from;
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

  const employees = req.user.role !== 'Employee'
    ? await Employee.findAll({ where: { is_deleted: false }, attributes: ['employee_id', 'first_name', 'last_name'], order: [['first_name', 'ASC']] })
    : [];

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
    ATTENDANCE_STATUSES,
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

  const validErr = validateAttendance({ date, time_in, time_out, attendance_status });
  if (validErr) {
    setFlash(res, 'danger', validErr);
    return res.redirect(`${basePath}/attendance`);
  }

  const { Sequelize } = require('sequelize');
  try {
    const rec = await Attendance.create({
      employee_id:       +employee_id,
      date,
      time_in:           time_in           || null,
      time_out:          time_out          || null,
      attendance_status,
    });
    await log(req.user.id, 'create', `Logged attendance for employee ${employee_id} on ${date}`, 'attendance', rec.attendance_id);
    setFlash(res, 'success', 'Attendance record created.');
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      setFlash(res, 'danger', 'An attendance record already exists for this employee on that date.');
    } else {
      throw err;
    }
  }
  return res.redirect(`${basePath}/attendance`);
};

// ── UPDATE (Admin / Manager) — explicit whitelist + validation ────────────────
const update = async (req, res) => {
  const id = +req.params.id;
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  const { time_in, time_out, attendance_status } = req.body;

  const validErr = validateAttendance({ time_in, time_out, attendance_status });
  if (validErr) {
    setFlash(res, 'danger', validErr);
    return res.redirect(`${basePath}/attendance`);
  }

  const rec = await Attendance.findOne({ where: { attendance_id: id } });
  if (!rec) {
    setFlash(res, 'danger', 'Record not found.');
    return res.redirect(`${basePath}/attendance`);
  }

  await rec.update({ time_in: time_in || null, time_out: time_out || null, attendance_status });
  await log(req.user.id, 'update', `Updated attendance record ${id}`, 'attendance', id);
  setFlash(res, 'success', 'Attendance record updated.');
  return res.redirect(`${basePath}/attendance`);
};

// ── DELETE (Admin only) — hard delete ─────────────────────────────────────────
const destroy = async (req, res) => {
  const id = +req.params.id;
  await Attendance.destroy({ where: { attendance_id: id } });
  await log(req.user.id, 'delete', `Deleted attendance record ${id}`, 'attendance', id);
  setFlash(res, 'success', 'Attendance record deleted.');
  return res.redirect('/admin/attendance');
};

// ── EMPLOYEE: self time-in ────────────────────────────────────────────────────
const timeIn = async (req, res) => {
  const empId = +req.user.employeeId;
  const today = todayStr();

  const { Sequelize } = require('sequelize');
  try {
    const rec = await Attendance.create({
      employee_id:       empId,
      date:              today,
      time_in:           nowTime(),
      attendance_status: 'Present',
    });
    await log(req.user.id, 'create', `Employee ${empId} timed in at ${rec.time_in}`, 'attendance', rec.attendance_id);
    setFlash(res, 'success', `Timed in at ${rec.time_in}.`);
  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      setFlash(res, 'danger', 'Already timed in today.');
    } else {
      throw err;
    }
  }
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

  const t = nowTime();
  await rec.update({ time_out: t });
  await log(req.user.id, 'update', `Employee ${empId} timed out at ${t}`, 'attendance', rec.attendance_id);
  setFlash(res, 'success', `Timed out at ${t}.`);
  return res.redirect('/employee/attendance');
};

module.exports = { index, store, update, destroy, timeIn, timeOut, ATTENDANCE_STATUSES };

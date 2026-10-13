'use strict';
const path = require('path');
const fs   = require('fs');
const { Op } = require('sequelize');
const {
  Attachment, Task, TaskAssignment, Employee, User,
} = require('../models');
const { log }      = require('../lib/activityLog');
const { setFlash } = require('../middleware/flash');

// Absolute path to the uploads directory — used for all path resolution.
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

/**
 * GET /attachments/:id/download
 *
 * Permission rules (same scope as task board):
 *   Administrator — any attachment on any non-deleted task
 *   Manager       — only attachments on tasks they created
 *   Employee      — only attachments on tasks assigned to them
 */
const download = async (req, res) => {
  const id  = +req.params.id;

  const att = await Attachment.findOne({
    where: { attachment_id: id, is_deleted: false },
    include: [{ model: Task, as: 'task' }],
  });

  if (!att || !att.task || att.task.is_deleted) {
    return res.status(404).render('errors/404');
  }

  // ── Permission check ──────────────────────────────────────────────────────
  if (req.user.role === 'Manager') {
    if (att.task.created_by_user_id !== req.user.id) {
      return res.status(403).render('errors/403');
    }
  } else if (req.user.role === 'Employee') {
    const assigned = await TaskAssignment.findOne({
      where: { task_id: att.task_id, employee_id: +req.user.employeeId },
    });
    if (!assigned) return res.status(403).render('errors/403');
  }
  // Administrator passes through with no additional check.

  // ── Safe path construction — never trust stored path directly ──────────────
  // Use only path.basename(att.file_path) to prevent traversal.
  const safeName = path.basename(att.file_path);
  const filePath = path.join(UPLOADS_DIR, safeName);

  // Confirm resolved path stays inside uploads dir
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(UPLOADS_DIR + path.sep) && resolved !== UPLOADS_DIR) {
    return res.status(403).render('errors/403');
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).render('errors/404');
  }

  // Activity log
  await log(req.user.id, 'download', `Downloaded attachment ${id}: ${att.file_name}`, 'attachments', id);

  // Send with original file name
  return res.download(filePath, att.file_name);
};

/**
 * List helper used by all three Files pages.
 * Returns attachments visible to the current user, newest first.
 * Supports optional task_id filter (Admin and Manager only).
 */
const listForUser = async (req, { page = 1, pageSize = 20 } = {}) => {
  const where = { is_deleted: false };

  // Task-level scope
  const taskWhere = { is_deleted: false };
  if (req.user.role === 'Manager') {
    taskWhere.created_by_user_id = req.user.id;
  } else if (req.user.role === 'Employee') {
    taskWhere['$task.assignments.employee_id$'] = +req.user.employeeId;
  }

  // Optional task filter from query
  if (req.query.task_id && req.user.role !== 'Employee') {
    taskWhere.task_id = +req.query.task_id;
  }
  if (req.query.search) {
    where.file_name = { [Op.like]: `%${req.query.search}%` };
  }

  const includeTask = {
    model: Task, as: 'task',
    where: taskWhere,
    required: true,
    ...(req.user.role === 'Employee' ? {
      include: [{ model: TaskAssignment, as: 'assignments',
        where: { employee_id: +req.user.employeeId }, required: true }],
    } : {}),
  };

  const offset = (page - 1) * pageSize;

  const { count, rows } = await Attachment.findAndCountAll({
    where,
    include: [
      includeTask,
      { model: User, as: 'uploadedBy', include: [{ model: Employee, as: 'employee' }] },
    ],
    order:  [['uploaded_at', 'DESC']],
    limit:  pageSize,
    offset,
    subQuery: false,
  });

  return { files: rows, total: count, page, pageSize, pages: Math.ceil(count / pageSize) };
};

/**
 * GET /{role}/files
 */
const filesIndex = async (req, res) => {
  const page = Math.max(1, +req.query.page || 1);
  const { files, total, pages } = await listForUser(req, { page });

  const basePath = req.user.role === 'Administrator' ? '/admin'
                 : req.user.role === 'Manager'       ? '/manager'
                 : '/employee';

  // For the task filter dropdown (Admin/Manager only)
  let tasks = [];
  if (req.user.role !== 'Employee') {
    const { Task: TaskModel } = require('../models');
    const tWhere = { is_deleted: false };
    if (req.user.role === 'Manager') tWhere.created_by_user_id = req.user.id;
    tasks = await TaskModel.findAll({
      where: tWhere,
      attributes: ['task_id', 'task_title'],
      order: [['task_title', 'ASC']],
    });
  }

  res.render('files/index', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/files`,
    files, total, pages, page,
    tasks,
    query: {
      search:  req.query.search  || '',
      task_id: req.query.task_id || '',
    },
  });
};

module.exports = { download, filesIndex };

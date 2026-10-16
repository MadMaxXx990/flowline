'use strict';
const { Op }         = require('sequelize');
const {
  Task, TaskAssignment, TaskUpdate, TaskStageHistory,
  TaskComment, Approval, Attachment,
  WorkflowStage, TaskPriority,
  Employee, User, Department, Position, Team,
} = require('../models');
const { log }       = require('../lib/activityLog');
const { send }      = require('../lib/notify');
const { setFlash }  = require('../middleware/flash');

// ── Shared deep include for show / edit ───────────────────────────────────────
const taskInclude = [
  { model: WorkflowStage, as: 'stage' },
  { model: TaskPriority,  as: 'priority' },
  {
    model: User, as: 'creator',
    include: [{ model: Employee, as: 'employee' }],
  },
  {
    model: TaskAssignment, as: 'assignments',
    include: [{
      model: Employee, as: 'employee',
      include: [{ model: Position, as: 'position' }],
    }],
  },
  { model: TaskUpdate, as: 'updates', order: [['update_date', 'DESC']] },
  {
    model: TaskStageHistory, as: 'stageHistory',
    include: [
      { model: User, as: 'changedBy', include: [{ model: Employee, as: 'employee' }] },
      { model: WorkflowStage, as: 'oldStage' },
      { model: WorkflowStage, as: 'newStage'  },
    ],
  },
  {
    model: TaskComment, as: 'comments',
    where: { is_deleted: false }, required: false,
    include: [{ model: User, as: 'user', include: [{ model: Employee, as: 'employee' }] }],
  },
  {
    model: Approval, as: 'approvals',
    include: [{ model: User, as: 'approver', include: [{ model: Employee, as: 'employee' }] }],
  },
  {
    model: Attachment, as: 'attachments',
    where: { is_deleted: false }, required: false,
    include: [{ model: User, as: 'uploadedBy', include: [{ model: Employee, as: 'employee' }] }],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Delete any files already uploaded by multer if we abort the request. */
function cleanupUploads(req) {
  const fs   = require('fs');
  const path = require('path');
  const dir  = path.join(__dirname, '../../uploads');
  const files = req.file ? [req.file] : (req.files || []);
  for (const f of files) {
    const fp = path.join(dir, path.basename(f.filename || ''));
    fs.unlink(fp, () => {});
  }
}

/**
 * Load a task with the given options, enforcing ownership rules:
 *   Administrator → any non-deleted task
 *   Manager       → only tasks they created (created_by_user_id === req.user.id)
 *   Employee      → only tasks they are assigned to
 * Returns the task instance or null (caller renders 404).
 */
async function loadTaskForUser(req, id, include = []) {
  const task = await Task.findOne({
    where:   { task_id: +id, is_deleted: false },
    include,
  });
  if (!task) return null;

  if (req.user.role === 'Manager') {
    if (task.created_by_user_id !== req.user.id) return null;
  } else if (req.user.role === 'Employee') {
    const assigned = await TaskAssignment.findOne({
      where: { task_id: +id, employee_id: +req.user.employeeId },
    });
    if (!assigned) return null;
  }
  // Administrator: no extra check
  return task;
}
const STAGE_COLORS = {
  'Pending':     '#9ca3af',
  'In Progress': '#3b82f6',
  'For Review':  '#f59e0b',
  'Completed':   '#10b981',
  'Overdue':     '#ef4444',
};

async function loadFormData() {
  const [employees, teams, stages, priorities] = await Promise.all([
    Employee.findAll({
      where: { is_deleted: false },
      include: [{ model: Department, as: 'department' }],
      order: [['first_name', 'ASC'], ['last_name', 'ASC']],
    }),
    Team.findAll({
      where: { is_deleted: false },
      include: [
        { model: Employee, as: 'members', where: { is_deleted: false }, required: false,
          attributes: ['employee_id', 'first_name', 'last_name'] },
      ],
      attributes: ['team_id', 'team_name', 'department_id'],
      order: [['team_name', 'ASC']],
    }),
    WorkflowStage.findAll({ order: [['step_order', 'ASC']] }),
    TaskPriority.findAll({ order: [['priority_id', 'ASC']] }),
  ]);
  return { employees, teams, stages, priorities };
}

// ── BOARD ─────────────────────────────────────────────────────────────────────
const board = async (req, res) => {
  const { search, priority_id, stage_id, employee_id } = req.query;
  const where = { is_deleted: false };

  // Role scoping — same rules as the original
  if (req.user.role === 'Employee') {
    where['$assignments.employee_id$'] = +req.user.employeeId;
  }
  if (req.user.role === 'Manager') {
    where.created_by_user_id = req.user.id;
  }

  if (search)      where.task_title  = { [Op.like]: `%${search}%` };
  if (priority_id) where.priority_id = +priority_id;
  if (stage_id)    where.stage_id    = +stage_id;

  const includeForBoard = [
    { model: WorkflowStage, as: 'stage' },
    { model: TaskPriority,  as: 'priority' },
    {
      model: TaskAssignment, as: 'assignments',
      include: [{ model: Employee, as: 'employee' }],
      // Required join for Employee scoping; otherwise left join
      required: req.user.role === 'Employee',
    },
    { model: TaskUpdate, as: 'updates', limit: 1, order: [['update_date', 'DESC']], required: false },
  ];

  // employee_id filter (admin only — employees don't get this filter in the view)
  let assigneeFilter = {};
  if (employee_id && req.user.role !== 'Employee') {
    assigneeFilter = { '$assignments.employee_id$': +employee_id };
    Object.assign(where, assigneeFilter);
  }

  const tasks = await Task.findAll({
    where,
    include: includeForBoard,
    order:   [['created_at', 'DESC']],
    subQuery: false,
  });

  // Group by stage
  const allStages = await WorkflowStage.findAll({ order: [['step_order', 'ASC']] });
  const priorities = await TaskPriority.findAll({ order: [['priority_id', 'ASC']] });
  const grouped = {};
  allStages.forEach(s => { grouped[s.stage_name] = []; });
  tasks.forEach(t => {
    const sn = t.stage?.stage_name || 'Pending';
    if (grouped[sn]) grouped[sn].push(t);
  });

  // For the filter bar (admin/manager only)
  const depts = req.user.role !== 'Employee'
    ? await Employee.findAll({ where: { is_deleted: false }, attributes: ['employee_id', 'first_name', 'last_name'], order: [['first_name', 'ASC']] })
    : [];

  const canManage = req.user.role !== 'Employee';
  const basePath  = req.user.role === 'Administrator' ? '/admin'
                  : req.user.role === 'Manager'       ? '/manager'
                  : '/employee';

  res.render('tasks/board', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/tasks`,
    grouped, allStages, STAGE_COLORS,
    canManage,
    employees: depts,
    priorities,
    query: { search: search || '', priority_id: priority_id || '', stage_id: stage_id || '', employee_id: employee_id || '' },
  });
};

// ── NEW FORM ──────────────────────────────────────────────────────────────────
const newForm = async (req, res) => {
  const formData = await loadFormData();
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  res.render('tasks/new', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/tasks/new`,
    ...formData,
    formValues: { task_title: '', task_description: '', priority_id: '', start_date: '', due_date: '', employee_ids: [] },
    error: null,
  });
};

// ── CREATE ────────────────────────────────────────────────────────────────────
const store = async (req, res) => {
  const { task_title, task_description, priority_id, start_date, due_date } = req.body;
  // employee_ids comes as array or comma-separated string
  const rawIds = req.body.employee_ids;
  const employee_ids = Array.isArray(rawIds)
    ? rawIds.map(Number)
    : rawIds ? String(rawIds).split(',').map(Number).filter(Boolean) : [];

  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';

  const formData   = await loadFormData();
  const renderError = (msg) => {
    cleanupUploads(req);
    return res.status(422).render('tasks/new', {
      role: req.user.role, basePath, user: req.user,
      currentPath: `${basePath}/tasks`,
      ...formData,
      formValues: { ...req.body, employee_ids },
      error: msg,
    });
  };

  // ── Validation ──
  if (!task_title || !task_title.trim())  return renderError('Task title is required.');
  if (!priority_id)                        return renderError('Priority is required.');
  if (!due_date)                           return renderError('Due date is required.');
  if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return renderError('Start date must be a valid date (YYYY-MM-DD).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return renderError('Due date must be a valid date (YYYY-MM-DD).');
  if (start_date && due_date && new Date(start_date) > new Date(due_date)) {
    return renderError('Start date cannot be after the due date.');
  }

  // Validate priority_id exists in the database (handles fresh DB with non-1..3 IDs)
  const priorityRow = await TaskPriority.findOne({ where: { priority_id: +priority_id } });
  if (!priorityRow) return renderError('Selected priority does not exist.');

  // Deduplicate employee_ids and verify each exists and is not deleted
  const uniqueIds = [...new Set(employee_ids.filter(id => !isNaN(id) && id > 0))];
  if (uniqueIds.length > 0) {
    const validEmps = await Employee.findAll({
      where: { employee_id: { [Op.in]: uniqueIds }, is_deleted: false },
      attributes: ['employee_id'],
    });
    if (validEmps.length !== uniqueIds.length) {
      return renderError('One or more selected employees do not exist or have been archived.');
    }
  }

  const pendingStage = await WorkflowStage.findOne({ where: { stage_name: 'Pending' } });

  const task = await Task.create({
    stage_id:           pendingStage.stage_id,
    task_title:         task_title.trim(),
    task_description:   task_description || null,
    priority_id:        +priority_id,
    start_date:         start_date  ? new Date(start_date)  : null,
    due_date:           new Date(due_date),
    created_by_user_id: req.user.id,
  });

  // Stage history — "Task created." (original message)
  await TaskStageHistory.create({
    task_id:            task.task_id,
    changed_by_user_id: req.user.id,
    new_stage_id:       pendingStage.stage_id,
    remarks:            'Task created.',
  });

  // Assignments + notifications
  const notifyUserIds = [];
  for (const empId of uniqueIds) {
    await TaskAssignment.create({
      task_id:             task.task_id,
      employee_id:         empId,
      assigned_by_user_id: req.user.id,
    });
    const emp = await Employee.findOne({
      where:   { employee_id: empId },
      include: [{ model: User, as: 'user' }],
    });
    if (emp?.user) notifyUserIds.push(emp.user.id);
  }

  // File attachments uploaded with the form
  if (req.files && req.files.length) {
    for (const file of req.files) {
      await Attachment.create({
        task_id:             task.task_id,
        uploaded_by_user_id: req.user.id,
        file_name:           file.originalname,
        file_path:           `uploads/${file.filename}`,
        file_type:           file.originalname.split('.').pop(),
      });
    }
  }

  if (notifyUserIds.length) {
    await send(
      notifyUserIds,
      'assignment',
      'New Task Assigned',
      `You have been assigned: "${task_title}".`,
      task.task_id,
      req.user.id,
    );
  }

  await log(req.user.id, 'assignment', `Created task: ${task_title}`, 'tasks', task.task_id);
  setFlash(res, 'success', 'Task created.');
  return res.redirect(`${basePath}/tasks`);
};

// ── SHOW ──────────────────────────────────────────────────────────────────────
const show = async (req, res) => {
  const id    = +req.params.id;
  const task  = await loadTaskForUser(req, id, [
    ...taskInclude,
  ]);
  // Re-fetch with full includes (loadTaskForUser fetched with the include list)
  // Actually we need the full deep include — use a dedicated fetch after access check.
  if (!task) return res.status(404).render('errors/404');

  // Re-load with full taskInclude since loadTaskForUser used it
  const fullTask = await Task.findOne({
    where:   { task_id: id, is_deleted: false },
    include: taskInclude,
    order:   [
      [{ model: TaskUpdate,       as: 'updates'      }, 'update_date', 'DESC'],
      [{ model: TaskStageHistory, as: 'stageHistory' }, 'changed_at',  'DESC'],
      [{ model: TaskComment,      as: 'comments'     }, 'created_at',  'ASC' ],
      [{ model: Approval,         as: 'approvals'    }, 'requested_at','DESC'],
    ],
  });
  if (!fullTask) return res.status(404).render('errors/404');

  const basePath  = req.user.role === 'Administrator' ? '/admin'
                  : req.user.role === 'Manager'       ? '/manager'
                  : '/employee';
  const canManage = req.user.role !== 'Employee';

  const allStages = await WorkflowStage.findAll({ order: [['step_order', 'ASC']] });

  res.render('tasks/show', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/tasks`,
    task: fullTask, canManage, allStages,
  });
};

// ── EDIT FORM ─────────────────────────────────────────────────────────────────
const editForm = async (req, res) => {
  const task = await loadTaskForUser(req, req.params.id, [
    { model: TaskAssignment, as: 'assignments' },
    { model: WorkflowStage,  as: 'stage' },
  ]);
  if (!task) return res.status(404).render('errors/404');

  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  const formData = await loadFormData();

  res.render('tasks/edit', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/tasks`,
    ...formData,
    task,
    formValues: {
      task_title:       task.task_title,
      task_description: task.task_description || '',
      priority_id:      String(task.priority_id),
      start_date:       task.start_date ? String(task.start_date).split('T')[0] : '',
      due_date:         task.due_date   ? String(task.due_date).split('T')[0]   : '',
      employee_ids:     task.assignments.map(a => a.employee_id),
    },
    error: null,
  });
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
const update = async (req, res) => {
  const id = +req.params.id;
  const { task_title, task_description, priority_id, start_date, due_date } = req.body;
  const rawIds = req.body.employee_ids;
  const employee_ids = Array.isArray(rawIds)
    ? rawIds.map(Number)
    : rawIds ? String(rawIds).split(',').map(Number).filter(Boolean) : [];

  const task = await loadTaskForUser(req, id, [{ model: TaskAssignment, as: 'assignments' }]);
  if (!task) return res.status(404).render('errors/404');

  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  const formData = await loadFormData();
  const renderError = (msg) => res.status(422).render('tasks/edit', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/tasks`,
    ...formData, task,
    formValues: { ...req.body, employee_ids },
    error: msg,
  });

  if (!task_title || !task_title.trim())  return renderError('Task title is required.');
  if (!priority_id)                        return renderError('Priority is required.');
  if (!due_date)                           return renderError('Due date is required.');
  if (start_date && !/^\d{4}-\d{2}-\d{2}$/.test(start_date)) return renderError('Start date must be a valid date (YYYY-MM-DD).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date)) return renderError('Due date must be a valid date (YYYY-MM-DD).');
  if (start_date && due_date && new Date(start_date) > new Date(due_date)) {
    return renderError('Start date cannot be after the due date.');
  }

  const priorityRow = await TaskPriority.findOne({ where: { priority_id: +priority_id } });
  if (!priorityRow) return renderError('Selected priority does not exist.');

  const uniqueIds = [...new Set(employee_ids.filter(id => !isNaN(id) && id > 0))];
  if (uniqueIds.length > 0) {
    const validEmps = await Employee.findAll({
      where: { employee_id: { [Op.in]: uniqueIds }, is_deleted: false },
      attributes: ['employee_id'],
    });
    if (validEmps.length !== uniqueIds.length) {
      return renderError('One or more selected employees do not exist or have been archived.');
    }
  }

  // Whitelist — only these fields updated
  await task.update({
    task_title:         task_title.trim(),
    task_description:   task_description || null,
    priority_id:        +priority_id,
    start_date:         start_date ? new Date(start_date) : null,
    due_date:           new Date(due_date),
    updated_by_user_id: req.user.id,
  });

  // Sync assignments — same logic as original, using deduplicated+validated ids
  const existing = task.assignments.map(a => a.employee_id);
  const toRemove = existing.filter(eid => !uniqueIds.includes(eid));
  const toAdd    = uniqueIds.filter(eid => !existing.includes(eid));

  if (toRemove.length) {
    await TaskAssignment.destroy({
      where: { task_id: id, employee_id: { [Op.in]: toRemove } },
    });
  }
  for (const empId of toAdd) {
    await TaskAssignment.create({
      task_id:             id,
      employee_id:         empId,
      assigned_by_user_id: req.user.id,
    });
  }

  await log(req.user.id, 'update', `Updated task: ${task_title}`, 'tasks', id);
  setFlash(res, 'success', 'Task updated.');
  return res.redirect(`${basePath}/tasks/${id}`);
};

// ── DESTROY (soft delete) ─────────────────────────────────────────────────────
const destroy = async (req, res) => {
  const id       = +req.params.id;
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  const task = await loadTaskForUser(req, id);
  if (!task) return res.status(404).render('errors/404');
  await Task.update({ is_deleted: true }, { where: { task_id: id } });
  await log(req.user.id, 'delete', `Deleted task id ${id}`, 'tasks', id);
  setFlash(res, 'success', 'Task deleted.');
  return res.redirect(`${basePath}/tasks`);
};

// ── CHANGE STAGE (Administrator + Manager) ────────────────────────────────────
// No transition validation — any stage may be set to any other stage (original behaviour).
const changeStage = async (req, res) => {
  const id       = +req.params.id;
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  const { stage_id, remarks } = req.body;

  const task = await loadTaskForUser(req, id, [{ model: TaskAssignment, as: 'assignments',
      include: [{ model: Employee, as: 'employee', include: [{ model: User, as: 'user' }] }] }]);
  if (!task) return res.status(404).render('errors/404');

  // Validate stage_id exists
  const stageExists = await WorkflowStage.findOne({ where: { stage_id: +stage_id } });
  if (!stageExists) {
    setFlash(res, 'danger', 'Invalid stage selected.');
    return res.redirect(`${basePath}/tasks/${id}`);
  }

  const { sequelize } = require('../models');
  await sequelize.transaction(async tx => {
    const old = task.stage_id;
    await task.update({ stage_id: +stage_id, updated_by_user_id: req.user.id }, { transaction: tx });
    await TaskStageHistory.create({
      task_id: id, changed_by_user_id: req.user.id,
      old_stage_id: old, new_stage_id: +stage_id, remarks: remarks || null,
    }, { transaction: tx });
  });

  const stage = await WorkflowStage.findOne({ where: { stage_id: +stage_id } });
  const uids  = task.assignments.map(a => a.employee?.user?.id).filter(Boolean);
  if (uids.length) {
    await send(uids, 'status', 'Task Stage Updated',
      `Task "${task.task_title}" moved to ${stage.stage_name}.`, id, req.user.id);
  }
  await log(req.user.id, 'update', `Changed task ${id} to ${stage.stage_name}`, 'tasks', id);

  setFlash(res, 'success', `Stage changed to ${stage.stage_name}.`);
  return res.redirect(`${basePath}/tasks/${id}`);
};

// ── APPROVE / RETURN (Administrator + Manager) ────────────────────────────────
// approval_status must be exactly 'Approved' or 'Revision Requested'.
// Remarks are required when returning (employee needs to know why).
const approve = async (req, res) => {
  const id       = +req.params.id;
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  const { approval_status, remarks } = req.body;

  // Validate approval_status
  const VALID_STATUSES = ['Approved', 'Revision Requested'];
  if (!VALID_STATUSES.includes(approval_status)) {
    setFlash(res, 'danger', 'Invalid approval status.');
    return res.redirect(`${basePath}/tasks/${id}`);
  }
  // Require remarks when returning for revision
  if (approval_status === 'Revision Requested' && (!remarks || !remarks.trim())) {
    setFlash(res, 'danger', 'Remarks are required when requesting a revision.');
    return res.redirect(`${basePath}/tasks/${id}`);
  }

  const task = await loadTaskForUser(req, id, [{ model: TaskAssignment, as: 'assignments',
      include: [{ model: Employee, as: 'employee', include: [{ model: User, as: 'user' }] }] }]);
  if (!task) return res.status(404).render('errors/404');

  const stageName = approval_status === 'Approved' ? 'Completed' : 'In Progress';
  const newStage  = await WorkflowStage.findOne({ where: { stage_name: stageName } });
  const histRemarks = approval_status === 'Approved' ? 'Approved.' : 'Returned for revision.';

  const { sequelize } = require('../models');
  await sequelize.transaction(async tx => {
    await Approval.create({
      task_id: id, approver_user_id: req.user.id,
      approval_status, remarks: remarks || null, approval_date: new Date(),
    }, { transaction: tx });
    await task.update({ stage_id: newStage.stage_id, updated_by_user_id: req.user.id }, { transaction: tx });
    await TaskStageHistory.create({
      task_id: id, changed_by_user_id: req.user.id,
      old_stage_id: task.stage_id, new_stage_id: newStage.stage_id, remarks: histRemarks,
    }, { transaction: tx });
  });

  const uids = task.assignments.map(a => a.employee?.user?.id).filter(Boolean);
  const notifMsg = `Task "${task.task_title}": ${approval_status}.${remarks ? ` Remarks: ${remarks}` : ''}`;
  if (uids.length) {
    await send(uids, 'approval', 'Task Review Decision', notifMsg, id, req.user.id);
  }
  await log(req.user.id, 'approval', `Reviewed task ${id}: ${approval_status}`, 'tasks', id);

  setFlash(res, 'success', `Task ${approval_status}.`);
  return res.redirect(`${basePath}/tasks/${id}`);
};

// ── SUBMIT FOR REVIEW (Employee) ──────────────────────────────────────────────
// ONE submission from any assignee moves the whole task to For Review (original behaviour).
// No "all assignees must submit" check.
const submitForReview = async (req, res) => {
  const id = +req.params.id;

  const task = await Task.findOne({ where: { task_id: id, is_deleted: false } });
  if (!task) return res.status(404).render('errors/404');

  // Verify this employee is assigned
  const assigned = await TaskAssignment.findOne({
    where: { task_id: id, employee_id: +req.user.employeeId },
  });
  if (!assigned) return res.status(404).render('errors/404');

  // Idempotency: if already For Review or beyond, redirect cleanly
  const forReviewStage = await WorkflowStage.findOne({ where: { stage_name: 'For Review' } });
  if (task.stage_id === forReviewStage.stage_id) {
    setFlash(res, 'info', 'Task is already submitted for review.');
    return res.redirect(`/employee/tasks/${id}`);
  }

  const { sequelize } = require('../models');
  await sequelize.transaction(async tx => {
    await task.update({ stage_id: forReviewStage.stage_id, updated_by_user_id: req.user.id }, { transaction: tx });
    await TaskStageHistory.create({
      task_id: id, changed_by_user_id: req.user.id,
      old_stage_id: task.stage_id, new_stage_id: forReviewStage.stage_id, remarks: 'Submitted for review.',
    }, { transaction: tx });
  });

  // Notify the task creator
  await send(task.created_by_user_id, 'approval', 'Task Ready for Review',
    `Task "${task.task_title}" was submitted for review.`, id, req.user.id);
  await log(req.user.id, 'update', `Submitted task ${id} for review`, 'tasks', id);

  setFlash(res, 'success', 'Task submitted for review.');
  return res.redirect(`/employee/tasks/${id}`);
};

// ── POST PROGRESS (Employee) ──────────────────────────────────────────────────
// No range enforcement in original — any number accepted.
// Auto-moves Pending → In Progress (only; Overdue stays Overdue).
const postProgress = async (req, res) => {
  const id = +req.params.id;
  const { update_message, progress_percent } = req.body;

  if (!update_message || !update_message.trim()) {
    setFlash(res, 'danger', 'Update message is required.');
    return res.redirect(`/employee/tasks/${id}`);
  }

  const task = await Task.findOne({ where: { task_id: id, is_deleted: false } });
  if (!task) return res.status(404).render('errors/404');

  // Verify this employee is assigned
  const assigned = await TaskAssignment.findOne({
    where: { task_id: id, employee_id: +req.user.employeeId },
  });
  if (!assigned) return res.status(404).render('errors/404');

  const pct = Math.max(0, Math.min(100, +progress_percent || 0));

  const { sequelize } = require('../models');
  await sequelize.transaction(async tx => {
    await TaskUpdate.create({
      task_id: id, employee_id: +req.user.employeeId,
      update_message: update_message.trim(), progress_percent: pct,
    }, { transaction: tx });

    // Auto-move Pending → In Progress
    const pending    = await WorkflowStage.findOne({ where: { stage_name: 'Pending'      } });
    const inProgress = await WorkflowStage.findOne({ where: { stage_name: 'In Progress'  } });
    if (task.stage_id === pending.stage_id) {
      await task.update({ stage_id: inProgress.stage_id }, { transaction: tx });
      await TaskStageHistory.create({
        task_id: id, changed_by_user_id: req.user.id,
        old_stage_id: pending.stage_id, new_stage_id: inProgress.stage_id,
        remarks: 'Progress update posted.',
      }, { transaction: tx });
    }
  });

  await log(req.user.id, 'update', `Posted progress on task ${id}`, 'task_updates', id);

  setFlash(res, 'success', 'Progress saved.');
  return res.redirect(`/employee/tasks/${id}`);
};

// ── ADD COMMENT (any authenticated user) ─────────────────────────────────────
// No role restriction in original — anyone logged in may comment.
const addComment = async (req, res) => {
  const id = +req.params.id;
  const { comment_text } = req.body;

  if (!comment_text || !comment_text.trim()) {
    setFlash(res, 'danger', 'Comment text is required.');
    return res.redirect('back');
  }

  const task = await loadTaskForUser(req, id);
  if (!task) return res.status(404).render('errors/404');

  // (loadTaskForUser already enforces Employee assignment; no extra check needed)

  await TaskComment.create({ task_id: id, user_id: req.user.id, comment_text: comment_text.trim() });

  const basePath = req.user.role === 'Administrator' ? '/admin'
                 : req.user.role === 'Manager'       ? '/manager'
                 : '/employee';
  return res.redirect(`${basePath}/tasks/${id}`);
};

// ── DELETE COMMENT (Administrator + Manager only) — soft delete ───────────────
const deleteComment = async (req, res) => {
  const id  = +req.params.id;
  const cid = +req.params.cid;
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';

  const task = await loadTaskForUser(req, id);
  if (!task) return res.status(404).render('errors/404');

  // Verify the comment belongs to this task
  await TaskComment.update({ is_deleted: true }, { where: { comment_id: cid, task_id: id } });

  return res.redirect(`${basePath}/tasks/${id}`);
};

// ── UPLOAD ATTACHMENT (any authenticated user) ────────────────────────────────
// No role restriction in original — anyone logged in may upload.
const uploadAttachment = async (req, res) => {
  const id = +req.params.id;

  if (!req.file) {
    setFlash(res, 'danger', 'No file provided.');
    return res.redirect('back');
  }

  const task = await loadTaskForUser(req, id);
  if (!task) return res.status(404).render('errors/404');

  // (loadTaskForUser already enforces Employee assignment)

  await Attachment.create({
    task_id:             id,
    uploaded_by_user_id: req.user.id,
    file_name:           req.file.originalname,
    file_path:           `uploads/${req.file.filename}`,
    file_type:           req.file.originalname.split('.').pop(),
  });

  setFlash(res, 'success', 'File uploaded.');
  const basePath = req.user.role === 'Administrator' ? '/admin'
                 : req.user.role === 'Manager'       ? '/manager'
                 : '/employee';
  return res.redirect(`${basePath}/tasks/${id}`);
};

module.exports = {
  board, newForm, store, show, editForm, update, destroy,
  changeStage, approve, submitForReview, postProgress,
  addComment, deleteComment, uploadAttachment,
};

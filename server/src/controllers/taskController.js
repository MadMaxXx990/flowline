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
const PRIORITIES = [
  { priority_id: 1, priority_name: 'Low' },
  { priority_id: 2, priority_name: 'Medium' },
  { priority_id: 3, priority_name: 'High' },
];

const STAGE_COLORS = {
  'Pending':     '#9ca3af',
  'In Progress': '#3b82f6',
  'For Review':  '#f59e0b',
  'Completed':   '#10b981',
  'Overdue':     '#ef4444',
};

async function loadFormData() {
  const [employees, teams, stages] = await Promise.all([
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
  ]);
  return { employees, teams, stages, priorities: PRIORITIES };
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
    priorities: PRIORITIES,
    query: { search: search || '', priority_id: priority_id || '', stage_id: stage_id || '', employee_id: employee_id || '' },
  });
};

// ── NEW FORM ──────────────────────────────────────────────────────────────────
const newForm = async (req, res) => {
  const formData = await loadFormData();
  const basePath = req.user.role === 'Administrator' ? '/admin' : '/manager';
  res.render('tasks/new', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/tasks`,
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
  const renderError = (msg) => res.status(422).render('tasks/new', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/tasks`,
    ...formData,
    formValues: { ...req.body, employee_ids },
    error: msg,
  });

  // ── Validation ──
  if (!task_title || !task_title.trim())  return renderError('Task title is required.');
  if (!priority_id)                        return renderError('Priority is required.');
  if (!due_date)                           return renderError('Due date is required.');
  if (start_date && due_date && new Date(start_date) > new Date(due_date)) {
    return renderError('Start date cannot be after the due date.');
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
  for (const empId of employee_ids) {
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
  const task  = await Task.findOne({
    where:   { task_id: id, is_deleted: false },
    include: taskInclude,
    order:   [
      [{ model: TaskUpdate,       as: 'updates'      }, 'update_date', 'DESC'],
      [{ model: TaskStageHistory, as: 'stageHistory' }, 'changed_at',  'DESC'],
      [{ model: TaskComment,      as: 'comments'     }, 'created_at',  'ASC' ],
      [{ model: Approval,         as: 'approvals'    }, 'requested_at','DESC'],
    ],
  });

  if (!task) return res.status(404).render('errors/404');

  // Employees may only view tasks assigned to them
  if (req.user.role === 'Employee') {
    const assigned = task.assignments.some(a => a.employee_id === +req.user.employeeId);
    if (!assigned) return res.status(404).render('errors/404');
  }

  const basePath  = req.user.role === 'Administrator' ? '/admin'
                  : req.user.role === 'Manager'       ? '/manager'
                  : '/employee';
  const canManage = req.user.role !== 'Employee';

  res.render('tasks/show', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/tasks`,
    task, canManage,
  });
};

// ── EDIT FORM ─────────────────────────────────────────────────────────────────
const editForm = async (req, res) => {
  const task = await Task.findOne({
    where:   { task_id: +req.params.id, is_deleted: false },
    include: [
      { model: TaskAssignment, as: 'assignments' },
      { model: WorkflowStage,  as: 'stage' },
    ],
  });
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

  const task = await Task.findOne({
    where:   { task_id: id, is_deleted: false },
    include: [{ model: TaskAssignment, as: 'assignments' }],
  });
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
  if (start_date && due_date && new Date(start_date) > new Date(due_date)) {
    return renderError('Start date cannot be after the due date.');
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

  // Sync assignments — same logic as original
  const existing = task.assignments.map(a => a.employee_id);
  const toRemove = existing.filter(eid => !employee_ids.includes(eid));
  const toAdd    = employee_ids.filter(eid => !existing.includes(eid));

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
  await Task.update({ is_deleted: true }, { where: { task_id: id } });
  await log(req.user.id, 'delete', `Deleted task id ${id}`, 'tasks', id);
  setFlash(res, 'success', 'Task deleted.');
  return res.redirect(`${basePath}/tasks`);
};

module.exports = { board, newForm, store, show, editForm, update, destroy };

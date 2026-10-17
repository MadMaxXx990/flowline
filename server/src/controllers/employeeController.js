'use strict';
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const { Op }  = require('sequelize');
const {
  Employee, User, Role, Department, Position, Team,
  TaskAssignment, Task, WorkflowStage,
} = require('../models');
const { log }      = require('../lib/activityLog');
const { setFlash } = require('../middleware/flash');

// ── Shared include options ────────────────────────────────────────────────────
const baseInclude = [
  { model: Department, as: 'department' },
  { model: Position,   as: 'position' },
  { model: Team,       as: 'team' },
  { model: User,       as: 'user', include: [{ model: Role, as: 'role' }] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const EMP_TYPES = ['Regular', 'Contractual', 'Part-time', 'Probationary'];
const STATUSES  = ['Active', 'On Leave', 'Inactive'];

async function loadFormData() {
  const [depts, positions, roles, teams] = await Promise.all([
    Department.findAll({ where: { is_deleted: false }, order: [['department_name', 'ASC']] }),
    Position.findAll({ order: [['position_name', 'ASC']] }),
    Role.findAll({ order: [['role_name', 'ASC']] }),
    Team.findAll({
      where: { is_deleted: false },
      attributes: ['team_id', 'team_name', 'department_id'],
      order: [['team_name', 'ASC']],
    }),
  ]);
  return { depts, positions, roles, teams };
}

// ── LIST ──────────────────────────────────────────────────────────────────────
const index = async (req, res) => {
  const { search, department_id, status } = req.query;
  const where = { is_deleted: false };
  if (department_id) where.department_id = +department_id;
  if (status)        where.status = status;
  if (search) {
    where[Op.or] = [
      { first_name: { [Op.like]: `%${search}%` } },
      { last_name:  { [Op.like]: `%${search}%` } },
      { email:      { [Op.like]: `%${search}%` } },
    ];
  }

  const employees = await Employee.findAll({
    where,
    include: baseInclude,
    order: [['created_at', 'DESC']],
  });
  const depts = await Department.findAll({ where: { is_deleted: false }, order: [['department_name', 'ASC']] });

  res.render('admin/employees/index', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/employees',
    employees, depts,
    query: { search: search || '', department_id: department_id || '', status: status || '' },
  });
};

// ── SHOW ──────────────────────────────────────────────────────────────────────
const show = async (req, res) => {
  const emp = await Employee.findOne({
    where: { employee_id: +req.params.id, is_deleted: false },
    include: [
      ...baseInclude,
      {
        model: TaskAssignment, as: 'taskAssignments',
        include: [{ model: Task, as: 'task', include: [{ model: WorkflowStage, as: 'stage' }] }],
      },
    ],
  });
  if (!emp) {
    setFlash(res, 'danger', 'Employee not found.');
    return res.redirect('/admin/employees');
  }
  res.render('admin/employees/show', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/employees',
    emp,
  });
};

// ── NEW FORM ──────────────────────────────────────────────────────────────────
const newForm = async (req, res) => {
  const formData = await loadFormData();
  res.render('admin/employees/new', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/employees',
    ...formData,
    EMP_TYPES, STATUSES,
    formValues: {},
    error: null,
  });
};

// ── CREATE ────────────────────────────────────────────────────────────────────
const store = async (req, res) => {
  const {
    first_name, last_name, email, phone,
    department_id, position_id, supervisor_id, team_id,
    employment_type, hire_date,
    role_id, username, password,
  } = req.body;

  const formData = await loadFormData();
  const renderError = async (msg) => {
    return res.status(422).render('admin/employees/new', {
      role: 'Administrator', basePath: '/admin', user: req.user,
      currentPath: '/admin/employees',
      ...formData, EMP_TYPES, STATUSES,
      formValues: req.body,
      error: msg,
    });
  };

  // Required field validation
  if (!first_name || !last_name || !email || !username || !password) {
    return renderError('First name, last name, email, username and password are required.');
  }
  // Basic email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return renderError('Please enter a valid email address.');
  }
  // Username allowed pattern: letters, digits, dot, underscore, 3-30 chars
  if (!USERNAME_RE.test(username)) {
    return renderError('Username may only contain letters, digits, dots and underscores (3–30 characters).');
  }
  // Password minimum length
  if (password.length < 8) {
    return renderError('Password must be at least 8 characters.');
  }

  // Unique email
  const emailExists = await Employee.findOne({ where: { email } });
  if (emailExists) return renderError('That email address is already in use.');

  // Unique username — if taken, suggest the next free one
  const userExists = await User.findOne({ where: { username } });
  if (userExists) {
    let suggestion = '';
    for (let n = 2; n <= 99; n++) {
      const attempt = `${username}${n}`;
      const taken   = await User.findOne({ where: { username: attempt }, attributes: ['id'] });
      if (!taken) { suggestion = attempt; break; }
    }
    const hint = suggestion ? ` Try "${suggestion}".` : '';
    return renderError(`Username "${username}" is already taken.${hint}`);
  }

  const profile_photo_url = req.file ? `uploads/${req.file.filename}` : null;

  const emp = await Employee.create({
    first_name, last_name, email,
    phone:           phone           || null,
    department_id:   department_id   ? +department_id   : null,
    position_id:     position_id     ? +position_id     : null,
    supervisor_id:   supervisor_id   ? +supervisor_id   : null,
    team_id:         team_id         ? +team_id         : null,
    employment_type: employment_type || null,
    hire_date:       hire_date       ? new Date(hire_date) : null,
    status: 'Active',
    profile_photo_url,
  });

  await User.create({
    employee_id: emp.employee_id,
    role_id:     role_id ? +role_id : null,
    username,
    password:    await bcrypt.hash(password, 10),
    status:      'active',
  });

  await log(req.user.id, 'create', `Created employee: ${first_name} ${last_name}`, 'employees', emp.employee_id);
  setFlash(res, 'success', `Employee ${first_name} ${last_name} created. Username: ${username}`);
  return res.redirect('/admin/employees');
};

// ── EDIT FORM ─────────────────────────────────────────────────────────────────
const editForm = async (req, res) => {
  const emp = await Employee.findOne({
    where: { employee_id: +req.params.id, is_deleted: false },
    include: baseInclude,
  });
  if (!emp) {
    setFlash(res, 'danger', 'Employee not found.');
    return res.redirect('/admin/employees');
  }
  const formData = await loadFormData();
  res.render('admin/employees/edit', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/employees',
    ...formData, EMP_TYPES, STATUSES,
    emp,
    formValues: {
      first_name:      emp.first_name,
      last_name:       emp.last_name,
      email:           emp.email,
      phone:           emp.phone           ?? '',
      department_id:   String(emp.department_id ?? ''),
      position_id:     String(emp.position_id   ?? ''),
      team_id:         emp.team_id ? String(emp.team_id) : '',
      employment_type: emp.employment_type ?? '',
      hire_date:       emp.hire_date ? String(emp.hire_date).split('T')[0] : '',
      status:          emp.status,
      role_id:         String(emp.user?.role_id ?? ''),
      username:        emp.user?.username ?? '',
    },
    error: null,
  });
};

// ── UPDATE ────────────────────────────────────────────────────────────────────
const update = async (req, res) => {
  const id = +req.params.id;
  const {
    first_name, last_name, email, phone,
    department_id, position_id, supervisor_id, team_id,
    employment_type, hire_date, status,
    role_id, username, password,
  } = req.body;

  const emp = await Employee.findOne({
    where: { employee_id: id, is_deleted: false },
    include: baseInclude,
  });
  if (!emp) {
    setFlash(res, 'danger', 'Employee not found.');
    return res.redirect('/admin/employees');
  }

  const formData = await loadFormData();
  const renderError = async (msg) => {
    return res.status(422).render('admin/employees/edit', {
      role: 'Administrator', basePath: '/admin', user: req.user,
      currentPath: '/admin/employees',
      ...formData, EMP_TYPES, STATUSES,
      emp,
      formValues: req.body,
      error: msg,
    });
  };

  if (!first_name || !last_name || !email || !username) {
    return renderError('First name, last name, email and username are required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return renderError('Please enter a valid email address.');
  }

  // Unique email (excluding self)
  const emailExists = await Employee.findOne({ where: { email, employee_id: { [Op.ne]: id } } });
  if (emailExists) return renderError('That email address is already in use.');

  // Unique username (excluding current user)
  const existingUser = emp.user;
  if (existingUser && username !== existingUser.username) {
    const usernameTaken = await User.findOne({ where: { username, id: { [Op.ne]: existingUser.id } } });
    if (usernameTaken) return renderError('That username is already taken.');
  }

  const profile_photo_url = req.file ? `uploads/${req.file.filename}` : emp.profile_photo_url;

  await emp.update({
    first_name, last_name, email,
    phone:           phone           || null,
    department_id:   department_id   ? +department_id   : null,
    position_id:     position_id     ? +position_id     : null,
    supervisor_id:   supervisor_id   ? +supervisor_id   : null,
    team_id:         team_id         ? +team_id         : null,
    employment_type: employment_type || null,
    hire_date:       hire_date       ? new Date(hire_date) : null,
    status:          status          || emp.status,
    profile_photo_url,
  });

  if (existingUser) {
    const newRoleId = role_id ? +role_id : null;

    // Guard: cannot demote yourself away from Administrator if you are the last active one.
    if (existingUser.id === req.user.id && req.user.role === 'Administrator') {
      const adminRole = await Role.findOne({ where: { role_name: 'Administrator' } });
      if (adminRole && newRoleId !== adminRole.role_id) {
        const otherAdminCount = await User.count({
          where: {
            role_id:    adminRole.role_id,
            is_deleted: false,
            status:     'active',
            id:         { [Op.ne]: existingUser.id },
          },
        });
        if (otherAdminCount === 0) {
          return renderError('You are the last active Administrator. Assign another Administrator before changing your own role.');
        }
      }
    }

    const userUpdate = { role_id: newRoleId, username };
    if (password && password.length >= 8) {
      userUpdate.password = await bcrypt.hash(password, 10);
    } else if (password && password.length > 0) {
      return renderError('Password must be at least 8 characters.');
    }
    await existingUser.update(userUpdate);
  }

  await log(req.user.id, 'update', `Updated employee: ${first_name} ${last_name}`, 'employees', id);
  setFlash(res, 'success', 'Employee updated.');
  return res.redirect(`/admin/employees/${id}`);
};

// ── ARCHIVE (soft-delete) ─────────────────────────────────────────────────────
const destroy = async (req, res) => {
  const id = +req.params.id;
  const emp = await Employee.findOne({
    where: { employee_id: id, is_deleted: false },
    include: [{ model: User, as: 'user' }],
  });
  if (!emp) {
    setFlash(res, 'danger', 'Employee not found.');
    return res.redirect('/admin/employees');
  }

  // Guard: an Administrator cannot archive their own account.
  if (emp.user && emp.user.id === req.user.id) {
    setFlash(res, 'danger', 'You cannot archive your own account.');
    return res.redirect(`/admin/employees/${id}`);
  }

  // Soft-delete: mark as archived — all historical records are preserved.
  await emp.update({ is_deleted: true, status: 'Archived' });
  if (emp.user) {
    await emp.user.update({ is_deleted: true, status: 'inactive' });
  }

  await log(req.user.id, 'archive', `Archived employee: ${emp.first_name} ${emp.last_name}`, 'employees', id);
  setFlash(res, 'success', `${emp.first_name} ${emp.last_name} has been archived.`);
  return res.redirect('/admin/employees');
};

// ── USERNAME PATTERN ─────────────────────────────────────────────────────────
// Letters, digits, dot, underscore. 3–30 characters.
const USERNAME_RE = /^[a-zA-Z0-9._]{3,30}$/;

/**
 * Build a normalised username base from first + last name:
 *   - Decompose Unicode to strip combining accents (NFD → strip Mn category)
 *   - Remove anything that is not a-z or 0-9
 *   - firstname.lastname, all lowercase
 */
function buildUsernameBase(firstName, lastName) {
  const clean = str =>
    str.normalize('NFD')
       .replace(/[\u0300-\u036f]/g, '')   // strip combining accents
       .toLowerCase()
       .replace(/[^a-z0-9]/g, '');         // keep only letters/digits
  const f = clean(firstName  || '');
  const l = clean(lastName   || '');
  if (!f && !l) return '';
  if (!l) return f;
  if (!f) return l;
  return `${f}.${l}`;
}

// ── USERNAME CHECK (JSON, Admin only) ────────────────────────────────────────
const usernameCheck = async (req, res) => {
  const candidate = (req.query.u || '').trim().toLowerCase();

  // Must match allowed pattern before we even query
  if (!USERNAME_RE.test(candidate)) {
    return res.json({ available: false, suggestion: '' });
  }

  const taken = await User.findOne({
    where: { username: candidate },
    attributes: ['id'],
  });

  if (!taken) {
    return res.json({ available: true, suggestion: candidate });
  }

  // Find next free candidate by appending 2, 3, …
  let suggestion = '';
  for (let n = 2; n <= 99; n++) {
    const attempt = `${candidate}${n}`;
    const exists  = await User.findOne({ where: { username: attempt }, attributes: ['id'] });
    if (!exists) { suggestion = attempt; break; }
  }
  return res.json({ available: false, suggestion });
};

// ── PROFILE PHOTO (authenticated stream) ─────────────────────────────────────
const photo = async (req, res) => {
  const emp = await Employee.findOne({
    where: { employee_id: +req.params.id },
    attributes: ['profile_photo_url'],
  });
  if (!emp || !emp.profile_photo_url) {
    return res.status(404).send('No photo.');
  }

  // Security: resolve the path and ensure it stays inside the uploads directory.
  const uploadsDir = path.resolve(__dirname, '../../uploads');
  const requested  = path.resolve(uploadsDir, path.basename(emp.profile_photo_url));
  if (!requested.startsWith(uploadsDir + path.sep) && requested !== uploadsDir) {
    return res.status(403).send('Forbidden.');
  }
  if (!fs.existsSync(requested)) {
    return res.status(404).send('File not found.');
  }
  return res.sendFile(requested);
};

module.exports = { index, show, newForm, store, editForm, update, destroy, photo, usernameCheck, buildUsernameBase, USERNAME_RE };

'use strict';
/**
 * Flowline demo seed — run manually with: npm run seed
 *
 * SAFE: idempotent (findOrCreate throughout), never truncates or deletes.
 * GUARD: aborts if the DB already contains users not in the demo set.
 *
 * Demo password: Flowline2026!  (printed at end, keep out of production)
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const {
  sequelize,
  Role, Department, Position, Team,
  Employee, User,
  WorkflowStage, TaskPriority,
  Task, TaskAssignment, TaskUpdate, TaskStageHistory,
  TaskComment, Approval, Attendance, ActivityLog,
} = require('../src/models');

const DEMO_PASSWORD = 'Flowline2026!';
const DEMO_USERNAMES = [
  'admin', 'manager1', 'manager2',
  'emp1','emp2','emp3','emp4','emp5','emp6','emp7','emp8','emp9',
];

async function main() {
  console.log('🌱 Flowline seed starting…');

  // ── Guard: abort if non-demo users exist ───────────────────────────────────
  const allUsers = await User.findAll({ where: { is_deleted: false }, attributes: ['username'] });
  const extras   = allUsers.filter(u => !DEMO_USERNAMES.includes(u.username));
  if (extras.length > 0) {
    console.warn(`⚠️  Found ${extras.length} non-demo user(s): ${extras.map(u=>u.username).join(', ')}`);
    console.warn('   Aborting to protect real data. Run only against a fresh/demo database.');
    process.exit(0);
  }

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ── Roles ──────────────────────────────────────────────────────────────────
  const [adminRole]   = await Role.findOrCreate({ where: { role_name: 'Administrator' }, defaults: { description: 'Full system access' } });
  const [managerRole] = await Role.findOrCreate({ where: { role_name: 'Manager' },       defaults: { description: 'Task creation and approval' } });
  const [empRole]     = await Role.findOrCreate({ where: { role_name: 'Employee' },       defaults: { description: 'Task execution' } });

  // ── Workflow stages ────────────────────────────────────────────────────────
  const stageRows = [
    { stage_name: 'Pending',     step_order: 1, is_terminal: false },
    { stage_name: 'In Progress', step_order: 2, is_terminal: false },
    { stage_name: 'For Review',  step_order: 3, is_terminal: false },
    { stage_name: 'Completed',   step_order: 4, is_terminal: true  },
    { stage_name: 'Overdue',     step_order: 5, is_terminal: false },
  ];
  const stages = {};
  for (const s of stageRows) {
    const [row] = await WorkflowStage.findOrCreate({ where: { stage_name: s.stage_name }, defaults: s });
    stages[s.stage_name] = row;
  }

  // ── Priorities ─────────────────────────────────────────────────────────────
  const priorities = {};
  for (const p of ['Low', 'Medium', 'High']) {
    const [row] = await TaskPriority.findOrCreate({ where: { priority_name: p }, defaults: { priority_name: p } });
    priorities[p] = row;
  }

  // ── Positions ─────────────────────────────────────────────────────────────
  const posNames = ['System Administrator', 'Department Manager', 'Senior Developer', 'Developer', 'Analyst', 'HR Specialist', 'Operations Lead'];
  const posMap   = {};
  for (const n of posNames) {
    const [row] = await Position.findOrCreate({ where: { position_name: n }, defaults: { position_name: n } });
    posMap[n] = row;
  }

  // ── Departments ────────────────────────────────────────────────────────────
  const [itDept]  = await Department.findOrCreate({ where: { department_name: 'Information Technology' }, defaults: { description: 'IT and systems' } });
  const [hrDept]  = await Department.findOrCreate({ where: { department_name: 'Human Resources' },        defaults: { description: 'HR and people' } });
  const [opsDept] = await Department.findOrCreate({ where: { department_name: 'Operations' },             defaults: { description: 'Operations and logistics' } });

  // ── Employees ──────────────────────────────────────────────────────────────
  async function upsertEmployee(email, empData, username, roleId) {
    let emp = await Employee.findOne({ where: { email } });
    if (!emp) emp = await Employee.create(empData);
    let usr = await User.findOne({ where: { username } });
    if (!usr) {
      usr = await User.create({
        employee_id: emp.employee_id,
        role_id:     roleId,
        username,
        password:    hash,
        status:      'active',
      });
    }
    return { emp, usr };
  }

  const { emp: adminEmp, usr: adminUsr } = await upsertEmployee(
    'admin@flowline.local',
    { first_name: 'System',  last_name: 'Admin',   email: 'admin@flowline.local',    department_id: itDept.department_id,  position_id: posMap['System Administrator'].position_id, employment_type: 'Regular', status: 'Active', hire_date: new Date('2022-01-10') },
    'admin', adminRole.role_id,
  );

  const { emp: mgr1, usr: mgr1Usr } = await upsertEmployee(
    'manager1@flowline.local',
    { first_name: 'Maria',   last_name: 'Cruz',    email: 'manager1@flowline.local', department_id: itDept.department_id,  position_id: posMap['Department Manager'].position_id, employment_type: 'Regular', status: 'Active', hire_date: new Date('2022-03-01') },
    'manager1', managerRole.role_id,
  );

  const { emp: mgr2, usr: mgr2Usr } = await upsertEmployee(
    'manager2@flowline.local',
    { first_name: 'Jose',    last_name: 'Reyes',   email: 'manager2@flowline.local', department_id: hrDept.department_id,  position_id: posMap['Department Manager'].position_id, employment_type: 'Regular', status: 'Active', hire_date: new Date('2022-04-15') },
    'manager2', managerRole.role_id,
  );

  const empDefs = [
    ['emp1', 'Ana',     'Santos',  'ana@flowline.local',    itDept,  'Senior Developer', 'Regular'],
    ['emp2', 'Ben',     'Tan',     'ben@flowline.local',    itDept,  'Developer',         'Regular'],
    ['emp3', 'Carla',   'Gomez',   'carla@flowline.local',  itDept,  'Developer',         'Contractual'],
    ['emp4', 'David',   'Lim',     'david@flowline.local',  itDept,  'Analyst',           'Regular'],
    ['emp5', 'Elena',   'Park',    'elena@flowline.local',  hrDept,  'HR Specialist',     'Regular'],
    ['emp6', 'Francis', 'Torres',  'francis@flowline.local',hrDept,  'HR Specialist',     'Part-time'],
    ['emp7', 'Grace',   'Villanueva','grace@flowline.local',opsDept, 'Operations Lead',   'Regular'],
    ['emp8', 'Henry',   'Wu',      'henry@flowline.local',  opsDept, 'Analyst',           'Regular'],
    ['emp9', 'Iris',    'Lopez',   'iris@flowline.local',   opsDept, 'Developer',         'Probationary'],
  ];
  const empMap = {};
  for (const [uname, fn, ln, email, dept, pos, etype] of empDefs) {
    const { emp } = await upsertEmployee(
      email,
      { first_name: fn, last_name: ln, email, department_id: dept.department_id, position_id: posMap[pos].position_id, employment_type: etype, status: 'Active', hire_date: new Date('2023-01-01') },
      uname, empRole.role_id,
    );
    empMap[uname] = emp;
  }

  // ── Teams ─────────────────────────────────────────────────────────────────
  const [devTeam] = await Team.findOrCreate({ where: { team_name: 'Backend Dev' },  defaults: { department_id: itDept.department_id,  team_lead_id: empMap['emp1'].employee_id } });
  const [qaTeam]  = await Team.findOrCreate({ where: { team_name: 'QA & Analysis' },defaults: { department_id: itDept.department_id,  team_lead_id: empMap['emp4'].employee_id } });
  const [hrTeam]  = await Team.findOrCreate({ where: { team_name: 'HR Core' },      defaults: { department_id: hrDept.department_id,  team_lead_id: empMap['emp5'].employee_id } });
  const [opsTeam] = await Team.findOrCreate({ where: { team_name: 'Ops Alpha' },    defaults: { department_id: opsDept.department_id, team_lead_id: empMap['emp7'].employee_id } });

  // Assign employees to teams
  const teamAssigns = [
    [empMap['emp1'], devTeam], [empMap['emp2'], devTeam], [empMap['emp3'], devTeam],
    [empMap['emp4'], qaTeam],
    [empMap['emp5'], hrTeam],  [empMap['emp6'], hrTeam],
    [empMap['emp7'], opsTeam], [empMap['emp8'], opsTeam], [empMap['emp9'], opsTeam],
  ];
  for (const [emp, team] of teamAssigns) {
    if (emp.team_id !== team.team_id) await emp.update({ team_id: team.team_id });
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  // Helper: findOrCreate a task by title + creator
  async function seedTask(title, desc, stageKey, priorityKey, daysRelative, creatorUsr, assignees, extras = {}) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysRelative);
    const startDate = new Date(dueDate);
    startDate.setDate(startDate.getDate() - 7);

    let task = await Task.findOne({ where: { task_title: title, created_by_user_id: creatorUsr.id, is_deleted: false } });
    if (!task) {
      task = await Task.create({
        task_title:         title,
        task_description:   desc,
        stage_id:           stages[stageKey].stage_id,
        priority_id:        priorities[priorityKey].priority_id,
        start_date:         startDate,
        due_date:           dueDate,
        created_by_user_id: creatorUsr.id,
        ...extras,
      });
      // Stage history
      await TaskStageHistory.create({
        task_id:            task.task_id,
        changed_by_user_id: creatorUsr.id,
        new_stage_id:       stages['Pending'].stage_id,
        remarks:            'Task created.',
      });
      if (stageKey !== 'Pending') {
        await TaskStageHistory.create({
          task_id:            task.task_id,
          changed_by_user_id: creatorUsr.id,
          old_stage_id:       stages['Pending'].stage_id,
          new_stage_id:       stages[stageKey].stage_id,
          remarks:            `Set to ${stageKey}.`,
        });
      }
    }

    // Assignments
    for (const emp of assignees) {
      const existing = await TaskAssignment.findOne({ where: { task_id: task.task_id, employee_id: emp.employee_id } });
      if (!existing) {
        await TaskAssignment.create({ task_id: task.task_id, employee_id: emp.employee_id, assigned_by_user_id: creatorUsr.id });
        await ActivityLog.create({ user_id: creatorUsr.id, action_type: 'assignment', description: `Created task: ${title}`, table_affected: 'tasks', record_id: task.task_id });
      }
    }
    return task;
  }

  // 25 tasks spread across all stages and both managers
  const t1  = await seedTask('Setup CI/CD Pipeline',         'Configure Jenkins + Docker',          'Completed',   'High',   -20, mgr1Usr, [empMap['emp1'], empMap['emp2']]);
  const t2  = await seedTask('API Rate Limiter',              'Implement per-IP throttle',           'Completed',   'Medium', -15, mgr1Usr, [empMap['emp1']]);
  const t3  = await seedTask('User Auth Module',              'JWT + httpOnly cookie auth',           'Completed',   'High',   -10, mgr1Usr, [empMap['emp2'], empMap['emp3']]);
  const t4  = await seedTask('Database Indexing Review',      'Analyse slow queries',                'Completed',   'Medium',  -8, mgr1Usr, [empMap['emp4']]);
  const t5  = await seedTask('Onboarding Portal',            'New employee self-service portal',     'For Review',  'High',    -2, mgr1Usr, [empMap['emp2'], empMap['emp3']]);
  const t6  = await seedTask('Performance Dashboard',        'Chart.js visualisations',              'For Review',  'Medium',   2, mgr1Usr, [empMap['emp1']]);
  const t7  = await seedTask('Notification Service',         'In-app notification engine',           'In Progress', 'High',    5, mgr1Usr, [empMap['emp2'], empMap['emp3']]);
  const t8  = await seedTask('File Upload Security',         'Whitelist + path traversal check',    'In Progress', 'High',    7, mgr1Usr, [empMap['emp1'], empMap['emp4']]);
  const t9  = await seedTask('Search & Filter API',          'Multi-field search endpoints',        'In Progress', 'Medium',  10, mgr1Usr, [empMap['emp3']]);
  const t10 = await seedTask('Mobile Responsive UI',         'Bootstrap 5 responsive layout',       'Pending',     'Low',    14, mgr1Usr, [empMap['emp2']]);
  const t11 = await seedTask('Email Integration',            'SMTP config and templates',            'Pending',     'Medium', 20, mgr1Usr, [empMap['emp1']]);
  const t12 = await seedTask('Salary Structure Review',      'Update compensation bands',            'Completed',   'Medium', -12, mgr2Usr, [empMap['emp5']]);
  const t13 = await seedTask('Recruitment Pipeline Setup',  'ATS integration planning',             'Completed',   'Low',     -9, mgr2Usr, [empMap['emp5'], empMap['emp6']]);
  const t14 = await seedTask('Leave Policy Update',          'Update handbook and system',           'For Review',  'Medium',   0, mgr2Usr, [empMap['emp6']]);
  const t15 = await seedTask('Employee Survey Q3',           'Design and distribute survey',         'In Progress', 'Low',     8, mgr2Usr, [empMap['emp5'], empMap['emp6']]);
  const t16 = await seedTask('Warehouse Process Map',        'Document ops workflow',                'Completed',   'Medium', -14, mgr2Usr, [empMap['emp7']]);
  const t17 = await seedTask('Inventory System Spec',        'Write requirements document',          'In Progress', 'High',    6, mgr2Usr, [empMap['emp7'], empMap['emp8']]);
  const t18 = await seedTask('Ops KPI Dashboard',            'Tableau / Chart.js integration',      'Pending',     'Medium', 16, mgr2Usr, [empMap['emp8']]);
  const t19 = await seedTask('Vendor Contract Review',       'Legal compliance check',              'Pending',     'Low',    21, mgr2Usr, [empMap['emp9']]);
  // Past-due tasks → will be marked Overdue by the job on next run (seeded as Pending/In Progress)
  const t20 = await seedTask('Legacy Code Refactor',         'Refactor auth module to MVC',          'Pending',     'High',    -5, mgr1Usr, [empMap['emp1'], empMap['emp2']]);
  const t21 = await seedTask('Security Audit Fixes',         'Address pentest findings',             'In Progress', 'High',    -3, mgr1Usr, [empMap['emp3'], empMap['emp4']]);
  const t22 = await seedTask('DB Backup Automation',         'Scheduled mysqldump to S3',            'Pending',     'Medium',  -6, mgr1Usr, [empMap['emp2']]);
  const t23 = await seedTask('HR Data Migration',            'Move legacy HR records to new DB',     'In Progress', 'High',    -4, mgr2Usr, [empMap['emp5']]);
  const t24 = await seedTask('Supplier Onboarding Flow',    'Document and automate supplier KYC',   'Pending',     'Medium',  -7, mgr2Usr, [empMap['emp7'], empMap['emp8']]);
  const t25 = await seedTask('IT Asset Inventory Update',   'Audit and update asset register',      'In Progress', 'Low',     -2, mgr2Usr, [empMap['emp9']]);

  // ── Task updates / progress ────────────────────────────────────────────────
  const updatesData = [
    [t5,  empMap['emp2'], 'Completed frontend skeleton',               80],
    [t6,  empMap['emp1'], 'Chart data wired, review ready',            100],
    [t7,  empMap['emp2'], 'Notification model created',                 40],
    [t7,  empMap['emp3'], 'Queue consumer implemented',                 60],
    [t8,  empMap['emp1'], 'Whitelist middleware done',                  50],
    [t9,  empMap['emp3'], 'Search endpoint live, filters in progress',  35],
    [t15, empMap['emp5'], 'Survey draft complete',                      60],
    [t17, empMap['emp7'], 'Requirements 80% documented',                80],
    [t21, empMap['emp3'], 'XSS and CSRF fixes applied',                 70],
    [t23, empMap['emp5'], 'Schema mapping completed',                   45],
  ];
  for (const [task, emp, msg, pct] of updatesData) {
    const exists = await TaskUpdate.findOne({ where: { task_id: task.task_id, employee_id: emp.employee_id } });
    if (!exists) {
      await TaskUpdate.create({ task_id: task.task_id, employee_id: emp.employee_id, update_message: msg, progress_percent: pct });
    }
  }

  // ── Approvals (for Completed tasks) ───────────────────────────────────────
  const completedTasks = [t1, t2, t3, t4, t12, t13, t16];
  for (const task of completedTasks) {
    const exists = await require('../src/models').Approval.findOne({ where: { task_id: task.task_id } });
    if (!exists) {
      const approverUsr = task.created_by_user_id === mgr1Usr.id ? mgr1Usr : mgr2Usr;
      await require('../src/models').Approval.create({
        task_id:          task.task_id,
        approver_user_id: approverUsr.id,
        approval_status:  'Approved',
        remarks:          'Well done.',
        approval_date:    new Date(),
      });
      await TaskStageHistory.create({
        task_id:            task.task_id,
        changed_by_user_id: approverUsr.id,
        old_stage_id:       stages['For Review'].stage_id,
        new_stage_id:       stages['Completed'].stage_id,
        remarks:            'Approved.',
      });
    }
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  const commentsData = [
    [t5,  mgr1Usr.id, 'Looks good, just clean up the error handling.'],
    [t5,  empMap['emp2'].employee_id, 'Will fix before final submission.'],  // employee user id fetched below
    [t7,  mgr1Usr.id, 'Make sure retries are handled.'],
    [t8,  empMap['emp1'].employee_id, 'Path traversal test added.'],
    [t17, mgr2Usr.id, 'Good progress, need API section next.'],
  ];
  // Resolve employee user ids
  for (const row of commentsData) {
    if (row[1] > 1000) {
      // It's an employee_id, need to find user id
      const usr = await User.findOne({ where: { employee_id: row[1] } });
      if (usr) row[1] = usr.id;
    }
  }
  const { TaskComment } = require('../src/models');
  for (const [task, userId, text] of commentsData) {
    const exists = await TaskComment.findOne({ where: { task_id: task.task_id, user_id: userId } });
    if (!exists) await TaskComment.create({ task_id: task.task_id, user_id: userId, comment_text: text });
  }

  // ── Attendance (last 7 days) ───────────────────────────────────────────────
  const allEmps = [adminEmp, mgr1, mgr2, ...Object.values(empMap)];
  for (let d = 6; d >= 0; d--) {
    const day = new Date(); day.setDate(day.getDate() - d);
    const dayStr = day.toISOString().split('T')[0];
    // Skip weekends
    const dow = day.getDay();
    if (dow === 0 || dow === 6) continue;

    for (const emp of allEmps) {
      const exists = await Attendance.findOne({ where: { employee_id: emp.employee_id, date: dayStr } });
      if (!exists) {
        await Attendance.create({
          employee_id:       emp.employee_id,
          date:              dayStr,
          time_in:           '08:00',
          time_out:          d === 0 ? null : '17:00',  // today: no time_out yet
          attendance_status: 'Present',
        });
      }
    }
  }

  console.log('\n✅ Seed complete.\n');
  console.log('Demo logins (password: Flowline2026!)\n' + '─'.repeat(44));
  console.log('  admin     Administrator  admin@flowline.local');
  console.log('  manager1  Manager        manager1@flowline.local');
  console.log('  manager2  Manager        manager2@flowline.local');
  console.log('  emp1-emp9 Employee       (name)@flowline.local');
  console.log('─'.repeat(44));
}

main()
  .catch(err => { console.error('Seed error:', err); process.exit(1); })
  .finally(() => sequelize.close());

'use strict';

// Load every model (each file defines itself against the shared sequelize instance)
const Role             = require('./Role');
const Department       = require('./Department');
const Position         = require('./Position');
const Team             = require('./Team');
const Employee         = require('./Employee');
const User             = require('./User');
const WorkflowStage    = require('./WorkflowStage');
const TaskPriority     = require('./TaskPriority');
const Task             = require('./Task');
const TaskAssignment   = require('./TaskAssignment');
const TaskUpdate       = require('./TaskUpdate');
const TaskStageHistory = require('./TaskStageHistory');
const TaskComment      = require('./TaskComment');
const Approval         = require('./Approval');
const Attachment       = require('./Attachment');
const Notification     = require('./Notification');
const Attendance       = require('./Attendance');
const ActivityLog      = require('./ActivityLog');

// ─────────────────────────────────────────────────────────────────────────────
// Role ↔ User
// ─────────────────────────────────────────────────────────────────────────────
Role.hasMany(User, { as: 'users', foreignKey: 'role_id' });
User.belongsTo(Role, { as: 'role', foreignKey: 'role_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Department ↔ Employee  (one department, many employees)
// ─────────────────────────────────────────────────────────────────────────────
Department.hasMany(Employee, { as: 'employees', foreignKey: 'department_id' });
Employee.belongsTo(Department, { as: 'department', foreignKey: 'department_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Department ↔ Team
// ─────────────────────────────────────────────────────────────────────────────
Department.hasMany(Team, { as: 'teams', foreignKey: 'department_id' });
Team.belongsTo(Department, { as: 'department', foreignKey: 'department_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Position ↔ Employee
// ─────────────────────────────────────────────────────────────────────────────
Position.hasMany(Employee, { as: 'employees', foreignKey: 'position_id' });
Employee.belongsTo(Position, { as: 'position', foreignKey: 'position_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Employee self-reference (supervisor / subordinates)
// ─────────────────────────────────────────────────────────────────────────────
Employee.belongsTo(Employee, { as: 'supervisor',   foreignKey: 'supervisor_id' });
Employee.hasMany(Employee,   { as: 'subordinates', foreignKey: 'supervisor_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Team ↔ Employee  — two separate FKs, each must have a distinct alias
//
//   team_lead_id : the team lead (one Employee leads many Teams)
//   team_id      : the member's team (one Team has many Members)
// ─────────────────────────────────────────────────────────────────────────────
Team.belongsTo(Employee, { as: 'teamLead', foreignKey: 'team_lead_id' });
Employee.hasMany(Team,   { as: 'ledTeams', foreignKey: 'team_lead_id' });

Team.hasMany(Employee,   { as: 'members', foreignKey: 'team_id' });
Employee.belongsTo(Team, { as: 'team',    foreignKey: 'team_id' });

// ─────────────────────────────────────────────────────────────────────────────
// User ↔ Employee  (one-to-one)
// ─────────────────────────────────────────────────────────────────────────────
User.belongsTo(Employee, { as: 'employee', foreignKey: 'employee_id' });
Employee.hasOne(User,    { as: 'user',     foreignKey: 'employee_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Task ↔ WorkflowStage
// ─────────────────────────────────────────────────────────────────────────────
WorkflowStage.hasMany(Task, { as: 'tasks', foreignKey: 'stage_id' });
Task.belongsTo(WorkflowStage, { as: 'stage', foreignKey: 'stage_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Task ↔ TaskPriority
// ─────────────────────────────────────────────────────────────────────────────
TaskPriority.hasMany(Task, { as: 'tasks',    foreignKey: 'priority_id' });
Task.belongsTo(TaskPriority, { as: 'priority', foreignKey: 'priority_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Task ↔ User  — two FKs: creator and updater
// ─────────────────────────────────────────────────────────────────────────────
User.hasMany(Task, { as: 'createdTasks', foreignKey: 'created_by_user_id' });
Task.belongsTo(User, { as: 'creator',   foreignKey: 'created_by_user_id' });

User.hasMany(Task, { as: 'updatedTasks', foreignKey: 'updated_by_user_id' });
Task.belongsTo(User, { as: 'updater',   foreignKey: 'updated_by_user_id' });

// ─────────────────────────────────────────────────────────────────────────────
// TaskAssignment ↔ Task, Employee, User
// ─────────────────────────────────────────────────────────────────────────────
Task.hasMany(TaskAssignment,       { as: 'assignments', foreignKey: 'task_id' });
TaskAssignment.belongsTo(Task,     { as: 'task',        foreignKey: 'task_id' });

Employee.hasMany(TaskAssignment,       { as: 'taskAssignments', foreignKey: 'employee_id' });
TaskAssignment.belongsTo(Employee,     { as: 'employee',        foreignKey: 'employee_id' });

User.hasMany(TaskAssignment,           { as: 'assignedByMe',    foreignKey: 'assigned_by_user_id' });
TaskAssignment.belongsTo(User,         { as: 'assignedBy',      foreignKey: 'assigned_by_user_id' });

// ─────────────────────────────────────────────────────────────────────────────
// TaskUpdate ↔ Task, Employee
// ─────────────────────────────────────────────────────────────────────────────
Task.hasMany(TaskUpdate,       { as: 'updates',  foreignKey: 'task_id' });
TaskUpdate.belongsTo(Task,     { as: 'task',     foreignKey: 'task_id' });

Employee.hasMany(TaskUpdate,   { as: 'taskUpdates', foreignKey: 'employee_id' });
TaskUpdate.belongsTo(Employee, { as: 'employee',    foreignKey: 'employee_id' });

// ─────────────────────────────────────────────────────────────────────────────
// TaskStageHistory ↔ Task, User, WorkflowStage (old + new — two FKs)
// ─────────────────────────────────────────────────────────────────────────────
Task.hasMany(TaskStageHistory,             { as: 'stageHistory', foreignKey: 'task_id' });
TaskStageHistory.belongsTo(Task,           { as: 'task',         foreignKey: 'task_id' });

User.hasMany(TaskStageHistory,             { as: 'stageHistories', foreignKey: 'changed_by_user_id' });
TaskStageHistory.belongsTo(User,           { as: 'changedBy',      foreignKey: 'changed_by_user_id' });

WorkflowStage.hasMany(TaskStageHistory,    { as: 'oldHistories', foreignKey: 'old_stage_id' });
TaskStageHistory.belongsTo(WorkflowStage,  { as: 'oldStage',     foreignKey: 'old_stage_id' });

WorkflowStage.hasMany(TaskStageHistory,    { as: 'newHistories', foreignKey: 'new_stage_id' });
TaskStageHistory.belongsTo(WorkflowStage,  { as: 'newStage',     foreignKey: 'new_stage_id' });

// ─────────────────────────────────────────────────────────────────────────────
// TaskComment ↔ Task, User
// ─────────────────────────────────────────────────────────────────────────────
Task.hasMany(TaskComment,       { as: 'comments', foreignKey: 'task_id' });
TaskComment.belongsTo(Task,     { as: 'task',     foreignKey: 'task_id' });

User.hasMany(TaskComment,       { as: 'comments', foreignKey: 'user_id' });
TaskComment.belongsTo(User,     { as: 'user',     foreignKey: 'user_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Approval ↔ Task, User
// ─────────────────────────────────────────────────────────────────────────────
Task.hasMany(Approval,       { as: 'approvals', foreignKey: 'task_id' });
Approval.belongsTo(Task,     { as: 'task',      foreignKey: 'task_id' });

User.hasMany(Approval,       { as: 'approvals', foreignKey: 'approver_user_id' });
Approval.belongsTo(User,     { as: 'approver',  foreignKey: 'approver_user_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Attachment ↔ Task, User
// ─────────────────────────────────────────────────────────────────────────────
Task.hasMany(Attachment,        { as: 'attachments', foreignKey: 'task_id' });
Attachment.belongsTo(Task,      { as: 'task',        foreignKey: 'task_id' });

User.hasMany(Attachment,        { as: 'attachments',  foreignKey: 'uploaded_by_user_id' });
Attachment.belongsTo(User,      { as: 'uploadedBy',   foreignKey: 'uploaded_by_user_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Notification ↔ User  — two FKs: recipient and sender
// ─────────────────────────────────────────────────────────────────────────────
User.hasMany(Notification,       { as: 'notifications',     foreignKey: 'user_id' });
Notification.belongsTo(User,     { as: 'recipient',         foreignKey: 'user_id' });

User.hasMany(Notification,       { as: 'sentNotifications', foreignKey: 'sender_user_id' });
Notification.belongsTo(User,     { as: 'sender',            foreignKey: 'sender_user_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Attendance ↔ Employee
// ─────────────────────────────────────────────────────────────────────────────
Employee.hasMany(Attendance,   { as: 'attendance', foreignKey: 'employee_id' });
Attendance.belongsTo(Employee, { as: 'employee',   foreignKey: 'employee_id' });

// ─────────────────────────────────────────────────────────────────────────────
// ActivityLog ↔ User
// ─────────────────────────────────────────────────────────────────────────────
User.hasMany(ActivityLog,        { as: 'activityLogs', foreignKey: 'user_id' });
ActivityLog.belongsTo(User,      { as: 'user',         foreignKey: 'user_id' });

// ─────────────────────────────────────────────────────────────────────────────
// Exports — single object so controllers can destructure what they need
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  sequelize: require('../config/database'),
  Role,
  Department,
  Position,
  Team,
  Employee,
  User,
  WorkflowStage,
  TaskPriority,
  Task,
  TaskAssignment,
  TaskUpdate,
  TaskStageHistory,
  TaskComment,
  Approval,
  Attachment,
  Notification,
  Attendance,
  ActivityLog,
};

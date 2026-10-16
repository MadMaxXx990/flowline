'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

/**
 * TaskReminder — records which deadline-reminder buckets have already been
 * sent for a task. The (task_id, reminder_type) UNIQUE constraint makes the
 * deadline-reminder job idempotent: inserting a duplicate simply fails, so the
 * same notification is never sent twice.
 *
 * reminder_type values (defined in lib/deadlineReminderRules.js):
 *   'due_3d'    — reminder sent when task is due in ≤ 3 days
 *   'due_1d'    — reminder sent when task is due in ≤ 1 day
 *   'due_today' — reminder sent on the day the task is due
 */
const TaskReminder = sequelize.define('TaskReminder', {
  reminder_id: {
    type:          DataTypes.INTEGER,
    primaryKey:    true,
    autoIncrement: true,
  },
  task_id: {
    type:      DataTypes.INTEGER,
    allowNull: false,
  },
  reminder_type: {
    type:      DataTypes.STRING(50),
    allowNull: false,
  },
  sent_at: {
    type:         DataTypes.DATE,
    allowNull:    false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName:  'task_reminders',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['task_id', 'reminder_type'], name: 'task_reminders_task_reminder_unique' },
  ],
});

module.exports = TaskReminder;

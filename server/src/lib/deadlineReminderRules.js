'use strict';
/**
 * lib/deadlineReminderRules.js
 *
 * Decides which deadline-reminder "buckets" a task qualifies for right now,
 * and records each one atomically so the same reminder is never sent twice.
 *
 * Reminder buckets (reminder_type values):
 *   'due_3d'    — task due date is within the next 3 days (exclusive of today)
 *   'due_1d'    — task due date is tomorrow (within next 24 h, not today)
 *   'due_today' — task due date is today
 *
 * Idempotency: each bucket is recorded by INSERT IGNORE (Sequelize findOrCreate
 * on the UNIQUE (task_id, reminder_type) key). If the row already exists the
 * insert silently fails — no duplicate notification is sent.
 *
 * Pure business logic — no HTTP, no Express. Tested in test/reportMetrics.test.js.
 */

const { TaskReminder } = require('../models');

// ── Bucket definitions ────────────────────────────────────────────────────────
// Each entry: { type, minDays (inclusive), maxDays (exclusive) }
// "days until due" = Math.ceil((dueDate - startOfToday) / MS_PER_DAY)
const BUCKETS = [
  { type: 'due_today', minDays: 0, maxDays: 1  },
  { type: 'due_1d',    minDays: 1, maxDays: 2  },
  { type: 'due_3d',    minDays: 2, maxDays: 4  },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Return the reminder_type string(s) that apply to `dueDate` relative to
 * `now` (defaults to the current time). Returns an empty array if none apply.
 *
 * This is a pure function — no DB access — so it is easy to unit-test.
 *
 * @param {Date}   dueDate
 * @param {Date}   [now]     defaults to new Date()
 * @returns {string[]}       e.g. ['due_1d'] or []
 */
function applicableBuckets(dueDate, now = new Date()) {
  // Start of today (midnight local time)
  const todayMidnight = new Date(now);
  todayMidnight.setHours(0, 0, 0, 0);

  const msUntilDue   = dueDate.getTime() - todayMidnight.getTime();
  const daysUntilDue = Math.floor(msUntilDue / MS_PER_DAY); // integer days from midnight

  // Tasks already overdue (negative) are handled by overdueJob — skip here.
  if (daysUntilDue < 0) return [];

  return BUCKETS
    .filter(b => daysUntilDue >= b.minDays && daysUntilDue < b.maxDays)
    .map(b => b.type);
}

/**
 * For a single task, determine which reminder buckets apply, attempt to
 * record each one (idempotent), and return an array of the bucket types
 * that were newly inserted (i.e. not already sent).
 *
 * @param {object} task  — Sequelize Task instance with at least { task_id, due_date }
 * @param {Date}   [now] — injectable for testing
 * @returns {Promise<string[]>}  newly-recorded reminder types
 */
async function processTaskReminders(task, now = new Date()) {
  const buckets = applicableBuckets(new Date(task.due_date), now);
  if (!buckets.length) return [];

  const newlySent = [];

  for (const reminderType of buckets) {
    try {
      const [, created] = await TaskReminder.findOrCreate({
        where:    { task_id: task.task_id, reminder_type: reminderType },
        defaults: { task_id: task.task_id, reminder_type: reminderType, sent_at: now },
      });
      if (created) newlySent.push(reminderType);
    } catch (err) {
      // Unique-constraint race condition (two concurrent job runs) — safe to ignore.
      if (err.name !== 'SequelizeUniqueConstraintError') throw err;
    }
  }

  return newlySent;
}

module.exports = { applicableBuckets, processTaskReminders, BUCKETS };

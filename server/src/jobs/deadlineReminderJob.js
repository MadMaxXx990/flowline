'use strict';
/**
 * jobs/deadlineReminderJob.js
 *
 * Periodically scans for tasks whose due date falls within a reminder window
 * and sends a notification to every assignee + the task creator.
 *
 * Structure mirrors overdueJob.js:
 *   - A `running` flag prevents overlapping runs.
 *   - Per-task try/catch keeps one bad task from aborting the whole batch.
 *   - Notifications are sent via lib/notify.send with type 'deadline'.
 *   - Idempotency is enforced by lib/deadlineReminderRules.processTaskReminders,
 *     which inserts into task_reminders and returns only newly-recorded buckets.
 */

const { Op } = require('sequelize');
const {
  Task, TaskAssignment, WorkflowStage, Employee, User,
} = require('../models');
const { send }                   = require('../lib/notify');
const { processTaskReminders }   = require('../lib/deadlineReminderRules');

// Human-readable labels for notification messages
const BUCKET_LABELS = {
  due_today: 'today',
  due_1d:    'tomorrow',
  due_3d:    'in 3 days',
};

let running = false;

const runDeadlineReminderJob = async () => {
  if (running) {
    console.log('[deadlineReminderJob] Skipping — previous run still in progress.');
    return;
  }
  running = true;

  try {
    // Only remind about active (non-terminal) tasks.
    const terminalStages = await WorkflowStage.findAll({
      where: { is_terminal: true },
    });
    const terminalIds = terminalStages.map(s => s.stage_id);

    // Include Completed and Overdue by name as an additional safety net.
    const skipStages = await WorkflowStage.findAll({
      where: { stage_name: { [Op.in]: ['Completed', 'Overdue'] } },
    });
    const skipIds = [...new Set([
      ...terminalIds,
      ...skipStages.map(s => s.stage_id),
    ])];

    // Window: due within the next 4 days (covers 3d, 1d, today buckets).
    const now       = new Date();
    const windowEnd = new Date(now);
    windowEnd.setDate(windowEnd.getDate() + 4);
    windowEnd.setHours(23, 59, 59, 999);

    // Start of today — skip tasks already overdue.
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const tasks = await Task.findAll({
      where: {
        is_deleted: false,
        due_date:   { [Op.between]: [todayStart, windowEnd] },
        ...(skipIds.length ? { stage_id: { [Op.notIn]: skipIds } } : {}),
      },
      include: [
        {
          model: TaskAssignment, as: 'assignments',
          include: [{
            model: Employee, as: 'employee',
            include: [{ model: User, as: 'user', attributes: ['id'] }],
          }],
        },
      ],
    });

    if (!tasks.length) {
      console.log('[deadlineReminderJob] No tasks in reminder window.');
      return;
    }

    console.log(`[deadlineReminderJob] Checking ${tasks.length} task(s) for reminders.`);

    for (const task of tasks) {
      try {
        const newBuckets = await processTaskReminders(task, now);
        if (!newBuckets.length) continue;

        // Deduplicate recipient user IDs: assignees + creator
        const assignedUserIds = task.assignments
          .map(a => a.employee?.user?.id)
          .filter(Boolean);
        const notifyIds = Array.from(
          new Set([...assignedUserIds, task.created_by_user_id])
        );

        for (const bucket of newBuckets) {
          const label = BUCKET_LABELS[bucket] ?? bucket;
          await send(
            notifyIds,
            'deadline',
            'Task Due Soon',
            `Task "${task.task_title}" is due ${label}.`,
            task.task_id,
            null,
          );
          console.log(
            `[deadlineReminderJob] Sent '${bucket}' reminder for task ${task.task_id} ` +
            `("${task.task_title}") to ${notifyIds.length} user(s).`
          );
        }
      } catch (taskErr) {
        console.error(
          `[deadlineReminderJob] Error processing task ${task.task_id}:`,
          taskErr.message
        );
      }
    }
  } catch (err) {
    console.error('[deadlineReminderJob] Unexpected error:', err.message);
  } finally {
    running = false;
  }
};

module.exports = { runDeadlineReminderJob };

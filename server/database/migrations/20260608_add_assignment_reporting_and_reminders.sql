-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260608_add_assignment_reporting_and_reminders
--
-- Adds the `task_reminders` table used by the deadline-reminder job to record
-- which reminders have already been sent, ensuring idempotency across runs.
--
-- Each row represents one reminder "bucket" sent for a task
-- (e.g. "3 days before due", "1 day before due", "due today").
-- The UNIQUE constraint on (task_id, reminder_type) prevents duplicates.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `task_reminders` (
  `reminder_id`   int(11)       NOT NULL AUTO_INCREMENT,
  `task_id`       int(11)       NOT NULL,
  `reminder_type` varchar(50)   NOT NULL COMMENT 'e.g. due_3d, due_1d, due_today',
  `sent_at`       datetime(3)   NOT NULL DEFAULT current_timestamp(3),
  `created_at`    datetime(3)   NOT NULL DEFAULT current_timestamp(3),
  `updated_at`    datetime(3)   NOT NULL DEFAULT current_timestamp(3)
                                ON UPDATE current_timestamp(3),
  PRIMARY KEY (`reminder_id`),
  UNIQUE KEY `task_reminders_task_reminder_unique` (`task_id`, `reminder_type`),
  KEY `task_reminders_task_id_fkey` (`task_id`),
  CONSTRAINT `task_reminders_task_id_fkey`
    FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

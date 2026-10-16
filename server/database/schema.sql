
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
DROP TABLE IF EXISTS `activity_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `activity_logs` (
  `log_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `action_type` varchar(191) NOT NULL,
  `table_affected` varchar(191) DEFAULT NULL,
  `record_id` int(11) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`log_id`),
  KEY `activity_logs_user_id_fkey` (`user_id`),
  CONSTRAINT `activity_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `approvals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `approvals` (
  `approval_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `approver_user_id` int(11) NOT NULL,
  `approval_status` varchar(191) NOT NULL,
  `remarks` text DEFAULT NULL,
  `requested_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `approval_date` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`approval_id`),
  KEY `approvals_task_id_fkey` (`task_id`),
  KEY `approvals_approver_user_id_fkey` (`approver_user_id`),
  CONSTRAINT `approvals_approver_user_id_fkey` FOREIGN KEY (`approver_user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `approvals_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attachments` (
  `attachment_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `uploaded_by_user_id` int(11) NOT NULL,
  `file_name` varchar(191) NOT NULL,
  `file_path` varchar(191) NOT NULL,
  `file_type` varchar(191) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `uploaded_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`attachment_id`),
  KEY `attachments_task_id_fkey` (`task_id`),
  KEY `attachments_uploaded_by_user_id_fkey` (`uploaded_by_user_id`),
  CONSTRAINT `attachments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON UPDATE CASCADE,
  CONSTRAINT `attachments_uploaded_by_user_id_fkey` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `attendance` (
  `attendance_id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) NOT NULL,
  `date` datetime(3) NOT NULL,
  `time_in` varchar(191) DEFAULT NULL,
  `time_out` varchar(191) DEFAULT NULL,
  `attendance_status` varchar(191) NOT NULL DEFAULT 'Present',
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`attendance_id`),
  KEY `attendance_employee_id_fkey` (`employee_id`),
  UNIQUE KEY `attendance_employee_date_unique` (`employee_id`,`date`),
  CONSTRAINT `attendance_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `departments` (
  `department_id` int(11) NOT NULL AUTO_INCREMENT,
  `department_name` varchar(191) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `departments_department_name_key` (`department_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `employees`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `employees` (
  `employee_id` int(11) NOT NULL AUTO_INCREMENT,
  `department_id` int(11) DEFAULT NULL,
  `position_id` int(11) DEFAULT NULL,
  `supervisor_id` int(11) DEFAULT NULL,
  `first_name` varchar(191) NOT NULL,
  `last_name` varchar(191) NOT NULL,
  `email` varchar(191) NOT NULL,
  `phone` varchar(191) DEFAULT NULL,
  `employment_type` varchar(191) DEFAULT NULL,
  `emergency_contact` varchar(191) DEFAULT NULL,
  `profile_photo_url` varchar(191) DEFAULT NULL,
  `hire_date` datetime(3) DEFAULT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'Active',
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `team_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`employee_id`),
  UNIQUE KEY `employees_email_key` (`email`),
  KEY `employees_department_id_fkey` (`department_id`),
  KEY `employees_position_id_fkey` (`position_id`),
  KEY `employees_supervisor_id_fkey` (`supervisor_id`),
  KEY `employees_team_id_fkey` (`team_id`),
  CONSTRAINT `employees_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `employees_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `positions` (`position_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `employees_supervisor_id_fkey` FOREIGN KEY (`supervisor_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `employees_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams` (`team_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `notifications` (
  `notification_id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `sender_user_id` int(11) DEFAULT NULL,
  `notification_type` varchar(191) NOT NULL,
  `reference_id` int(11) DEFAULT NULL,
  `title` varchar(191) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `notifications_user_id_fkey` (`user_id`),
  KEY `notifications_sender_user_id_fkey` (`sender_user_id`),
  CONSTRAINT `notifications_sender_user_id_fkey` FOREIGN KEY (`sender_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `positions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `positions` (
  `position_id` int(11) NOT NULL AUTO_INCREMENT,
  `position_name` varchar(191) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`position_id`),
  UNIQUE KEY `positions_position_name_key` (`position_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `roles` (
  `role_id` int(11) NOT NULL AUTO_INCREMENT,
  `role_name` varchar(191) NOT NULL,
  `description` varchar(191) DEFAULT NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `roles_role_name_key` (`role_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_assignments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `task_assignments` (
  `assignment_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `employee_id` int(11) NOT NULL,
  `assigned_by_user_id` int(11) NOT NULL,
  `assigned_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`assignment_id`),
  KEY `task_assignments_task_id_fkey` (`task_id`),
  KEY `task_assignments_employee_id_fkey` (`employee_id`),
  KEY `task_assignments_assigned_by_user_id_fkey` (`assigned_by_user_id`),
  CONSTRAINT `task_assignments_assigned_by_user_id_fkey` FOREIGN KEY (`assigned_by_user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `task_assignments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON UPDATE CASCADE,
  CONSTRAINT `task_assignments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_comments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `task_comments` (
  `comment_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `comment_text` text NOT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`comment_id`),
  KEY `task_comments_task_id_fkey` (`task_id`),
  KEY `task_comments_user_id_fkey` (`user_id`),
  CONSTRAINT `task_comments_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON UPDATE CASCADE,
  CONSTRAINT `task_comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_priorities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `task_priorities` (
  `priority_id` int(11) NOT NULL AUTO_INCREMENT,
  `priority_name` varchar(191) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`priority_id`),
  UNIQUE KEY `task_priorities_priority_name_key` (`priority_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_stage_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `task_stage_history` (
  `history_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `changed_by_user_id` int(11) NOT NULL,
  `old_stage_id` int(11) DEFAULT NULL,
  `new_stage_id` int(11) NOT NULL,
  `remarks` text DEFAULT NULL,
  `changed_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`history_id`),
  KEY `task_stage_history_task_id_fkey` (`task_id`),
  KEY `task_stage_history_changed_by_user_id_fkey` (`changed_by_user_id`),
  KEY `task_stage_history_old_stage_id_fkey` (`old_stage_id`),
  KEY `task_stage_history_new_stage_id_fkey` (`new_stage_id`),
  CONSTRAINT `task_stage_history_changed_by_user_id_fkey` FOREIGN KEY (`changed_by_user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `task_stage_history_new_stage_id_fkey` FOREIGN KEY (`new_stage_id`) REFERENCES `workflow_stages` (`stage_id`) ON UPDATE CASCADE,
  CONSTRAINT `task_stage_history_old_stage_id_fkey` FOREIGN KEY (`old_stage_id`) REFERENCES `workflow_stages` (`stage_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `task_stage_history_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_updates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `task_updates` (
  `update_id` int(11) NOT NULL AUTO_INCREMENT,
  `task_id` int(11) NOT NULL,
  `employee_id` int(11) NOT NULL,
  `update_message` text NOT NULL,
  `progress_percent` int(11) NOT NULL DEFAULT 0,
  `update_date` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`update_id`),
  KEY `task_updates_task_id_fkey` (`task_id`),
  KEY `task_updates_employee_id_fkey` (`employee_id`),
  CONSTRAINT `task_updates_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON UPDATE CASCADE,
  CONSTRAINT `task_updates_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `tasks` (
  `task_id` int(11) NOT NULL AUTO_INCREMENT,
  `stage_id` int(11) NOT NULL,
  `task_title` varchar(191) NOT NULL,
  `task_description` text DEFAULT NULL,
  `priority_id` int(11) NOT NULL,
  `start_date` datetime(3) DEFAULT NULL,
  `due_date` datetime(3) NOT NULL,
  `created_by_user_id` int(11) NOT NULL,
  `updated_by_user_id` int(11) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`task_id`),
  KEY `tasks_stage_id_fkey` (`stage_id`),
  KEY `tasks_priority_id_fkey` (`priority_id`),
  KEY `tasks_created_by_user_id_fkey` (`created_by_user_id`),
  KEY `tasks_updated_by_user_id_fkey` (`updated_by_user_id`),
  CONSTRAINT `tasks_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `tasks_priority_id_fkey` FOREIGN KEY (`priority_id`) REFERENCES `task_priorities` (`priority_id`) ON UPDATE CASCADE,
  CONSTRAINT `tasks_stage_id_fkey` FOREIGN KEY (`stage_id`) REFERENCES `workflow_stages` (`stage_id`) ON UPDATE CASCADE,
  CONSTRAINT `tasks_updated_by_user_id_fkey` FOREIGN KEY (`updated_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `teams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `teams` (
  `team_id` int(11) NOT NULL AUTO_INCREMENT,
  `team_name` varchar(191) NOT NULL,
  `department_id` int(11) NOT NULL,
  `team_lead_id` int(11) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`team_id`),
  KEY `teams_department_id_fkey` (`department_id`),
  KEY `teams_team_lead_id_fkey` (`team_lead_id`),
  CONSTRAINT `teams_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON UPDATE CASCADE,
  CONSTRAINT `teams_team_lead_id_fkey` FOREIGN KEY (`team_lead_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `employee_id` int(11) DEFAULT NULL,
  `role_id` int(11) DEFAULT NULL,
  `username` varchar(191) NOT NULL,
  `password` varchar(191) NOT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'active',
  `reset_token` varchar(191) DEFAULT NULL,
  `failed_login_attempts` int(11) NOT NULL DEFAULT 0,
  `last_login` datetime(3) DEFAULT NULL,
  `is_deleted` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  `reset_expires` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_username_key` (`username`),
  UNIQUE KEY `users_employee_id_key` (`employee_id`),
  UNIQUE KEY `users_reset_token_key` (`reset_token`),
  KEY `users_role_id_fkey` (`role_id`),
  CONSTRAINT `users_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`employee_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `users_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `workflow_stages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `workflow_stages` (
  `stage_id` int(11) NOT NULL AUTO_INCREMENT,
  `stage_name` varchar(191) NOT NULL,
  `step_order` int(11) NOT NULL,
  `is_terminal` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`stage_id`),
  UNIQUE KEY `workflow_stages_stage_name_key` (`stage_name`),
  UNIQUE KEY `workflow_stages_step_order_key` (`step_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
DROP TABLE IF EXISTS `task_reminders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE `task_reminders` (
  `reminder_id`   int(11)       NOT NULL AUTO_INCREMENT,
  `task_id`       int(11)       NOT NULL,
  `reminder_type` varchar(50)   NOT NULL COMMENT 'e.g. due_3d, due_1d, due_today',
  `sent_at`       datetime(3)   NOT NULL DEFAULT current_timestamp(3),
  `created_at`    datetime(3)   NOT NULL DEFAULT current_timestamp(3),
  `updated_at`    datetime(3)   NOT NULL,
  PRIMARY KEY (`reminder_id`),
  UNIQUE KEY `task_reminders_task_reminder_unique` (`task_id`,`reminder_type`),
  KEY `task_reminders_task_id_fkey` (`task_id`),
  CONSTRAINT `task_reminders_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `tasks` (`task_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


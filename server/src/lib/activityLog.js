'use strict';
const { ActivityLog } = require('../models');

/**
 * Write an activity log entry.
 * Signature is unchanged from the Prisma version — all callers continue to work.
 *
 * @param {number}  userId         - ID of the acting user (users.id)
 * @param {string}  actionType     - e.g. 'login', 'create', 'update', 'delete'
 * @param {string}  description    - Human-readable description of the action
 * @param {string}  [tableAffected] - Database table affected (optional)
 * @param {number}  [recordId]     - PK of the affected record (optional)
 */
const log = async (userId, actionType, description, tableAffected = null, recordId = null) => {
  try {
    await ActivityLog.create({
      user_id:        userId,
      action_type:    actionType,
      description,
      table_affected: tableAffected,
      record_id:      recordId,
    });
  } catch (e) {
    console.error('ActivityLog error:', e.message);
  }
};

module.exports = { log };

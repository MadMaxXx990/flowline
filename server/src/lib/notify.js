'use strict';
const { Notification } = require('../models');

/**
 * Send a notification to one or more user IDs.
 * Signature is unchanged from the Prisma version — all callers continue to work.
 *
 * @param {number|number[]} userIds
 * @param {string}  type          - notification_type e.g. 'assignment', 'status', 'approval', 'deadline'
 * @param {string}  title
 * @param {string}  message
 * @param {number}  [referenceId] - reference_id (task id, etc.)
 * @param {number}  [senderUserId]
 */
const send = async (userIds, type, title, message, referenceId = null, senderUserId = null) => {
  const ids = Array.isArray(userIds) ? userIds : [userIds];
  const data = ids.map(uid => ({
    user_id:           uid,
    sender_user_id:    senderUserId,
    notification_type: type,
    reference_id:      referenceId,
    title,
    message,
    is_read:           false,
  }));
  try {
    await Notification.bulkCreate(data);
  } catch (e) {
    console.error('Notify error:', e.message);
  }
};

module.exports = { send };

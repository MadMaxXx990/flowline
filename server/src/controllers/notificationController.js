'use strict';
const { Notification } = require('../models');
const { setFlash } = require('../middleware/flash');

const PAGE_SIZE = 20;

/**
 * GET /{role}/notifications
 * Lists the logged-in user's notifications, newest first, paginated.
 */
const index = async (req, res) => {
  const page   = Math.max(1, +req.query.page || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const { count, rows } = await Notification.findAndCountAll({
    where:  { user_id: req.user.id },
    order:  [['created_at', 'DESC']],
    limit:  PAGE_SIZE,
    offset,
  });

  const basePath = req.user.role === 'Administrator' ? '/admin'
                 : req.user.role === 'Manager'       ? '/manager'
                 : '/employee';

  res.render('notifications/index', {
    role: req.user.role, basePath, user: req.user,
    currentPath: `${basePath}/notifications`,
    notifications: rows,
    total: count,
    pages: Math.ceil(count / PAGE_SIZE),
    page,
  });
};

/**
 * POST /{role}/notifications/:id/read
 * Mark a single notification as read (owner only).
 */
const markRead = async (req, res) => {
  const id = +req.params.id;
  const basePath = req.user.role === 'Administrator' ? '/admin'
                 : req.user.role === 'Manager'       ? '/manager'
                 : '/employee';

  // Only the owner may mark their own notification
  const notif = await Notification.findOne({
    where: { notification_id: id, user_id: req.user.id },
  });
  if (notif) await notif.update({ is_read: true });

  // Redirect back to the related task if reference_id exists, else to list
  if (notif && notif.reference_id) {
    return res.redirect(`${basePath}/tasks/${notif.reference_id}`);
  }
  return res.redirect(`${basePath}/notifications`);
};

/**
 * POST /{role}/notifications/read-all
 * Mark all of the current user's notifications as read.
 */
const markAllRead = async (req, res) => {
  const basePath = req.user.role === 'Administrator' ? '/admin'
                 : req.user.role === 'Manager'       ? '/manager'
                 : '/employee';

  await Notification.update(
    { is_read: true },
    { where: { user_id: req.user.id, is_read: false } },
  );

  setFlash(res, 'success', 'All notifications marked as read.');
  return res.redirect(`${basePath}/notifications`);
};

module.exports = { index, markRead, markAllRead };

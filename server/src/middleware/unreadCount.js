'use strict';
const { Notification } = require('../models');

/**
 * Middleware that runs a single COUNT query and writes the result into
 * res.locals.unreadCount for use in EJS views (sidebar badge).
 *
 * Only fires when req.user is set (i.e. after authenticate).
 * Safe to mount globally — silently skips if not authenticated.
 */
const unreadCount = async (req, res, next) => {
  if (!req.user) { res.locals.unreadCount = 0; return next(); }
  try {
    res.locals.unreadCount = await Notification.count({
      where: { user_id: req.user.id, is_read: false },
    });
  } catch {
    res.locals.unreadCount = 0;
  }
  next();
};

module.exports = unreadCount;

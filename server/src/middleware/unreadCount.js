'use strict';
const { Notification } = require('../models');

/**
 * Middleware that runs a single COUNT query and writes the result into
 * res.locals.unreadCount for use in EJS views (sidebar badge).
 *
 * Mount this AFTER authenticate inside each role router so req.user is
 * guaranteed to be set. It will still silently short-circuit if called
 * without req.user (defensive fallback).
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

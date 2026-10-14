'use strict';
const { Op } = require('sequelize');
const { ActivityLog, User, Employee } = require('../models');

const PAGE_SIZE = 20;

/**
 * GET /admin/activity-logs
 * Admin-only. Paginated, filters: user_id, action_type, from, to, search (on description).
 * Original had take: 200 hard limit; replaced with proper pagination (20/page).
 */
const index = async (req, res) => {
  const { user_id, action_type, from, to, search, page: qPage } = req.query;
  const page   = Math.max(1, +qPage || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const where = {};
  if (user_id)     where.user_id     = +user_id;
  if (action_type) where.action_type = action_type;
  if (search)      where.description = { [Op.like]: `%${search}%` };
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at[Op.gte] = new Date(from);
    if (to)   { const end = new Date(to); end.setHours(23,59,59,999); where.created_at[Op.lte] = end; }
  }

  const { count, rows } = await ActivityLog.findAndCountAll({
    where,
    include: [{ model: User, as: 'user', include: [{ model: Employee, as: 'employee' }] }],
    order:   [['created_at', 'DESC']],
    limit:   PAGE_SIZE,
    offset,
  });

  // Distinct action types for the filter dropdown
  const actionTypes = await ActivityLog.findAll({
    attributes: [[require('sequelize').fn('DISTINCT', require('sequelize').col('action_type')), 'action_type']],
    raw: true,
    order: [['action_type', 'ASC']],
  });

  // Users for the filter dropdown
  const users = await User.findAll({
    where: { is_deleted: false },
    include: [{ model: Employee, as: 'employee', attributes: ['first_name', 'last_name'] }],
    attributes: ['id', 'username'],
    order: [['username', 'ASC']],
  });

  res.render('activity-logs/index', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/activity-logs',
    logs: rows, total: count,
    pages: Math.ceil(count / PAGE_SIZE), page,
    actionTypes: actionTypes.map(a => a.action_type).filter(Boolean),
    users,
    query: {
      user_id:     user_id     || '',
      action_type: action_type || '',
      from:        from        || '',
      to:          to          || '',
      search:      search      || '',
    },
  });
};

module.exports = { index };

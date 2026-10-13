'use strict';
const { Op }       = require('sequelize');
const { Position, Employee } = require('../models');
const { log }      = require('../lib/activityLog');
const { setFlash } = require('../middleware/flash');

const index = async (req, res) => {
  const positions = await Position.findAll({ order: [['position_name', 'ASC']] });
  for (const p of positions) {
    p.dataValues.employeeCount = await Employee.count({
      where: { position_id: p.position_id, is_deleted: false },
    });
  }
  res.render('admin/positions', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/positions',
    positions,
    error: null,
  });
};

const store = async (req, res) => {
  const { position_name, description } = req.body;
  if (!position_name || !position_name.trim()) {
    setFlash(res, 'danger', 'Position name is required.');
    return res.redirect('/admin/positions');
  }
  const exists = await Position.findOne({ where: { position_name: position_name.trim() } });
  if (exists) {
    setFlash(res, 'danger', `Position "${position_name}" already exists.`);
    return res.redirect('/admin/positions');
  }
  const pos = await Position.create({ position_name: position_name.trim(), description: description || null });
  await log(req.user.id, 'create', `Created position: ${position_name}`, 'positions', pos.position_id);
  setFlash(res, 'success', 'Position created.');
  return res.redirect('/admin/positions');
};

const update = async (req, res) => {
  const { position_name, description } = req.body;
  const id = +req.params.id;
  if (!position_name || !position_name.trim()) {
    setFlash(res, 'danger', 'Position name is required.');
    return res.redirect('/admin/positions');
  }
  const dup = await Position.findOne({
    where: { position_name: position_name.trim(), position_id: { [Op.ne]: id } },
  });
  if (dup) {
    setFlash(res, 'danger', `Position "${position_name}" already exists.`);
    return res.redirect('/admin/positions');
  }
  await Position.update({ position_name: position_name.trim(), description: description || null }, { where: { position_id: id } });
  await log(req.user.id, 'update', `Updated position: ${position_name}`, 'positions', id);
  setFlash(res, 'success', 'Position updated.');
  return res.redirect('/admin/positions');
};

// Note: original Prisma route used hard-delete (prisma.position.delete).
// Preserved exactly — positions have no is_deleted column in the schema.
const destroy = async (req, res) => {
  const id = +req.params.id;
  await Position.destroy({ where: { position_id: id } });
  setFlash(res, 'success', 'Position removed.');
  return res.redirect('/admin/positions');
};

module.exports = { index, store, update, destroy };

'use strict';
const { Op }        = require('sequelize');
const { Department, Employee } = require('../models');
const { log }       = require('../lib/activityLog');
const { setFlash }  = require('../middleware/flash');

const index = async (req, res) => {
  const depts = await Department.findAll({
    where: { is_deleted: false },
    order: [['department_name', 'ASC']],
  });
  // Attach active employee counts manually (no Prisma _count equivalent needed)
  for (const d of depts) {
    d.dataValues.employeeCount = await Employee.count({
      where: { department_id: d.department_id, is_deleted: false },
    });
  }
  res.render('admin/departments', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/departments',
    depts,
    error: null, editing: null, form: { department_name: '', description: '' },
  });
};

const store = async (req, res) => {
  const { department_name, description } = req.body;
  if (!department_name || !department_name.trim()) {
    setFlash(res, 'danger', 'Department name is required.');
    return res.redirect('/admin/departments');
  }
  const exists = await Department.findOne({ where: { department_name: department_name.trim(), is_deleted: false } });
  if (exists) {
    setFlash(res, 'danger', `Department "${department_name}" already exists.`);
    return res.redirect('/admin/departments');
  }
  const dept = await Department.create({ department_name: department_name.trim(), description: description || null });
  await log(req.user.id, 'create', `Created department: ${department_name}`, 'departments', dept.department_id);
  setFlash(res, 'success', 'Department created.');
  return res.redirect('/admin/departments');
};

const update = async (req, res) => {
  const { department_name, description } = req.body;
  const id = +req.params.id;
  if (!department_name || !department_name.trim()) {
    setFlash(res, 'danger', 'Department name is required.');
    return res.redirect('/admin/departments');
  }
  const dup = await Department.findOne({
    where: { department_name: department_name.trim(), is_deleted: false, department_id: { [Op.ne]: id } },
  });
  if (dup) {
    setFlash(res, 'danger', `Department "${department_name}" already exists.`);
    return res.redirect('/admin/departments');
  }
  await Department.update({ department_name: department_name.trim(), description: description || null }, { where: { department_id: id } });
  await log(req.user.id, 'update', `Updated department: ${department_name}`, 'departments', id);
  setFlash(res, 'success', 'Department updated.');
  return res.redirect('/admin/departments');
};

const destroy = async (req, res) => {
  const id = +req.params.id;
  await Department.update({ is_deleted: true }, { where: { department_id: id } });
  await log(req.user.id, 'delete', `Deleted department id ${id}`, 'departments', id);
  setFlash(res, 'success', 'Department removed.');
  return res.redirect('/admin/departments');
};

module.exports = { index, store, update, destroy };

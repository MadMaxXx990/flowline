'use strict';
const { Team, Department, Employee } = require('../models');
const { log }      = require('../lib/activityLog');
const { setFlash } = require('../middleware/flash');

/**
 * Shared data loader — used by GET /admin/teams and by the task form.
 * Returns { teams, depts, employees } with associations included.
 */
const loadTeamsData = async () => {
  const teams = await Team.findAll({
    where: { is_deleted: false },
    include: [
      { model: Department, as: 'department' },
      { model: Employee,   as: 'teamLead', attributes: ['employee_id', 'first_name', 'last_name'] },
      { model: Employee,   as: 'members',  where: { is_deleted: false }, required: false,
        attributes: ['employee_id', 'first_name', 'last_name'] },
    ],
    order: [['team_name', 'ASC']],
  });
  const depts = await Department.findAll({
    where: { is_deleted: false }, order: [['department_name', 'ASC']],
  });
  const employees = await Employee.findAll({
    where: { is_deleted: false },
    attributes: ['employee_id', 'first_name', 'last_name', 'department_id'],
    order: [['first_name', 'ASC'], ['last_name', 'ASC']],
  });
  return { teams, depts, employees };
};

const index = async (req, res) => {
  const { teams, depts, employees } = await loadTeamsData();
  res.render('admin/teams', {
    role: 'Administrator', basePath: '/admin', user: req.user,
    currentPath: '/admin/teams',
    teams, depts, employees,
  });
};

const store = async (req, res) => {
  const { team_name, department_id, team_lead_id } = req.body;
  if (!team_name || !team_name.trim() || !department_id) {
    setFlash(res, 'danger', 'Team name and department are required.');
    return res.redirect('/admin/teams');
  }
  const team = await Team.create({
    team_name:     team_name.trim(),
    department_id: +department_id,
    team_lead_id:  team_lead_id ? +team_lead_id : null,
  });
  await log(req.user.id, 'create', `Created team: ${team_name}`, 'teams', team.team_id);
  setFlash(res, 'success', 'Team created.');
  return res.redirect('/admin/teams');
};

const update = async (req, res) => {
  const { team_name, department_id, team_lead_id } = req.body;
  const id = +req.params.id;
  if (!team_name || !team_name.trim() || !department_id) {
    setFlash(res, 'danger', 'Team name and department are required.');
    return res.redirect('/admin/teams');
  }
  await Team.update({
    team_name:     team_name.trim(),
    department_id: +department_id,
    team_lead_id:  team_lead_id ? +team_lead_id : null,
  }, { where: { team_id: id } });
  await log(req.user.id, 'update', `Updated team: ${team_name}`, 'teams', id);
  setFlash(res, 'success', 'Team updated.');
  return res.redirect('/admin/teams');
};

const destroy = async (req, res) => {
  const id = +req.params.id;
  // Unlink members first, then soft-delete the team
  await Employee.update({ team_id: null }, { where: { team_id: id } });
  await Team.update({ is_deleted: true }, { where: { team_id: id } });
  await log(req.user.id, 'delete', `Deleted team id ${id}`, 'teams', id);
  setFlash(res, 'success', 'Team removed.');
  return res.redirect('/admin/teams');
};

module.exports = { index, store, update, destroy, loadTeamsData };

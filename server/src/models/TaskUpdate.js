'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TaskUpdate = sequelize.define('TaskUpdate', {
  update_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  task_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  update_message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  progress_percent: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  update_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'task_updates',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = TaskUpdate;

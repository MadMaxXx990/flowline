'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Task = sequelize.define('Task', {
  task_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  stage_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  task_title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  task_description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  priority_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  start_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  created_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  updated_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'tasks',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Task;

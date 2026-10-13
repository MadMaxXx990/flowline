'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TaskPriority = sequelize.define('TaskPriority', {
  priority_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  priority_name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
}, {
  tableName: 'task_priorities',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = TaskPriority;

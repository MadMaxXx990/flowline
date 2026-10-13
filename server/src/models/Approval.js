'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Approval = sequelize.define('Approval', {
  approval_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  task_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  approver_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  approval_status: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  requested_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  approval_date: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'approvals',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Approval;

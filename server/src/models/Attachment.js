'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// uploaded_at is a non-standard timestamp — declared explicitly, not via createdAt/updatedAt.
const Attachment = sequelize.define('Attachment', {
  attachment_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  task_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  uploaded_by_user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  file_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  file_path: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  file_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
  // Non-standard column — declared explicitly.
  uploaded_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'attachments',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Attachment;

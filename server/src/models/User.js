'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Primary key is "id" (not user_id) — matches the database column exactly.
// The password column is named "password" — matches the database column exactly.
const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    unique: true,
  },
  role_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  // Column is named "password" in the database — do NOT rename.
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'active',
  },
  reset_token: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  reset_expires: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  failed_login_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  last_login: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'users',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = User;

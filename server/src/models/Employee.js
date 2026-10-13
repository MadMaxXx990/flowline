'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Employee = sequelize.define('Employee', {
  employee_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  department_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  position_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  supervisor_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  team_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  first_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  last_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  employment_type: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  emergency_contact: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  profile_photo_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  hire_date: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Active',
  },
  is_deleted: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  },
}, {
  tableName: 'employees',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = Employee;

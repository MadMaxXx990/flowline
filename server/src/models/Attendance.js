'use strict';
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// The "date" column in the database is a DATE (not DATETIME).
const Attendance = sequelize.define('Attendance', {
  attendance_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  employee_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // Stored as DATE in MySQL; DATEONLY maps to DATE without time component.
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  time_in: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  time_out: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  attendance_status: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Present',
  },
}, {
  tableName: 'attendance',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['employee_id', 'date'],
      name:   'attendance_employee_date_unique',
    },
  ],
});

module.exports = Attendance;

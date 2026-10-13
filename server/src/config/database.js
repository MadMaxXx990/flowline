'use strict';
const { Sequelize } = require('sequelize');

// DATABASE_URL = mysql://user:pass@host:port/dbname
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'mysql',
  logging: false,          // set to console.log to see SQL
  define: {
    underscored: true,     // default for all models; each model may override
    freezeTableName: true, // never pluralise table names
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  },
  dialectOptions: {
    // Return JS Date objects, not strings, for DATETIME columns
    dateStrings: false,
    typeCast: true,
  },
});

module.exports = sequelize;

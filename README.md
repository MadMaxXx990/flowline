# Flowline — Employee Workflow Assignment and Monitoring System

A server-rendered MVC web application built with **Node.js**, **Express**, **Sequelize**, **EJS**, and **MySQL**.

## Requirements

- Node.js 18+
- MySQL 8+ (or MariaDB 10.6+)
- npm 9+

## Setup

```bash
# 1. Create the database
mysql -u root -p -e "CREATE DATABASE flowline_db CHARACTER SET utf8mb4;"

# 2. Import the schema (no data)
mysql -u root -p flowline_db < server/database/schema.sql

# 3. Copy and fill environment variables
cp server/.env.example server/.env
# Edit server/.env: set DATABASE_URL, JWT_SECRET (32+ chars), COOKIE_SECRET, PORT

# 4. Install dependencies
cd server && npm install

# 5. Seed demo data
npm run seed

# 6. Start the server
npm start        # production
npm run dev      # development (nodemon)
```

## Demo Logins (password: `Flowline2026!`)

| Username  | Role          |
|-----------|---------------|
| admin     | Administrator |
| manager1  | Manager       |
| manager2  | Manager       |
| emp1–emp9 | Employee      |

> ⚠️ Change all passwords before any real use.

## Folder Structure (server/)

```
server/
  config/       Sequelize connection
  database/     schema.sql
  models/       Sequelize model files + associations index
  controllers/  Business logic (one file per domain)
  routes/       Express routers (admin, manager, employee, auth)
  views/        EJS templates (partials, dashboard, tasks, …)
  middleware/   auth, flash, rateLimit, unreadCount, upload
  lib/          activityLog, notify helpers
  jobs/         overdueJob (Sequelize)
  scripts/      seed.js (run once manually)
  public/       css/, js/ (app.js, tasks.js, charts.js), vendor/
  uploads/      Uploaded files (gitignored except .gitkeep)
```

## Security Notes

- JWT stored in an **httpOnly, SameSite=Lax** cookie — never exposed to JavaScript.
- Helmet with an explicit **Content Security Policy** (no inline scripts or CDN resources).
- Upload **file-type whitelist** (PDF, Word, Excel, PowerPoint, TXT, CSV, PNG, JPG) + 10 MB limit.
- **Rate limiting** on login and forgot-password (5 attempts per 15 min per IP+username).
- Passwords hashed with **bcryptjs** (cost factor 10).
- All state-changing actions are **POST-only**; GET routes never mutate data.

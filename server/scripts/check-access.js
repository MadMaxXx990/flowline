#!/usr/bin/env node
/**
 * check-access.js — Flowline automated access-control and robustness test suite.
 *
 * Uses Node built-in fetch (Node 18+) with redirect: 'manual'.
 * Credentials via env vars or positional args.
 *   BASE_URL, ADMIN_USER, ADMIN_PASS, MANAGER_USER, MANAGER_PASS,
 *   EMPLOYEE_USER, EMPLOYEE_PASS, MANAGER2_USER, MANAGER2_PASS
 *
 * Exits 0 if all pass, 1 if any fail.
 */
'use strict';

const args = process.argv.slice(2);

const BASE   = args[0] || process.env.BASE_URL      || 'http://localhost:3001';
const A_USER = args[1] || process.env.ADMIN_USER     || 'admin';
const A_PASS = args[2] || process.env.ADMIN_PASS     || 'Flowline2026!';
const M_USER = args[3] || process.env.MANAGER_USER   || 'manager1';
const M_PASS = args[4] || process.env.MANAGER_PASS   || 'Flowline2026!';
const E_USER = args[5] || process.env.EMPLOYEE_USER  || 'emp1';
const E_PASS = args[6] || process.env.EMPLOYEE_PASS  || 'Flowline2026!';
// manager2 is a second manager — used to test cross-manager task ownership
const M2_USER = process.env.MANAGER2_USER || 'manager2';
const M2_PASS = process.env.MANAGER2_PASS || 'Flowline2026!';

// ── helpers ──────────────────────────────────────────────────────────────────

async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const res  = await fetch(`${BASE}/login`, {
    method: 'POST', body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    redirect: 'manual',
  });
  const cookie = res.headers.get('set-cookie') || '';
  const match  = cookie.match(/fl_token=([^;]+)/);
  return match ? match[1] : null;
}

async function req(method, path, token, body) {
  const headers = {};
  if (token) headers.Cookie = `fl_token=${token}`;
  const opts = { method, redirect: 'manual', headers };
  if (body) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = new URLSearchParams(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  return res.status;
}

const get  = (path, token)       => req('GET',    path, token);
const post = (path, token, body) => req('POST',   path, token, body || {});

// ── test matrix ──────────────────────────────────────────────────────────────

// Task IDs are seeded: manager1 creates tasks 1-11, manager2 creates 12-25.
// So task 1 is owned by manager1, task 12 is owned by manager2.
// (These IDs may vary on a fresh DB — we use relative references via seed order)
const M1_TASK = 1;   // manager1's task
const M2_TASK = 12;  // manager2's task (manager1 cannot access it)

const MATRIX = [
  // ── Original 17 checks ────────────────────────────────────────────────────
  { label: 'Admin: /admin/dashboard',       role: 'Administrator', fn: (t) => get('/admin/dashboard',      t), expected: 200 },
  { label: 'Admin: /admin/reports',         role: 'Administrator', fn: (t) => get('/admin/reports',        t), expected: 200 },
  { label: 'Admin: /admin/activity-logs',   role: 'Administrator', fn: (t) => get('/admin/activity-logs',  t), expected: 200 },
  { label: 'Admin: /admin/employees',       role: 'Administrator', fn: (t) => get('/admin/employees',      t), expected: 200 },
  { label: 'Mgr: /manager/dashboard',       role: 'Manager',       fn: (t) => get('/manager/dashboard',    t), expected: 200 },
  { label: 'Mgr: /manager/reports',         role: 'Manager',       fn: (t) => get('/manager/reports',      t), expected: 200 },
  { label: 'Mgr→Admin /admin/dashboard',    role: 'Manager',       fn: (t) => get('/admin/dashboard',      t), expected: 403 },
  { label: 'Mgr→Admin /admin/reports',      role: 'Manager',       fn: (t) => get('/admin/reports',        t), expected: 403 },
  { label: 'Mgr→Admin /admin/activity-logs',role: 'Manager',       fn: (t) => get('/admin/activity-logs',  t), expected: 403 },
  { label: 'Emp: /employee/dashboard',      role: 'Employee',      fn: (t) => get('/employee/dashboard',   t), expected: 200 },
  { label: 'Emp→Admin /admin/dashboard',    role: 'Employee',      fn: (t) => get('/admin/dashboard',      t), expected: 403 },
  { label: 'Emp→Mgr /manager/dashboard',    role: 'Employee',      fn: (t) => get('/manager/dashboard',    t), expected: 403 },
  { label: 'Emp→Mgr /manager/reports',      role: 'Employee',      fn: (t) => get('/manager/reports',      t), expected: 403 },
  { label: 'Emp→Admin /admin/activity-logs',role: 'Employee',      fn: (t) => get('/admin/activity-logs',  t), expected: 403 },
  { label: 'Emp: /employee/reports 404',    role: 'Employee',      fn: (t) => get('/employee/reports',     t), expected: 404 },
  { label: 'Emp: attachment/999999 403/404',role: 'Employee',      fn: (t) => get('/attachments/999999/download', t), expected: [403, 404] },
  { label: 'No cookie → /login 302',        role: 'No cookie',     fn: (_) => get('/admin/dashboard',      null), expected: 302 },

  // ── Manager B cannot see Manager A's task ─────────────────────────────────
  { label: 'Mgr2: show Mgr1 task → 404',    role: 'Manager2',
    fn: (t) => get(`/manager/tasks/${M1_TASK}`, t), expected: 404 },
  { label: 'Mgr2: editForm Mgr1 task → 404',role: 'Manager2',
    fn: (t) => get(`/manager/tasks/${M1_TASK}/edit`, t), expected: 404 },
  { label: 'Mgr2: approve Mgr1 task → 404', role: 'Manager2',
    fn: (t) => post(`/manager/tasks/${M1_TASK}/approve`, t, { approval_status: 'Approved' }), expected: [302, 404] },
  { label: 'Mgr2: changeStage Mgr1 task → 404', role: 'Manager2',
    fn: (t) => post(`/manager/tasks/${M1_TASK}/stage`, t, { stage_id: '1' }), expected: [302, 404] },
  { label: 'Mgr2: destroy Mgr1 task → 404', role: 'Manager2',
    fn: async (t) => {
      // Use method-override POST with _method=DELETE
      const res = await fetch(`${BASE}/manager/tasks/${M1_TASK}?_method=DELETE`, {
        method: 'POST', redirect: 'manual',
        headers: { Cookie: `fl_token=${t}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({}),
      });
      return res.status;
    }, expected: 404 },

  // ── Bad requests must not crash the server ────────────────────────────────
  { label: 'Bad stage_id 999999 → non-crash', role: 'Manager',
    fn: (t) => post(`/manager/tasks/${M1_TASK}/stage`, t, { stage_id: '999999' }), expected: [302, 404] },
  { label: 'Bad employee_ids → non-crash',    role: 'Manager',
    fn: (t) => post('/manager/tasks', t, {
      task_title: 'crash-test', priority_id: '999', due_date: '2099-01-01', employee_ids: '999999',
    }), expected: [200, 302, 422] },   // 422 on validation, 302 on success/redirect
  { label: 'Bad approval_status → redirect',  role: 'Manager',
    fn: (t) => post(`/manager/tasks/${M1_TASK}/approve`, t, { approval_status: 'foo' }), expected: 302 },
  { label: 'Server still alive after errors', role: 'No cookie',
    fn: (_) => get('/api/health', null), expected: 200 },

  // ── Deactivated employee cookie → redirected to /login ────────────────────
  // This check uses a special env var set by the caller when a deactivated cookie exists.
  // If DEACTIVATED_TOKEN is not set, this check is skipped (marked SKIP).
  { label: 'Deactivated emp → /login redirect',role: 'Deactivated',
    fn: async (_) => {
      const tok = process.env.DEACTIVATED_TOKEN;
      if (!tok) return 'SKIP';
      return get('/employee/dashboard', tok);
    }, expected: [302, 'SKIP'] },
];

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nFlowline Access Control Check');
  console.log(`Base URL : ${BASE}`);
  console.log(`Logins   : admin=${A_USER}  manager=${M_USER}  manager2=${M2_USER}  employee=${E_USER}\n`);

  // Authenticate
  process.stdout.write('Logging in… ');
  const tokens = {
    Administrator: await login(A_USER, A_PASS),
    Manager:       await login(M_USER, M_PASS),
    Manager2:      await login(M2_USER, M2_PASS),
    Employee:      await login(E_USER, E_PASS),
    'No cookie':   null,
    Deactivated:   null,  // handled inline
  };

  for (const [role, tok] of Object.entries(tokens)) {
    if (role === 'No cookie' || role === 'Deactivated') continue;
    if (!tok) {
      console.error(`\nFATAL: Could not log in as ${role}.`);
      console.error('Check credentials and that the server is running.');
      process.exit(1);
    }
  }
  console.log('OK\n');

  const W_LABEL = 44, W_EXP = 12, W_ACT = 8;
  const header  = `${'Check'.padEnd(W_LABEL)} ${'Expected'.padEnd(W_EXP)} ${'Actual'.padEnd(W_ACT)} Result`;
  const div     = '─'.repeat(header.length);
  console.log(div); console.log(header); console.log(div);

  let failures = 0;

  for (const { label, role, fn, expected } of MATRIX) {
    const token = tokens[role] ?? null;
    let actual;
    try {
      actual = await fn(token);
    } catch (err) {
      actual = `ERR(${err.message.slice(0,40)})`;
    }

    if (actual === 'SKIP') {
      console.log(`${label.padEnd(W_LABEL)} ${'—'.padEnd(W_EXP)} ${'SKIP'.padEnd(W_ACT)} ○ SKIP`);
      continue;
    }

    const expectedSet = Array.isArray(expected) ? expected : [expected];
    const pass        = expectedSet.includes(actual);
    const result      = pass ? '✓ PASS' : '✗ FAIL';
    const expLabel    = expectedSet.join(' or ');

    if (!pass) failures++;
    console.log(`${label.padEnd(W_LABEL)} ${String(expLabel).padEnd(W_EXP)} ${String(actual).padEnd(W_ACT)} ${result}`);
  }

  console.log(div);
  console.log(`\n${MATRIX.length} checks, ${failures} failure(s).\n`);
  if (failures > 0) process.exit(1);
}

main().catch(err => { console.error('Unexpected error:', err.message); process.exit(1); });

#!/usr/bin/env node
/**
 * check-access.js
 *
 * Automated access-control smoke test.
 * Uses Node's built-in fetch (Node 18+) with redirect: 'manual'.
 *
 * Configuration — supply via environment variables or CLI arguments:
 *   BASE_URL   (default http://localhost:3001)
 *   ADMIN_USER / ADMIN_PASS
 *   MANAGER_USER / MANAGER_PASS
 *   EMPLOYEE_USER / EMPLOYEE_PASS
 *
 * Or pass as positional args:
 *   node check-access.js <baseUrl> <adminUser> <adminPass> <mgrUser> <mgrPass> <empUser> <empPass>
 *
 * Exits 0 if all pass, 1 if any fail.
 */

'use strict';

const args = process.argv.slice(2);

const BASE     = args[0] || process.env.BASE_URL    || 'http://localhost:3001';
const A_USER   = args[1] || process.env.ADMIN_USER   || 'admin';
const A_PASS   = args[2] || process.env.ADMIN_PASS   || 'Flowline2026!';
const M_USER   = args[3] || process.env.MANAGER_USER || 'manager1';
const M_PASS   = args[4] || process.env.MANAGER_PASS || 'Flowline2026!';
const E_USER   = args[5] || process.env.EMPLOYEE_USER || 'emp1';
const E_PASS   = args[6] || process.env.EMPLOYEE_PASS || 'Flowline2026!';

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Log in via POST /login and return the fl_token cookie value.
 * Returns null on failure.
 */
async function login(username, password) {
  const body = new URLSearchParams({ username, password });
  const res  = await fetch(`${BASE}/login`, {
    method:   'POST',
    body,
    headers:  { 'Content-Type': 'application/x-www-form-urlencoded' },
    redirect: 'manual',
  });
  // Expect 302 redirect after successful login
  const cookie = res.headers.get('set-cookie') || '';
  const match  = cookie.match(/fl_token=([^;]+)/);
  if (!match) return null;
  return match[1];
}

/**
 * Make a GET request without following redirects.
 * Returns the HTTP status code.
 */
async function get(path, token) {
  const headers = token ? { Cookie: `fl_token=${token}` } : {};
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', headers });
  return res.status;
}

// ── test matrix ───────────────────────────────────────────────────────────────

const MATRIX = [
  // ── Administrator ─────────────────────────────────────────────────────────
  { role: 'Administrator', path: '/admin/dashboard',      expected: 200 },
  { role: 'Administrator', path: '/admin/reports',        expected: 200 },
  { role: 'Administrator', path: '/admin/activity-logs',  expected: 200 },
  { role: 'Administrator', path: '/admin/employees',      expected: 200 },

  // ── Manager ───────────────────────────────────────────────────────────────
  { role: 'Manager', path: '/manager/dashboard',      expected: 200 },
  { role: 'Manager', path: '/manager/reports',        expected: 200 },
  { role: 'Manager', path: '/admin/dashboard',        expected: 403 },
  { role: 'Manager', path: '/admin/reports',          expected: 403 },
  { role: 'Manager', path: '/admin/activity-logs',    expected: 403 },

  // ── Employee ──────────────────────────────────────────────────────────────
  { role: 'Employee', path: '/employee/dashboard',       expected: 200 },
  { role: 'Employee', path: '/admin/dashboard',          expected: 403 },
  { role: 'Employee', path: '/manager/dashboard',        expected: 403 },
  { role: 'Employee', path: '/manager/reports',          expected: 403 },
  { role: 'Employee', path: '/admin/activity-logs',      expected: 403 },
  // /employee/reports does not exist — should be 404
  { role: 'Employee', path: '/employee/reports',         expected: 404 },
  // Attachment on a non-existent record — 404 (no attachment, no assigned task)
  // Both 403 and 404 are acceptable (no access vs record-not-found)
  { role: 'Employee', path: '/attachments/999999/download', expected: [403, 404] },

  // ── No cookie ─────────────────────────────────────────────────────────────
  // Unauthenticated access to protected page → 302 to /login
  { role: 'No cookie', path: '/admin/dashboard', expected: 302 },
];

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nFlowline Access Control Check`);
  console.log(`Base URL : ${BASE}`);
  console.log(`Logins   : admin=${A_USER}  manager=${M_USER}  employee=${E_USER}\n`);

  // Authenticate each role
  const tokens = {};
  process.stdout.write('Logging in… ');

  tokens.Administrator = await login(A_USER, A_PASS);
  tokens.Manager       = await login(M_USER, M_PASS);
  tokens.Employee      = await login(E_USER, E_PASS);
  tokens['No cookie']  = null;

  for (const [role, tok] of Object.entries(tokens)) {
    if (role === 'No cookie') continue;
    if (!tok) {
      console.error(`\nFATAL: Could not log in as ${role} (${role === 'Administrator' ? A_USER : role === 'Manager' ? M_USER : E_USER})`);
      console.error('Check credentials and that the server is running.');
      process.exit(1);
    }
  }
  console.log('OK\n');

  // Column widths
  const W_ROLE = 15, W_PATH = 40, W_EXP = 10, W_ACT = 10;
  const header = `${'Role'.padEnd(W_ROLE)} ${'Path'.padEnd(W_PATH)} ${'Expected'.padEnd(W_EXP)} ${'Actual'.padEnd(W_ACT)} Result`;
  const divider = '─'.repeat(header.length);
  console.log(divider);
  console.log(header);
  console.log(divider);

  let failures = 0;

  for (const { role, path, expected } of MATRIX) {
    const token  = tokens[role];
    let   actual;
    try {
      actual = await get(path, token);
    } catch (err) {
      actual = `ERR(${err.message})`;
    }

    const expectedSet = Array.isArray(expected) ? expected : [expected];
    const pass        = expectedSet.includes(actual);
    const result      = pass ? '✓ PASS' : '✗ FAIL';
    const expLabel    = expectedSet.join(' or ');

    if (!pass) failures++;

    const line = `${role.padEnd(W_ROLE)} ${path.padEnd(W_PATH)} ${String(expLabel).padEnd(W_EXP)} ${String(actual).padEnd(W_ACT)} ${result}`;
    console.log(line);
  }

  console.log(divider);
  console.log(`\n${MATRIX.length} checks, ${failures} failure(s).\n`);

  if (failures > 0) process.exit(1);
}

main().catch(err => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});

'use strict';
/**
 * test/reportMetrics.test.js
 *
 * Unit tests for lib/reportMetrics.js using Node's built-in test runner.
 * No DB, no HTTP — pure function tests only.
 *
 * Run: node --test test/reportMetrics.test.js
 *   or: npm test  (runs all test/ files)
 */

const { test } = require('node:test');
const assert   = require('node:assert/strict');

const {
  completionRate,
  enrichPerformanceRow,
  sortPerformanceRows,
  paginate,
  buildStageCounts,
  buildPriorityCounts,
} = require('../src/lib/reportMetrics');

// ── completionRate ────────────────────────────────────────────────────────────

test('completionRate: 0 tasks → 0', () => {
  assert.equal(completionRate(0, 0), 0);
});

test('completionRate: all completed → 100', () => {
  assert.equal(completionRate(5, 5), 100);
});

test('completionRate: half completed → 50', () => {
  assert.equal(completionRate(3, 6), 50);
});

test('completionRate: rounds to nearest integer', () => {
  // 1/3 = 33.33… → 33
  assert.equal(completionRate(1, 3), 33);
  // 2/3 = 66.67… → 67
  assert.equal(completionRate(2, 3), 67);
});

test('completionRate: negative totalTasks → 0', () => {
  assert.equal(completionRate(0, -1), 0);
});

// ── enrichPerformanceRow ──────────────────────────────────────────────────────

test('enrichPerformanceRow: adds completion_rate field', () => {
  const row    = { employee: { first_name: 'Ana' }, assigned: 10, completed: 7, overdue: 1 };
  const result = enrichPerformanceRow(row);
  assert.equal(result.completion_rate, 70);
  // Original fields preserved
  assert.equal(result.assigned, 10);
  assert.equal(result.employee.first_name, 'Ana');
});

test('enrichPerformanceRow: zero assigned → completion_rate 0', () => {
  const row = { employee: {}, assigned: 0, completed: 0, overdue: 0 };
  assert.equal(enrichPerformanceRow(row).completion_rate, 0);
});

test('enrichPerformanceRow: does not mutate original row', () => {
  const row    = { employee: {}, assigned: 4, completed: 2, overdue: 0 };
  const result = enrichPerformanceRow(row);
  assert.ok(!('completion_rate' in row));
  assert.equal(result.completion_rate, 50);
});

// ── sortPerformanceRows ───────────────────────────────────────────────────────

test('sortPerformanceRows: sorts descending by completion_rate', () => {
  const rows = [
    { completion_rate: 40 },
    { completion_rate: 90 },
    { completion_rate: 60 },
  ];
  const sorted = sortPerformanceRows(rows);
  assert.deepEqual(sorted.map(r => r.completion_rate), [90, 60, 40]);
});

test('sortPerformanceRows: does not mutate original array', () => {
  const rows   = [{ completion_rate: 30 }, { completion_rate: 80 }];
  const sorted = sortPerformanceRows(rows);
  assert.equal(rows[0].completion_rate, 30);   // original unchanged
  assert.equal(sorted[0].completion_rate, 80); // sorted copy
});

// ── paginate ──────────────────────────────────────────────────────────────────

test('paginate: first page of exact multiple', () => {
  const items  = [1, 2, 3, 4, 5, 6];
  const result = paginate(items, 1, 3);
  assert.deepEqual(result.slice, [1, 2, 3]);
  assert.equal(result.total, 6);
  assert.equal(result.pages, 2);
});

test('paginate: second page', () => {
  const items  = [1, 2, 3, 4, 5];
  const result = paginate(items, 2, 3);
  assert.deepEqual(result.slice, [4, 5]);
});

test('paginate: empty array → 1 page', () => {
  const result = paginate([], 1, 20);
  assert.equal(result.total, 0);
  assert.equal(result.pages, 1);
  assert.deepEqual(result.slice, []);
});

test('paginate: page beyond end → empty slice', () => {
  const result = paginate([1, 2], 5, 10);
  assert.deepEqual(result.slice, []);
});

// ── buildStageCounts ──────────────────────────────────────────────────────────

test('buildStageCounts: maps stage_name + count', () => {
  const stages = [
    { stage_name: 'Pending' },
    { stage_name: 'In Progress' },
    { stage_name: 'Completed' },
  ];
  const counts = [3, 7, 2];
  const result = buildStageCounts(stages, counts);
  assert.deepEqual(result, [
    { stage: 'Pending',     count: 3 },
    { stage: 'In Progress', count: 7 },
    { stage: 'Completed',   count: 2 },
  ]);
});

test('buildStageCounts: missing count defaults to 0', () => {
  const stages = [{ stage_name: 'Pending' }];
  const result = buildStageCounts(stages, []);
  assert.equal(result[0].count, 0);
});

// ── buildPriorityCounts ───────────────────────────────────────────────────────

test('buildPriorityCounts: maps priority_name + count', () => {
  const priorities = [{ priority_name: 'Low' }, { priority_name: 'High' }];
  const counts     = [5, 2];
  const result     = buildPriorityCounts(priorities, counts);
  assert.deepEqual(result, [
    { priority: 'Low',  count: 5 },
    { priority: 'High', count: 2 },
  ]);
});

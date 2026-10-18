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

// ── onTimeCompletionRate ──────────────────────────────────────────────────────

const {
  onTimeCompletionRate,
  avgCompletionTimeMs,
  formatDaysHours,
  buildCompletionStats,
} = require('../src/lib/reportMetrics');

test('onTimeCompletionRate: no completed → null', () => {
  assert.equal(onTimeCompletionRate(0, 0), null);
});

test('onTimeCompletionRate: all on-time → 100', () => {
  assert.equal(onTimeCompletionRate(5, 5), 100);
});

test('onTimeCompletionRate: half on-time → 50', () => {
  assert.equal(onTimeCompletionRate(3, 6), 50);
});

test('onTimeCompletionRate: rounds to nearest integer', () => {
  assert.equal(onTimeCompletionRate(1, 3), 33);
  assert.equal(onTimeCompletionRate(2, 3), 67);
});

// ── avgCompletionTimeMs ───────────────────────────────────────────────────────

test('avgCompletionTimeMs: empty array → null', () => {
  assert.equal(avgCompletionTimeMs([]), null);
});

test('avgCompletionTimeMs: single value', () => {
  assert.equal(avgCompletionTimeMs([86400000]), 86400000); // 1 day
});

test('avgCompletionTimeMs: mean of two values', () => {
  assert.equal(avgCompletionTimeMs([0, 86400000]), 43200000); // 0.5 days
});

test('avgCompletionTimeMs: ignores NaN values', () => {
  assert.equal(avgCompletionTimeMs([NaN, 86400000]), 86400000);
});

test('avgCompletionTimeMs: all NaN → null', () => {
  assert.equal(avgCompletionTimeMs([NaN, NaN]), null);
});

// ── formatDaysHours ───────────────────────────────────────────────────────────

test('formatDaysHours: null → "No data"', () => {
  assert.equal(formatDaysHours(null), 'No data');
});

test('formatDaysHours: 0 ms → "0 d 0 h"', () => {
  assert.equal(formatDaysHours(0), '0 d 0 h');
});

test('formatDaysHours: exactly 1 day', () => {
  assert.equal(formatDaysHours(24 * 60 * 60 * 1000), '1 d 0 h');
});

test('formatDaysHours: 2 days 5 hours', () => {
  const ms = (2 * 24 + 5) * 60 * 60 * 1000;
  assert.equal(formatDaysHours(ms), '2 d 5 h');
});

test('formatDaysHours: sub-hour rounds down to 0 h', () => {
  assert.equal(formatDaysHours(30 * 60 * 1000), '0 d 0 h');
});

// ── buildCompletionStats ──────────────────────────────────────────────────────

test('buildCompletionStats: empty records → No data', () => {
  const s = buildCompletionStats([]);
  assert.equal(s.onTimeRateDisplay, 'No data');
  assert.equal(s.avgDisplay,        'No data');
  assert.equal(s.onTimeRate,        null);
  assert.equal(s.avgMs,             null);
});

test('buildCompletionStats: completed before due date counts on-time', () => {
  // completed 1 day before due
  const due       = new Date('2026-06-10T00:00:00');
  const created   = new Date('2026-06-01T08:00:00');
  const completed = new Date('2026-06-09T12:00:00');  // before end-of-day June 10
  const s = buildCompletionStats([{ createdAt: created, completedAt: completed, dueDate: due }]);
  assert.equal(s.onTimeRate,         100);
  assert.equal(s.onTimeRateDisplay,  '100%');
  assert.equal(s.completedCount,     1);
  assert.equal(s.onTimeCount,        1);
});

test('buildCompletionStats: completed after due date counts late', () => {
  // completed 1 day after due
  const due       = new Date('2026-06-08T00:00:00');
  const created   = new Date('2026-06-01T08:00:00');
  const completed = new Date('2026-06-09T10:00:00');  // after end-of-day June 8
  const s = buildCompletionStats([{ createdAt: created, completedAt: completed, dueDate: due }]);
  assert.equal(s.onTimeRate,        0);
  assert.equal(s.onTimeRateDisplay, '0%');
  assert.equal(s.onTimeCount,       0);
});

test('buildCompletionStats: completed exactly at end-of-day counts on-time', () => {
  // 23:59:59.999 same day as due date
  const due       = new Date('2026-06-10T00:00:00');
  const created   = new Date('2026-06-01T00:00:00');
  const completed = new Date('2026-06-10T23:59:59.999');
  const s = buildCompletionStats([{ createdAt: created, completedAt: completed, dueDate: due }]);
  assert.equal(s.onTimeCount, 1);
});

test('buildCompletionStats: returned-and-reapproved task uses latest completedAt', () => {
  // Simulated: buildCompletionStats receives the record for the *final* Completed
  // transition (the controller already picks the latest via fetchCompletionTimestamps).
  // Here we verify the stat is computed correctly when that final timestamp is late.
  const due         = new Date('2026-06-08T00:00:00');
  const created     = new Date('2026-06-01T00:00:00');
  const finalCompleted = new Date('2026-06-12T10:00:00'); // after due date
  const s = buildCompletionStats([{ createdAt: created, completedAt: finalCompleted, dueDate: due }]);
  assert.equal(s.onTimeCount, 0);   // late
  assert.equal(s.completedCount, 1);
});

test('buildCompletionStats: avg completion time computed correctly', () => {
  // Two tasks: 2 days and 4 days → mean = 3 days
  const base = new Date('2026-01-01T00:00:00');
  const records = [
    {
      createdAt:   base,
      completedAt: new Date(base.getTime() + 2 * 24 * 60 * 60 * 1000),
      dueDate:     new Date('2026-01-10T00:00:00'),
    },
    {
      createdAt:   base,
      completedAt: new Date(base.getTime() + 4 * 24 * 60 * 60 * 1000),
      dueDate:     new Date('2026-01-10T00:00:00'),
    },
  ];
  const s = buildCompletionStats(records);
  assert.equal(s.avgDisplay, '3 d 0 h');
});

test('buildCompletionStats: mixed on-time and late', () => {
  const due = new Date('2026-06-10T00:00:00');
  const base = new Date('2026-06-01T00:00:00');
  const records = [
    { createdAt: base, completedAt: new Date('2026-06-09T10:00:00'), dueDate: due },  // on-time
    { createdAt: base, completedAt: new Date('2026-06-11T10:00:00'), dueDate: due },  // late
    { createdAt: base, completedAt: new Date('2026-06-08T10:00:00'), dueDate: due },  // on-time
  ];
  const s = buildCompletionStats(records);
  assert.equal(s.completedCount, 3);
  assert.equal(s.onTimeCount,    2);
  assert.equal(s.onTimeRate,     67);  // round(2/3 * 100)
});

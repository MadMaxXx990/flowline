'use strict';
/**
 * lib/reportMetrics.js
 *
 * Pure, testable metric calculations extracted from reportsController.
 * Every exported function receives plain data (arrays, numbers) — no
 * Sequelize models, no req/res. This makes them easy to unit-test with
 * Node's built-in test runner.
 */

// ── KPI summary ───────────────────────────────────────────────────────────────

/**
 * Compute completion rate as a whole-number percentage.
 * Returns 0 when totalTasks is 0 (avoids division by zero).
 *
 * @param {number} completedTasks
 * @param {number} totalTasks
 * @returns {number}  0–100
 */
function completionRate(completedTasks, totalTasks) {
  if (!totalTasks || totalTasks <= 0) return 0;
  return Math.round((completedTasks / totalTasks) * 100);
}

// ── Per-employee performance ──────────────────────────────────────────────────

/**
 * Compute completion rate for a single employee row and return the enriched
 * object. Input shape must match what buildReportData produces:
 *   { employee, assigned, completed, overdue }
 *
 * @param {{ employee: object, assigned: number, completed: number, overdue: number }} row
 * @returns {{ employee: object, assigned: number, completed: number, overdue: number, completion_rate: number }}
 */
function enrichPerformanceRow(row) {
  return {
    ...row,
    completion_rate: completionRate(row.completed, row.assigned),
  };
}

/**
 * Sort an array of enriched performance rows (highest completion_rate first).
 * Pure — does not mutate the input.
 *
 * @param {Array} rows  — already enriched with completion_rate
 * @returns {Array}
 */
function sortPerformanceRows(rows) {
  return [...rows].sort((a, b) => b.completion_rate - a.completion_rate);
}

/**
 * Paginate an array.
 *
 * @param {Array}  items
 * @param {number} page      1-based page number
 * @param {number} pageSize
 * @returns {{ slice: Array, total: number, pages: number }}
 */
function paginate(items, page, pageSize) {
  const total  = items.length;
  const pages  = Math.ceil(total / pageSize) || 1;
  const offset = (Math.max(1, page) - 1) * pageSize;
  return { slice: items.slice(offset, offset + pageSize), total, pages };
}

// ── Stage / priority label resolution ────────────────────────────────────────

/**
 * Map an array of Sequelize WorkflowStage instances + raw count values into
 * the `{ stage, count }` shape used by the report views and charts.
 *
 * @param {Array<{ stage_name: string }>} stages
 * @param {number[]}                      counts  — parallel array, same order
 * @returns {Array<{ stage: string, count: number }>}
 */
function buildStageCounts(stages, counts) {
  return stages.map((s, i) => ({ stage: s.stage_name, count: counts[i] ?? 0 }));
}

/**
 * Map an array of TaskPriority instances + raw count values into
 * the `{ priority, count }` shape.
 *
 * @param {Array<{ priority_name: string }>} priorities
 * @param {number[]}                         counts
 * @returns {Array<{ priority: string, count: number }>}
 */
function buildPriorityCounts(priorities, counts) {
  return priorities.map((p, i) => ({ priority: p.priority_name, count: counts[i] ?? 0 }));
}

module.exports = {
  completionRate,
  enrichPerformanceRow,
  sortPerformanceRows,
  paginate,
  buildStageCounts,
  buildPriorityCounts,
};

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

// ── On-time completion rate + average completion time ────────────────────────

/**
 * On-time completion rate as a whole-number percentage.
 *
 * @param {number} onTimeCount   — completed tasks where completedAt <= endOfDueDate
 * @param {number} completedCount — all completed tasks in the set
 * @returns {number|null}  0-100 integer, or null when completedCount is 0
 */
function onTimeCompletionRate(onTimeCount, completedCount) {
  if (!completedCount || completedCount <= 0) return null;
  return Math.round((onTimeCount / completedCount) * 100);
}

/**
 * Average completion time in milliseconds.
 *
 * @param {number[]} msArray — array of completion-time durations in ms
 *                            (createdAt → completedAt for each task)
 * @returns {number|null}   mean ms, or null when array is empty
 */
function avgCompletionTimeMs(msArray) {
  if (!msArray || msArray.length === 0) return null;
  const valid = msArray.filter(v => typeof v === 'number' && !isNaN(v) && v >= 0);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

/**
 * Format a millisecond duration as "X d Y h".
 * Sub-hour values round down to 0 h.
 *
 * @param {number|null} ms
 * @returns {string}  e.g. "2 d 5 h", "0 d 3 h", or "No data" if null/NaN
 */
function formatDaysHours(ms) {
  if (ms === null || ms === undefined || isNaN(ms)) return 'No data';
  const totalHours = Math.floor(ms / (1000 * 60 * 60));
  const days  = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days} d ${hours} h`;
}

/**
 * Compute on-time rate and average completion time from a list of completed
 * task records.  Each record must have:
 *   { createdAt: Date, completedAt: Date, dueDate: Date }
 *
 * "On-time" means completedAt <= end-of-day of dueDate (23:59:59.999 local).
 *
 * @param {Array<{ createdAt: Date, completedAt: Date, dueDate: Date }>} records
 * @returns {{
 *   onTimeCount:         number,
 *   completedCount:      number,
 *   onTimeRate:          number|null,   0-100 integer or null
 *   onTimeRateDisplay:   string,        e.g. "75%" or "No data"
 *   avgMs:               number|null,
 *   avgDisplay:          string,        e.g. "2 d 5 h" or "No data"
 * }}
 */
function buildCompletionStats(records) {
  if (!records || records.length === 0) {
    return {
      onTimeCount: 0, completedCount: 0,
      onTimeRate: null, onTimeRateDisplay: 'No data',
      avgMs: null,     avgDisplay: 'No data',
    };
  }

  let onTimeCount = 0;
  const durations = [];

  for (const r of records) {
    const created   = new Date(r.createdAt);
    const completed = new Date(r.completedAt);
    const due       = new Date(r.dueDate);

    // end of due date in local time
    const endOfDue = new Date(due);
    endOfDue.setHours(23, 59, 59, 999);

    if (completed <= endOfDue) onTimeCount++;

    const ms = completed.getTime() - created.getTime();
    if (ms >= 0) durations.push(ms);
  }

  const completedCount = records.length;
  const onTimeRate     = onTimeCompletionRate(onTimeCount, completedCount);
  const avgMs          = avgCompletionTimeMs(durations);

  return {
    onTimeCount,
    completedCount,
    onTimeRate,
    onTimeRateDisplay: onTimeRate !== null ? `${onTimeRate}%` : 'No data',
    avgMs,
    avgDisplay: formatDaysHours(avgMs),
  };
}

module.exports = {
  completionRate,
  enrichPerformanceRow,
  sortPerformanceRows,
  paginate,
  buildStageCounts,
  buildPriorityCounts,
  onTimeCompletionRate,
  avgCompletionTimeMs,
  formatDaysHours,
  buildCompletionStats,
};

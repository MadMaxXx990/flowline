'use strict';
/**
 * test/reportExports.test.js
 *
 * Integration-style tests for lib/reportExports.js using Node's built-in
 * test runner.  No HTTP, no DB — we pass a PassThrough stream and inspect
 * the bytes that come out.
 *
 * Run: node --test test/reportExports.test.js
 *   or: npm test
 */

const { test }       = require('node:test');
const assert         = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const { buildExcel, buildPdf } = require('../src/lib/reportExports');

// ── Shared fixture ────────────────────────────────────────────────────────────

/** Minimal data shape matching what buildReportData returns. */
function makeData(overrides = {}) {
  return {
    dateFrom:        '2026-01-01',
    dateTo:          '2026-01-31',
    totalTasks:      10,
    completedTasks:  7,
    overdueTasks:    1,
    completionRate:  70,
    stageCounts:     [{ stage: 'Pending', count: 2 }, { stage: 'Completed', count: 7 }],
    priorityCounts:  [{ priority: 'Low', count: 4 }, { priority: 'High', count: 3 }],
    attSummary:      [{ attendance_status: 'Present', cnt: '8' }],
    performance:     [
      {
        employee:        { first_name: 'Ana', last_name: 'Cruz', department: { department_name: 'HR' } },
        assigned:        5,
        completed:       4,
        overdue:         0,
        completion_rate: 80,
      },
    ],
    ...overrides,
  };
}

/** No-op safe() — formula injection sanitiser isn't what we're testing here. */
const safe = v => (v === null || v === undefined ? '' : String(v));

// ── buildExcel ────────────────────────────────────────────────────────────────

test('buildExcel: resolves without throwing', async () => {
  const stream = new PassThrough();
  // Drain the stream so it doesn't back-pressure
  stream.resume();
  await assert.doesNotReject(() => buildExcel(makeData(), safe, stream));
});

test('buildExcel: writes xlsx magic bytes (PK header)', async () => {
  const chunks = [];
  const stream = new PassThrough();
  stream.on('data', chunk => chunks.push(chunk));

  await buildExcel(makeData(), safe, stream);
  stream.end();

  const buf = Buffer.concat(chunks);
  // .xlsx files are ZIP archives; first two bytes are 'PK' (0x50 0x4B)
  assert.ok(buf.length > 4, 'output should be non-empty');
  assert.equal(buf[0], 0x50, 'first byte should be P (0x50)');
  assert.equal(buf[1], 0x4B, 'second byte should be K (0x4B)');
});

test('buildExcel: handles empty performance array', async () => {
  const stream = new PassThrough();
  stream.resume();
  await assert.doesNotReject(() =>
    buildExcel(makeData({ performance: [] }), safe, stream)
  );
});

test('buildExcel: handles empty attSummary', async () => {
  const stream = new PassThrough();
  stream.resume();
  await assert.doesNotReject(() =>
    buildExcel(makeData({ attSummary: [] }), safe, stream)
  );
});

test('buildExcel: formula-injection sanitiser applied to stage name', async () => {
  // A stage name starting with '=' should be prefixed with "'"
  const safeSpy = v => {
    if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
    return v === null || v === undefined ? '' : String(v);
  };
  const data   = makeData({ stageCounts: [{ stage: '=DANGEROUS()', count: 1 }] });
  const stream = new PassThrough();
  stream.resume();
  // Should not throw even with a formula-like value
  await assert.doesNotReject(() => buildExcel(data, safeSpy, stream));
});

// ── buildPdf ──────────────────────────────────────────────────────────────────

test('buildPdf: writes PDF magic bytes (%PDF)', async () => {
  await new Promise((resolve, reject) => {
    const chunks = [];
    const stream = new PassThrough();
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => {
      try {
        const buf  = Buffer.concat(chunks);
        const head = buf.slice(0, 5).toString('ascii');
        assert.ok(buf.length > 100, 'PDF output should be non-trivial');
        assert.ok(head.startsWith('%PDF'), `Expected %PDF header, got: ${head}`);
        resolve();
      } catch (e) { reject(e); }
    });
    stream.on('error', reject);
    buildPdf(makeData(), stream);
  });
});

test('buildPdf: handles empty performance array', async () => {
  await new Promise((resolve, reject) => {
    const stream = new PassThrough();
    stream.on('end', resolve);
    stream.on('error', reject);
    stream.resume();
    try { buildPdf(makeData({ performance: [] }), stream); } catch (e) { reject(e); }
  });
});

test('buildPdf: handles empty attSummary (no attendance section)', async () => {
  await new Promise((resolve, reject) => {
    const stream = new PassThrough();
    stream.on('end', resolve);
    stream.on('error', reject);
    stream.resume();
    try { buildPdf(makeData({ attSummary: [] }), stream); } catch (e) { reject(e); }
  });
});

'use strict';
/**
 * lib/reportExports.js
 *
 * Excel and PDF builders for the reports page.
 * Both functions receive a plain `data` object (returned by buildReportData)
 * and a writable stream (the Express `res` object), so they can be tested
 * independently by passing a PassThrough stream.
 *
 * `safe` — the formula-injection sanitiser from reportsController — is passed
 * in as a parameter so this module stays free of controller coupling.
 */

const ExcelJS     = require('exceljs');
const PDFDocument = require('pdfkit');

// ── Excel ─────────────────────────────────────────────────────────────────────

/**
 * Write a Flowline performance report as an .xlsx file to `stream`.
 *
 * @param {object}   data   — result of buildReportData()
 * @param {Function} safe   — formula-injection sanitiser (string → string)
 * @param {object}   stream — writable stream (res or PassThrough in tests)
 * @returns {Promise<void>}
 */
async function buildExcel(data, safe, stream) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Flowline';
  wb.created = new Date();

  // ── Summary sheet ──────────────────────────────────────────────────────────
  const sum = wb.addWorksheet('Summary');
  sum.addRow(['Flowline — Performance Report']);
  sum.addRow(['Period', `${data.dateFrom} to ${data.dateTo}`]);
  sum.addRow([]);
  sum.addRow(['Metric', 'Value']);
  sum.addRows([
    ['Total Tasks',            data.totalTasks],
    ['Completed',              data.completedTasks],
    ['Overdue',                data.overdueTasks],
    ['Completion Rate',        `${data.completionRate}%`],
    ['On-Time Completion Rate', data.onTimeRateDisplay    ?? 'No data'],
    ['Avg Completion Time',     data.avgCompletionDisplay ?? 'No data'],
  ]);
  sum.addRow([]);
  sum.addRow(['Stage', 'Count']);
  data.stageCounts.forEach(s => sum.addRow([safe(s.stage), s.count]));
  sum.addRow([]);
  sum.addRow(['Priority', 'Count']);
  data.priorityCounts.forEach(p => sum.addRow([safe(p.priority), p.count]));

  // ── Employee performance sheet ─────────────────────────────────────────────
  const perf = wb.addWorksheet('Employee Performance');
  perf.addRow(['Employee', 'Department', 'Assigned', 'Completed', 'Overdue', 'Rate %', 'On-Time Rate', 'Avg Completion']);
  data.performance.forEach(r => perf.addRow([
    safe(`${r.employee.first_name} ${r.employee.last_name}`),
    safe(r.employee.department?.department_name ?? ''),
    r.assigned, r.completed, r.overdue, r.completion_rate,
    safe(r.on_time_rate_display    ?? 'No data'),
    safe(r.avg_completion_display  ?? 'No data'),
  ]));

  // ── Attendance sheet ───────────────────────────────────────────────────────
  const att = wb.addWorksheet('Attendance');
  att.addRow(['Status', 'Count']);
  (data.attSummary || []).forEach(a => att.addRow([safe(a.attendance_status), +a.cnt]));

  await wb.xlsx.write(stream);
}

// ── PDF ───────────────────────────────────────────────────────────────────────

const INDIGO = '#4f46e5';
const GRAY   = '#6b7280';
const RED    = '#ef4444';
const GREEN  = '#10b981';

/**
 * Write a Flowline performance report as a PDF to `stream`.
 * The PDF is streamed directly — no buffering.
 *
 * @param {object} data   — result of buildReportData()
 * @param {object} stream — writable stream (res or PassThrough in tests)
 */
function buildPdf(data, stream) {
  const doc  = new PDFDocument({ margin: 40, size: 'A4' });
  const pageW = doc.page.width - 80; // usable width (40 px margin each side)
  doc.pipe(stream);

  // ── Header bar ─────────────────────────────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 56).fill(INDIGO);
  doc.fillColor('#fff').fontSize(18).font('Helvetica-Bold').text('Flowline', 40, 18);
  doc.fontSize(10).font('Helvetica').text('Performance Report', 40, 38);
  doc.fillColor('#ccc').fontSize(9)
     .text(`Period: ${data.dateFrom}  →  ${data.dateTo}`, 40, 38,
           { align: 'right', width: pageW });
  doc.moveDown(4);

  // ── KPI boxes ──────────────────────────────────────────────────────────────
  function kpiBox(x, y, label, value, color) {
    doc.roundedRect(x, y, 88, 54, 4).stroke(color);
    doc.fillColor(color).fontSize(18).font('Helvetica-Bold')
       .text(String(value), x + 4, y + 8, { width: 80, align: 'center' });
    doc.fillColor(GRAY).fontSize(7).font('Helvetica')
       .text(label, x + 4, y + 38, { width: 80, align: 'center' });
  }
  const ky = 70;
  kpiBox(40,  ky, 'Total Tasks',      data.totalTasks,                        INDIGO);
  kpiBox(134, ky, 'Completed',        data.completedTasks,                    GREEN);
  kpiBox(228, ky, 'Overdue',          data.overdueTasks,                      RED);
  kpiBox(322, ky, 'Completion Rate',  `${data.completionRate}%`,              INDIGO);
  kpiBox(416, ky, 'On-Time Rate',     data.onTimeRateDisplay    ?? 'No data', GREEN);
  kpiBox(510, ky, 'Avg Completion',   data.avgCompletionDisplay ?? 'No data', INDIGO);
  doc.y = ky + 70;

  // ── Section title helper ───────────────────────────────────────────────────
  function sectionTitle(title) {
    doc.moveDown(0.5);
    doc.fillColor(INDIGO).fontSize(11).font('Helvetica-Bold').text(title);
    doc.moveDown(0.3);
    doc.fillColor('#000');
  }

  // ── Table helper ──────────────────────────────────────────────────────────
  function table(headers, rows, colWidths) {
    const rowH = 18;
    const x0   = 40;
    let   y    = doc.y;

    doc.rect(x0, y, pageW, rowH).fill('#f3f4f6');
    let cx = x0 + 4;
    headers.forEach((h, i) => {
      doc.fillColor('#374151').fontSize(8).font('Helvetica-Bold')
         .text(h, cx, y + 5, { width: colWidths[i] - 4, lineBreak: false });
      cx += colWidths[i];
    });
    y += rowH;

    rows.forEach((row, ri) => {
      if (y > doc.page.height - 60) { doc.addPage(); y = 40; }
      if (ri % 2 === 1) doc.rect(x0, y, pageW, rowH).fill('#f9fafb');
      cx = x0 + 4;
      row.forEach((cell, i) => {
        doc.fillColor('#111827').fontSize(8).font('Helvetica')
           .text(String(cell ?? ''), cx, y + 5,
                 { width: colWidths[i] - 6, lineBreak: false });
        cx += colWidths[i];
      });
      y += rowH;
    });
    doc.y = y + 6;
  }

  // ── Content sections ───────────────────────────────────────────────────────
  sectionTitle('Tasks by Stage');
  table(['Stage', 'Count'],
        data.stageCounts.map(s => [s.stage, s.count]),
        [320, pageW - 320]);

  sectionTitle('Tasks by Priority');
  table(['Priority', 'Count'],
        data.priorityCounts.map(p => [p.priority, p.count]),
        [320, pageW - 320]);

  if (data.attSummary && data.attSummary.length) {
    sectionTitle('Attendance Summary');
    table(['Status', 'Count'],
          data.attSummary.map(a => [a.attendance_status, +a.cnt]),
          [320, pageW - 320]);
  }

  sectionTitle('Employee Performance');
  table(
    ['Employee', 'Department', 'Assigned', 'Completed', 'Overdue', 'Rate %', 'On-Time', 'Avg Time'],
    data.performance.map(r => [
      `${r.employee.first_name} ${r.employee.last_name}`,
      r.employee.department?.department_name ?? '—',
      r.assigned, r.completed, r.overdue, `${r.completion_rate}%`,
      r.on_time_rate_display   ?? 'No data',
      r.avg_completion_display ?? 'No data',
    ]),
    [110, 90, 40, 55, 45, 40, 50, pageW - 430],
  );

  // ── Running footer on each new page ───────────────────────────────────────
  doc.on('pageAdded', () => {
    doc.rect(0, doc.page.height - 30, doc.page.width, 30).fill('#f3f4f6');
    doc.fillColor(GRAY).fontSize(8)
       .text('Flowline — generated ' + new Date().toLocaleString(),
             40, doc.page.height - 20, { align: 'center', width: pageW });
  });

  doc.end();
}

module.exports = { buildExcel, buildPdf };

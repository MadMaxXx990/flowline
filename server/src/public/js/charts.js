/**
 * charts.js — initialises all Chart.js canvases from data- attributes.
 *
 * Rules:
 *  - Every <canvas data-chart-type> must be inside a .chart-box wrapper.
 *  - No inline scripts anywhere (CSP: script-src 'self').
 *  - If a Chart instance already exists on a canvas it is destroyed first
 *    so hot-reload / layout re-renders never produce double charts.
 *  - Chart.js is served from /vendor/… (no CDN).
 *
 * Data attributes on each canvas:
 *   data-chart-type    "hbar" | "bar"
 *   data-chart-labels  JSON string array
 *   data-chart-values  JSON number array
 *   data-chart-colors  JSON hex array (one per label; required for hbar)
 *   data-chart-color   single hex colour (bar charts; default #4f46e5)
 *
 * Stage colour map (kept in sync with badge colours across the app):
 *   Pending     #9ca3af   (grey)
 *   In Progress #3b82f6   (blue)
 *   For Review  #f59e0b   (amber)
 *   Completed   #10b981   (green)
 *   Overdue     #ef4444   (red)
 *
 * Priority colour map:
 *   High   #ef4444   (red)
 *   Medium #f59e0b   (amber)
 *   Low    #10b981   (green)
 */

/* ── Shared palette helpers ────────────────────────────────────────────────── */
const STAGE_COLORS = {
  'Pending':     '#9ca3af',
  'In Progress': '#3b82f6',
  'For Review':  '#f59e0b',
  'Completed':   '#10b981',
  'Overdue':     '#ef4444',
};

const PRIORITY_COLORS = {
  'High':   '#ef4444',
  'Medium': '#f59e0b',
  'Low':    '#10b981',
};

const FALLBACK_PALETTE = [
  '#4f46e5','#3b82f6','#10b981','#f59e0b','#ef4444',
  '#8b5cf6','#06b6d4','#84cc16','#f43f5e','#64748b',
];

/** Return an RGBA hex + alpha version for background (30 % opacity). */
function bgColor(hex) {
  // Append 4D for ~30 % opacity; works with 6-char hex
  return hex + '4D';
}

/* ── Tiny value-label plugin (draws count at bar end, no extra library) ──── */
const valueLabelPlugin = {
  id: 'valueLabel',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((dataset, i) => {
      const meta = chart.getDatasetMeta(i);
      if (meta.hidden) return;
      ctx.save();
      ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#374151';
      ctx.textBaseline = 'middle';
      meta.data.forEach((bar, index) => {
        const value = dataset.data[index];
        if (value === null || value === undefined) return;
        const { x, y } = bar.tooltipPosition(true);
        const isHorizontal = chart.config.type === 'bar' &&
          chart.options.indexAxis === 'y';
        if (isHorizontal) {
          // Draw to the right of the bar end
          ctx.textAlign = 'left';
          ctx.fillText(String(value), x + 6, y);
        } else {
          // Draw above the bar top
          ctx.textAlign = 'center';
          ctx.fillText(String(value), x, y - 7);
        }
      });
      ctx.restore();
    });
  },
};

/* ── Shared Chart.js defaults ──────────────────────────────────────────────── */
function baseOptions(isHorizontal) {
  return {
    responsive:          true,
    maintainAspectRatio: false,
    animation:           { duration: 400 },
    plugins: {
      legend:   { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.parsed[isHorizontal ? 'x' : 'y']}`,
        },
      },
    },
    layout: { padding: { right: isHorizontal ? 36 : 0, top: isHorizontal ? 0 : 20 } },
  };
}

/* ── Build horizontal bar config ─────────────────────────────────────────── */
function makeHBar(labels, values, colors) {
  const bgColors     = labels.map((l, i) => colors[i] || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]);
  const borderColors = bgColors;

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: bgColors.map(bgColor),
        borderColor:     borderColors,
        borderWidth:     2,
        borderRadius:    4,
      }],
    },
    options: {
      ...baseOptions(true),
      indexAxis: 'y',
      scales: {
        x: {
          beginAtZero: true,
          ticks:       { stepSize: 1, font: { size: 12 }, color: '#6b7280' },
          grid:        { color: '#f3f4f6' },
          border:      { display: false },
        },
        y: {
          ticks: { font: { size: 12 }, color: '#374151' },
          grid:  { display: false },
          border: { display: false },
        },
      },
    },
    plugins: [valueLabelPlugin],
  };
}

/* ── Build vertical bar config (weekly completions) ─────────────────────── */
function makeVBar(labels, values, color) {
  return {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data:            values,
        backgroundColor: bgColor(color),
        borderColor:     color,
        borderWidth:     2,
        borderRadius:    4,
      }],
    },
    options: {
      ...baseOptions(false),
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0, font: { size: 12 }, color: '#6b7280' },
          grid:  { color: '#f3f4f6' },
          border: { display: false },
        },
        x: {
          ticks:  { font: { size: 12 }, color: '#374151' },
          grid:   { display: false },
          border: { display: false },
        },
      },
    },
    plugins: [valueLabelPlugin],
  };
}

/* ── Registry to prevent double-init (destroy before re-create) ─────────── */
const chartRegistry = new Map();

function createChart(canvas, config) {
  if (chartRegistry.has(canvas)) {
    chartRegistry.get(canvas).destroy();
  }
  // Chart.js 4 exposes the instance via Chart.getChart(canvas) too, but the
  // registry is simpler and works without version assumptions.
  const instance = new Chart(canvas, config);
  chartRegistry.set(canvas, instance);
  return instance;
}

/* ── Main init ──────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  if (typeof Chart === 'undefined') return;

  document.querySelectorAll('canvas[data-chart-type]').forEach(canvas => {

    let labels = [], values = [];
    try { labels = JSON.parse(canvas.getAttribute('data-chart-labels') || '[]'); } catch {}
    try { values = JSON.parse(canvas.getAttribute('data-chart-values') || '[]'); } catch {}

    const type  = canvas.getAttribute('data-chart-type');
    const color = canvas.getAttribute('data-chart-color') || '#4f46e5';
    let colors  = [];
    try { colors = JSON.parse(canvas.getAttribute('data-chart-colors') || '[]'); } catch {}

    // ── Accessibility ─────────────────────────────────────────────────────
    if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');
    if (!canvas.hasAttribute('aria-label')) {
      const parts = labels.map((l, i) => `${l} ${values[i] ?? 0}`).join(', ');
      const title = canvas.getAttribute('data-chart-title') || 'Chart';
      canvas.setAttribute('aria-label', `${title}: ${parts}`);
    }

    // ── Empty state: show message inside card, skip chart creation ────────
    const total = values.reduce((a, v) => a + (Number(v) || 0), 0);
    const emptyEl = canvas.closest('.card')?.querySelector('[data-chart-empty]');
    if (emptyEl) emptyEl.hidden = (total > 0);

    if (total === 0) {
      canvas.style.display = 'none';
      const summaryEl = canvas.closest('.card')?.querySelector('[data-chart-summary]');
      if (summaryEl) summaryEl.style.display = 'none';
      return;
    }

    // ── Build chart ───────────────────────────────────────────────────────
    let config;

    if (type === 'hbar') {
      // Horizontal bar: colours come from data-chart-colors or auto-map by label
      const resolvedColors = labels.map((l, i) => {
        if (colors[i]) return colors[i];
        return STAGE_COLORS[l] || PRIORITY_COLORS[l] || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length];
      });
      config = makeHBar(labels, values, resolvedColors);

    } else if (type === 'bar') {
      // Vertical bar (weekly completions)
      config = makeVBar(labels, values, color);
    }

    if (config) createChart(canvas, config);

    // ── Summary sentence ──────────────────────────────────────────────────
    const summaryEl = canvas.closest('.card')?.querySelector('[data-chart-summary]');
    if (summaryEl && labels.length) {
      const maxIdx = values.reduce((mi, v, i) => v > values[mi] ? i : mi, 0);
      const maxLabel = labels[maxIdx];
      const maxVal   = values[maxIdx];
      summaryEl.textContent = `Most tasks are ${maxLabel} (${maxVal} of ${total}).`;
    }
  });
});

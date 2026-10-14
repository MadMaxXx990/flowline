/* charts.js — initialises Chart.js canvases from data- attributes.
 * No inline scripts or event handlers in views.
 *
 * Each <canvas> must have:
 *   data-chart-type   = "bar" | "doughnut"
 *   data-chart-labels = JSON array of label strings
 *   data-chart-values = JSON array of numbers
 *
 * Optional:
 *   data-chart-color  = single hex colour (for bar charts)
 *   data-chart-colors = JSON array of hex colours (for doughnut charts)
 */
document.addEventListener('DOMContentLoaded', () => {

  if (typeof Chart === 'undefined') return; // Chart.js not loaded on this page

  document.querySelectorAll('canvas[data-chart-type]').forEach(canvas => {
    let labels = [], values = [];
    try { labels = JSON.parse(canvas.getAttribute('data-chart-labels') || '[]'); } catch {}
    try { values = JSON.parse(canvas.getAttribute('data-chart-values') || '[]'); } catch {}

    const type   = canvas.getAttribute('data-chart-type');
    const color  = canvas.getAttribute('data-chart-color') || '#4f46e5';
    let   colors = [];
    try { colors = JSON.parse(canvas.getAttribute('data-chart-colors') || '[]'); } catch {}

    if (type === 'bar') {
      new Chart(canvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            data:            values,
            backgroundColor: color + '99',
            borderColor:     color,
            borderWidth:     1,
            borderRadius:    4,
          }],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#f3f4f6' } },
            x: { grid: { display: false } },
          },
        },
      });
    } else if (type === 'doughnut') {
      // Use provided colours or fall back to a default palette
      const palette = colors.length ? colors : [
        '#4f46e5','#3b82f6','#10b981','#f59e0b','#ef4444',
        '#8b5cf6','#06b6d4','#84cc16',
      ];
      new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data:            values,
            backgroundColor: palette.slice(0, labels.length),
            borderWidth:     2,
            borderColor:     '#fff',
          }],
        },
        options: {
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
          },
          cutout: '60%',
        },
      });
    }
  });

});

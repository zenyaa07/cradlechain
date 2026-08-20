const COLORS = ["oklch(55% 0.09 190)", "oklch(65% 0.14 35)", "oklch(70% 0.03 235)", "oklch(60% 0.1 235)"];

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function pieChart(slices) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return '<p class="text-secondary">No data yet.</p>';

  const radius = 60;
  const cx = 70, cy = 70;
  let startAngle = 0;
  const paths = slices
    .map((slice, i) => {
      const fraction = slice.value / total;
      // Handle 100% slice case: draw as full circle instead of degenerate arc
      if (fraction > 0.9999) {
        return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${slice.color || COLORS[i % COLORS.length]}" class="chart-slice" style="animation-delay:${i * 120}ms"><title>${escapeHtml(slice.label)}: ${slice.value.toFixed(3)}</title></circle>`;
      }
      const endAngle = startAngle + fraction * 2 * Math.PI;
      const x1 = cx + radius * Math.sin(startAngle);
      const y1 = cy - radius * Math.cos(startAngle);
      const x2 = cx + radius * Math.sin(endAngle);
      const y2 = cy - radius * Math.cos(endAngle);
      const largeArc = fraction > 0.5 ? 1 : 0;
      const path = `M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${radius},${radius} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z`;
      startAngle = endAngle;
      return `<path d="${path}" fill="${slice.color || COLORS[i % COLORS.length]}" class="chart-slice" style="animation-delay:${i * 120}ms"><title>${escapeHtml(slice.label)}: ${slice.value.toFixed(3)}</title></path>`;
    })
    .join("");

  const legend = slices
    .map(
      (slice, i) =>
        `<span class="chart-legend-item"><span class="chart-swatch" style="background:${slice.color || COLORS[i % COLORS.length]}"></span>${escapeHtml(slice.label)}</span>`
    )
    .join("");

  return `
    <svg viewBox="0 0 140 140" width="140" height="140">${paths}</svg>
    <div class="chart-legend">${legend}</div>
  `;
}

export function barChart(bars) {
  if (bars.length === 0) return '<p class="text-secondary">No data yet.</p>';
  const max = Math.max(...bars.map((b) => b.value), 0.0001);
  const barHeight = 24, gap = 8;
  const width = 260;
  const rows = bars
    .map((bar, i) => {
      const barWidth = (bar.value / max) * (width - 190);
      const y = i * (barHeight + gap);
      return `
        <text x="0" y="${y + barHeight / 2 + 4}" class="chart-label">${escapeHtml(bar.label)}</text>
        <rect x="130" y="${y}" width="${barWidth.toFixed(2)}" height="${barHeight}" fill="${bar.color || COLORS[i % COLORS.length]}" class="chart-bar" style="animation-delay:${i * 100}ms"></rect>
        <text x="${130 + barWidth + 6}" y="${y + barHeight / 2 + 4}" class="chart-value">${bar.valueLabel || bar.value.toFixed(3)}</text>
      `;
    })
    .join("");
  const height = bars.length * (barHeight + gap);
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${rows}</svg>`;
}

export function sparkline(points) {
  if (points.length === 0) return '<p class="text-secondary">No data yet.</p>';
  const width = 260, height = 60;
  const max = Math.max(...points, 0.0001);
  const step = width / Math.max(points.length - 1, 1);
  const coords = points
    .map((value, i) => `${(i * step).toFixed(1)},${(height - (value / max) * height).toFixed(1)}`)
    .join(" ");
  return `
    <svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
      <polyline points="${coords}" class="chart-sparkline" />
    </svg>
  `;
}

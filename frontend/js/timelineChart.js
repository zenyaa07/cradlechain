const CONFIRMED_COLOR = "oklch(55% 0.09 190)";
const PENDING_COLOR = "oklch(65% 0.14 35)";

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stageToNode(stageName) {
  const parts = stageName.split(/->|→/).map((s) => s.trim());
  return parts.length > 1 ? parts[1] : parts[0];
}

export function renderTimeline(events) {
  if (events.length === 0) return '<p class="text-secondary">No checkpoints logged yet.</p>';

  const rows = events
    .map((event) => {
      const confirmed = event.status === 1;
      const color = confirmed ? CONFIRMED_COLOR : PENDING_COLOR;
      const dateSeconds = confirmed && event.confirmedAt > 0 ? event.confirmedAt : event.loggedAt;
      const date = new Date(dateSeconds * 1000).toLocaleDateString();
      return `
        <div class="timeline-row">
          <span class="timeline-dot" style="background:${color}"></span>
          <span class="timeline-label">${escapeHtml(stageToNode(event.stageName))}</span>
          <span class="timeline-date">${date}</span>
        </div>
      `;
    })
    .join("");

  return `<div class="timeline-track">${rows}</div>`;
}

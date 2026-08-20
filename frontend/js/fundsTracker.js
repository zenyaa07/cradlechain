// Named "Funds Tracker," not "Goods Tracker" — CradleChain moves money through checkpoints,
// not physical goods, so the label stays accurate to what's actually being tracked.
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fundsTrackerHtml(checkpoints) {
  if (checkpoints.length === 0) {
    return '<p class="text-secondary">No checkpoints logged yet.</p>';
  }

  const sorted = [...checkpoints].sort((a, b) => a.checkpointId - b.checkpointId);
  return `
    <div class="funds-tracker">
      ${sorted
        .map((c, i) => {
          const isConfirmed = Number(c.status) === 1;
          const parts = c.stageName.split(/->|→/).map((s) => s.trim());
          const label = escapeHtml(parts.length > 1 ? parts[1] : parts[0]);
          const node = `
            <div class="funds-tracker-node ${isConfirmed ? "funds-tracker-node-confirmed" : "funds-tracker-node-pending"}">
              <span class="funds-tracker-dot"></span>
              <span class="funds-tracker-label">${label}</span>
              <span class="funds-tracker-status">${isConfirmed ? "confirmed" : "pending"}</span>
            </div>
          `;
          if (i === sorted.length - 1) return node;
          return node + `<div class="funds-tracker-edge ${isConfirmed ? "funds-tracker-edge-solid" : "funds-tracker-edge-dashed"}"></div>`;
        })
        .join("")}
    </div>
  `;
}

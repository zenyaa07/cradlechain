const COLORS = ["oklch(55% 0.09 190)", "oklch(65% 0.14 35)", "oklch(70% 0.03 235)", "oklch(60% 0.1 235)"];
const UNMOVED_LABEL = "Raised, not yet moved";

function stageToNode(stageName) {
  const parts = stageName.split(/->|→/).map((s) => s.trim());
  return parts.length > 1 ? parts[1] : parts[0];
}

export function computeFundStageBreakdown(donations, checkpoints) {
  const totalsByLabel = new Map();

  donations.forEach((donation) => {
    const confirmed = checkpoints.filter(
      (c) => c.donationId === donation.donationId && c.status === 1
    );
    const label =
      confirmed.length === 0
        ? UNMOVED_LABEL
        : stageToNode(confirmed.reduce((a, b) => (b.checkpointId > a.checkpointId ? b : a)).stageName);

    totalsByLabel.set(label, (totalsByLabel.get(label) || 0) + donation.amount);
  });

  return Array.from(totalsByLabel.entries()).map(([label, value], i) => ({
    label,
    value,
    color: COLORS[i % COLORS.length],
  }));
}

export function computeTimelineEvents(checkpoints) {
  return [...checkpoints]
    .sort((a, b) => a.checkpointId - b.checkpointId)
    .map((c) => ({
      stageName: c.stageName,
      status: c.status,
      loggedAt: c.loggedAt,
      confirmedAt: c.confirmedAt,
    }));
}

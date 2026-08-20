import { getChainSnapshot } from "./chainData.js";
import { getContract } from "./wallet.js";
import { pieChart, barChart, sparkline } from "./svgCharts.js";
import { previewSnapshot } from "./previewData.js";

const TRADITIONAL_PLATFORM_FEE_RM = 1.5;
const STALE_THRESHOLD_SECONDS = 2 * 24 * 60 * 60; // 48h — beyond this a pending checkpoint counts as "needs attention"

function truncate(str, maxLen = 18) {
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

function formatDuration(seconds) {
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} hr`;
  return `${(seconds / 86400).toFixed(1)} days`;
}

// All three metrics below read only loggedAt/confirmedAt/status/ipfsProofHash — fields that
// exist identically on live chain reads (chainData.js) and the preview fixture, and that are
// on-chain facts rather than a fresh AI call per render, so this stays truthful and fast in
// both modes without re-running verification on every analytics page load.
function computeConfirmationSpeed(checkpoints) {
  const durations = checkpoints
    .filter((c) => c.status === 1 && c.loggedAt > 0 && c.confirmedAt > c.loggedAt)
    .map((c) => c.confirmedAt - c.loggedAt);
  if (durations.length === 0) return null;
  const avg = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  return { avg, count: durations.length };
}

function computeEvidenceRate(checkpoints) {
  const documented = checkpoints.filter((c) => c.ipfsProofHash).length;
  return { documented, total: checkpoints.length };
}

function computeStaleCheckpoints(checkpoints, campaigns) {
  const now = Math.floor(Date.now() / 1000);
  return checkpoints
    .filter((c) => c.status === 0 && c.loggedAt > 0 && now - c.loggedAt > STALE_THRESHOLD_SECONDS)
    .map((c) => ({
      campaignName: campaigns.find((camp) => camp.id === c.campaignId)?.name || `Campaign #${c.campaignId}`,
      stageName: c.stageName,
      ageSeconds: now - c.loggedAt,
    }));
}

export async function renderAnalytics() {
  const container = document.getElementById("analytics-page");
  let snapshot;
  try {
    snapshot = await getChainSnapshot();
  } catch (error) {
    container.innerHTML = '<p class="text-secondary">Connect a wallet to view analytics.</p>';
    return;
  }

  const { campaigns, checkpoints, donations, releases, confirmers } = snapshot;

  const donationAmountByKey = {};
  donations.forEach((d) => {
    donationAmountByKey[`${d.campaignId}-${d.donationId}`] = Number(ethers.formatEther(d.amount));
  });
  const releasedKeys = new Set(releases.map((r) => `${r.campaignId}-${r.donationId}`));
  const pendingCheckpointKeys = new Set(
    checkpoints.filter((c) => c.status === 0).map((c) => `${c.campaignId}-${c.donationId}`)
  );

  let released = 0, awaitingConfirmation = 0, raisedPending = 0;
  Object.entries(donationAmountByKey).forEach(([key, amount]) => {
    if (releasedKeys.has(key)) released += amount;
    else if (pendingCheckpointKeys.has(key)) awaitingConfirmation += amount;
    else raisedPending += amount;
  });

  const donationsByCampaign = {};
  donations.forEach((d) => {
    const amount = Number(ethers.formatEther(d.amount));
    donationsByCampaign[d.campaignId] = (donationsByCampaign[d.campaignId] || 0) + amount;
  });
  const BAR_COLORS = ["oklch(58% 0.16 35)", "oklch(60% 0.1 235)", "oklch(55% 0.09 190)"];
  const donationBars = campaigns.map((c, i) => ({
    label: truncate(c.name),
    value: donationsByCampaign[c.id] || 0,
    color: BAR_COLORS[i % BAR_COLORS.length],
  }));

  // Preview (demo) data has no matching on-chain contract to score against — read the
  // scores straight from the fixture instead of calling a contract that doesn't know these
  // addresses.
  const reliabilityColor = (ratio) => (ratio >= 0.75 ? "oklch(55% 0.09 190)" : "oklch(60% 0.1 60)");
  const confirmerBars = [];
  if (snapshot.isPreview) {
    confirmers.forEach((confirmer) => {
      const score = previewSnapshot.confirmerScores[confirmer.address] || { confirmed: 0, total: 0 };
      const ratio = score.total > 0 ? score.confirmed / score.total : 0;
      confirmerBars.push({
        label: truncate(confirmer.label),
        value: ratio,
        valueLabel: `${score.confirmed}/${score.total} · ${Math.round(ratio * 100)}%`,
        color: reliabilityColor(ratio),
      });
    });
  } else {
    const contract = getContract();
    const campaignIds = campaigns.map((c) => c.id);
    for (const confirmer of confirmers) {
      const [confirmed, total] = await contract.getConfirmerScore(confirmer.address, campaignIds);
      const ratio = total > 0n ? Number(confirmed) / Number(total) : 0;
      confirmerBars.push({
        label: truncate(confirmer.label),
        value: ratio,
        valueLabel: `${confirmed}/${total} · ${Math.round(ratio * 100)}%`,
        color: reliabilityColor(ratio),
      });
    }
  }

  const donationCount = donations.length;
  const savedPoints = Array.from({ length: donationCount + 1 }, (_, i) => i * TRADITIONAL_PLATFORM_FEE_RM);
  const totalSavedRM = donationCount * TRADITIONAL_PLATFORM_FEE_RM;

  const confirmationSpeed = computeConfirmationSpeed(checkpoints);
  const evidenceRate = computeEvidenceRate(checkpoints);
  const staleCheckpoints = computeStaleCheckpoints(checkpoints, campaigns);

  container.innerHTML = `
    <div class="analytics-pool">
      ${BG_FISH}
      <div class="analytics-flow" title="Each panel is a pool the data climbs through, checkpoint by checkpoint.">
        ${analyticsFlowHtml()}
      </div>
      <div class="chart-grid">
        <div class="card card-glass-inset">
          <h3>Funds by status</h3>
          <div class="chart-body">${pieChart([
            { label: "Released", value: released, color: "oklch(55% 0.09 190)" },
            { label: "Awaiting confirmation", value: awaitingConfirmation, color: "oklch(65% 0.14 35)" },
            { label: "Raised, pending checkpoint", value: raisedPending, color: "oklch(70% 0.03 235)" },
          ])}</div>
        </div>
        <div class="card card-glass-inset">
          <h3><span data-relabel="Campaign">Campaign</span>s by MATIC raised</h3>
          <div class="chart-body">${barChart(donationBars)}</div>
        </div>
        <div class="card card-glass-inset">
          <h3><span data-relabel="Confirmer">Confirmer</span> reliability</h3>
          <div class="chart-body">${barChart(confirmerBars)}</div>
        </div>
        <div class="card card-glass-inset">
          <h3>Platform fee avoided</h3>
          <div class="chart-body">
            <div class="fee-avoided-figure">RM${totalSavedRM.toFixed(2)}</div>
            ${sparkline(savedPoints)}
            <p class="text-secondary">Cumulative, vs. a typical ~RM${TRADITIONAL_PLATFORM_FEE_RM.toFixed(2)}/donation platform fee.</p>
          </div>
        </div>
        <div class="card card-glass-inset">
          <h3>Time to confirm</h3>
          ${
            confirmationSpeed
              ? `<div class="fee-avoided-figure">${formatDuration(confirmationSpeed.avg)}</div>
                 <p class="text-secondary">Average, across ${confirmationSpeed.count} confirmed checkpoint${confirmationSpeed.count === 1 ? "" : "s"} — how long funds sit before a confirmer signs off.</p>`
              : '<p class="text-secondary">No confirmed checkpoints yet.</p>'
          }
        </div>
        <div class="card card-glass-inset">
          <h3>Evidence documentation</h3>
          ${pieChart([
            { label: "Photo evidence attached", value: evidenceRate.documented, color: "oklch(55% 0.09 190)" },
            { label: "Not yet documented", value: evidenceRate.total - evidenceRate.documented, color: "oklch(70% 0.03 235)" },
          ])}
          <p class="text-secondary">${evidenceRate.documented}/${evidenceRate.total} checkpoints have IPFS photo proof attached.</p>
        </div>
        <div class="card card-glass-inset">
          <h3>Needs attention</h3>
          <div class="fee-avoided-figure">${staleCheckpoints.length}</div>
          ${
            staleCheckpoints.length > 0
              ? `<ul class="stale-checkpoint-list">${staleCheckpoints
                  .map((s) => `<li><strong>${s.campaignName}</strong> — ${s.stageName} (pending ${formatDuration(s.ageSeconds)})</li>`)
                  .join("")}</ul>`
              : '<p class="text-secondary">No checkpoint has sat pending longer than 48 hours.</p>'
          }
        </div>
      </div>
    </div>
  `;
}

const FLOW_STAGES = [
  { label: "Funds by status", icon: '<path d="M12 3C8 9 5 12.6 5 15.5a7 7 0 0 0 14 0C19 12.6 16 9 12 3Z" fill="oklch(48% 0.1 195)"/>' },
  { label: "Campaigns raised", icon: '<path d="M6 2 H15 L19 6 V22 H6 Z" fill="oklch(48% 0.1 195)"/><path d="M9 11 H16 M9 15 H16 M9 19 H13" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>' },
  { label: "Confirmer reliability", icon: '<path d="M12 2 L20 5.5 V11 C20 16.5 16.5 20.7 12 22 C7.5 20.7 4 16.5 4 11 V5.5 Z" fill="oklch(48% 0.1 195)"/><path d="M8.2 12.2 L11 15 L16 9.5" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' },
  { label: "Fee avoided", icon: '<path d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Z" fill="oklch(48% 0.1 195)"/><path d="M7.5 12.5 L10.5 15.5 L16.5 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>' },
];
const FISH_SVG = '<g transform="scale(-1,1) translate(-24,0)"><path d="M2 12c3-5 9-5 12 0-3 5-9 5-12 0Z M14 12 L21 7 V17 Z" fill="oklch(55% 0.11 235)"/></g>';

function analyticsFlowHtml() {
  return FLOW_STAGES.map((stage, i) => {
    const node = `
      <div class="analytics-flow-node">
        <div class="analytics-flow-icon"><svg viewBox="0 0 24 24" width="20" height="20">${stage.icon}</svg></div>
        <span>${stage.label}</span>
      </div>
    `;
    if (i === FLOW_STAGES.length - 1) return node;
    const edge = `
      <div class="analytics-flow-edge">
        <svg viewBox="0 0 24 24" class="analytics-flow-fish" style="animation-delay:${(i * 0.6).toFixed(1)}s;">${FISH_SVG}</svg>
      </div>
    `;
    return node + edge;
  }).join("");
}

const BG_FISH_DEFS = [
  { left: 6, top: 40, size: 22, opacity: 0.22, color: "oklch(68% 0.14 40)", anim: "fishDriftA", dur: 19, delay: 0, flip: "" },
  { left: 88, top: 90, size: 30, opacity: 0.2, color: "oklch(60% 0.1 235)", anim: "fishDriftB", dur: 24, delay: 1.5, flip: "scale(-1,1) translate(-24,0)" },
  { left: 46, top: 15, size: 18, opacity: 0.18, color: "oklch(55% 0.09 190)", anim: "fishDriftA", dur: 21, delay: 3, flip: "scale(-1,1) translate(-24,0)" },
  { left: 14, top: 480, size: 26, opacity: 0.2, color: "oklch(68% 0.14 40)", anim: "fishDriftB", dur: 26, delay: 0.8, flip: "" },
  { left: 92, top: 440, size: 20, opacity: 0.18, color: "oklch(60% 0.1 235)", anim: "fishDriftA", dur: 18, delay: 2.2, flip: "" },
  { left: 60, top: 560, size: 24, opacity: 0.2, color: "oklch(55% 0.09 190)", anim: "fishDriftB", dur: 23, delay: 1, flip: "scale(-1,1) translate(-24,0)" },
];
const BG_FISH = BG_FISH_DEFS.map(
  (f) => `
    <svg viewBox="0 0 24 24" class="analytics-bg-fish" style="left:${f.left}%;top:${f.top}px;width:${f.size}px;height:${f.size}px;opacity:${f.opacity};animation:${f.anim} ${f.dur}s ease-in-out infinite;animation-delay:${f.delay}s;">
      <g transform="${f.flip}"><path d="M2 12c3-5 9-5 12 0-3 5-9 5-12 0Z M14 12 L21 7 V17 Z" fill="${f.color}"/></g>
    </svg>
  `
).join("");

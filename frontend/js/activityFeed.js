// frontend/js/activityFeed.js
import { getChainSnapshot } from "./chainData.js";
import { resolveDonorLabels } from "./networkGraph.js";
import { previewDonorLabels } from "./previewData.js";

const ICONS = {
  donation: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 20s-7-4.35-9.5-9C1 7.5 2.5 4 6 4c2 0 3.5 1.2 4 2.5C10.5 5.2 12 4 14 4c3.5 0 5 3.5 3.5 7C19.5 15.65 12 20 12 20z"/></svg>`,
  confirmation: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>`,
  release: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 21V4"/><path d="M6 4h12l-3 4 3 4H6"/></svg>`,
};

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function relativeTime(unixSeconds) {
  const diffSeconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (diffSeconds < 60) return "just now";
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)}h ago`;
  return `${Math.floor(diffSeconds / 86400)}d ago`;
}

function itemHtml(item) {
  return `
    <div class="activity-item">
      <span class="activity-icon">${ICONS[item.kind]}</span>
      <div>
        <div class="activity-text">${item.text}</div>
        <div class="activity-time">${item.time}</div>
      </div>
    </div>
  `;
}

export async function renderActivityFeed() {
  const container = document.getElementById("activity-feed");
  let snapshot;
  try {
    snapshot = await getChainSnapshot();
  } catch (error) {
    container.innerHTML = '<p class="text-secondary">Connect a wallet to view activity.</p>';
    return;
  }

  const { campaigns, checkpoints, donations, releases } = snapshot;
  const campaignById = Object.fromEntries(campaigns.map((c) => [c.id, c]));

  // Never show a raw wallet address here — a donor is either a disclosed public
  // name or an anonymous placeholder ("Donor #…"), same choice the real backend
  // enforces (DonorProfile.is_anonymous). Preview data models both cases.
  const donorAddresses = [...new Set(donations.map((d) => d.donor))];
  const resolvedLabels = snapshot.isPreview ? {} : await resolveDonorLabels(donorAddresses);
  const donorLabel = (address) => resolvedLabels[address] || previewDonorLabels[address] || shortAddress(address);

  const items = [];

  donations.forEach((d) => {
    const campaign = campaignById[d.campaignId];
    items.push({
      kind: "donation",
      timestamp: d.timestamp,
      text: `${donorLabel(d.donor)} donated ${ethers.formatEther(d.amount)} MATIC to ${campaign ? campaign.name : `campaign #${d.campaignId}`}`,
    });
  });

  checkpoints
    .filter((c) => c.status === 1 && c.confirmedAt > 0)
    .forEach((c) => {
      const campaign = campaignById[c.campaignId];
      items.push({
        kind: "confirmation",
        timestamp: c.confirmedAt,
        text: `Checkpoint "${c.stageName}" confirmed for ${campaign ? campaign.name : `campaign #${c.campaignId}`}`,
      });
    });

  // FundsReleased has no on-chain timestamp field; approximate with the confirming
  // checkpoint's confirmedAt (same donationId), falling back to "just now" ordering (0) if not found.
  releases.forEach((r) => {
    const campaign = campaignById[r.campaignId];
    const matchingCheckpoint = checkpoints.find(
      (c) => c.campaignId === r.campaignId && c.donationId === r.donationId && c.confirmedAt > 0
    );
    items.push({
      kind: "release",
      timestamp: matchingCheckpoint ? matchingCheckpoint.confirmedAt : 0,
      text: `${ethers.formatEther(r.amount)} MATIC released for ${campaign ? campaign.name : `campaign #${r.campaignId}`}`,
    });
  });

  items.sort((a, b) => b.timestamp - a.timestamp);

  if (items.length === 0) {
    container.innerHTML = '<p class="text-secondary">No activity yet.</p>';
    return;
  }

  const displayItems = items.slice(0, 30).map((item) => ({ ...item, time: item.timestamp > 0 ? relativeTime(item.timestamp) : "recently" }));

  container.innerHTML = displayItems.map(itemHtml).join("");
}

export async function renderOverviewStats() {
  let snapshot;
  try {
    snapshot = await getChainSnapshot();
  } catch (error) {
    return;
  }
  const { campaigns, donations, releases, confirmers } = snapshot;
  const totalRaised = donations.reduce((sum, d) => sum + Number(ethers.formatEther(d.amount)), 0);
  const totalReleased = releases.reduce((sum, r) => sum + Number(ethers.formatEther(r.amount)), 0);

  document.getElementById("stat-raised").textContent = `${totalRaised.toFixed(3)} MATIC`;
  document.getElementById("stat-campaigns").textContent = campaigns.length;
  document.getElementById("stat-released").textContent = `${totalReleased.toFixed(3)} MATIC`;
  document.getElementById("stat-confirmers").textContent = confirmers.length;
}

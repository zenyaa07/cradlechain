import { getChainSnapshot } from "./chainData.js";
import { resolveDonorLabels } from "./networkGraph.js";
import { previewDonorLabels } from "./previewData.js";

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function computeLeaderboard(snapshot) {
  const totals = new Map();
  snapshot.donations.forEach((d) => {
    const amount = Number(ethers.formatEther(d.amount));
    totals.set(d.donor, (totals.get(d.donor) || 0) + amount);
  });
  return [...totals.entries()]
    .map(([address, total]) => ({ address, total }))
    .sort((a, b) => b.total - a.total);
}

export async function renderLeaderboard() {
  const container = document.getElementById("leaderboard-list");
  if (!container) return;

  let snapshot;
  try {
    snapshot = await getChainSnapshot();
  } catch (error) {
    container.innerHTML = '<p class="text-secondary">Connect a wallet to view the leaderboard.</p>';
    return;
  }

  const ranked = computeLeaderboard(snapshot);
  if (ranked.length === 0) {
    container.innerHTML = '<p class="text-secondary">No donations yet.</p>';
    return;
  }

  const addresses = ranked.map((r) => r.address);
  const resolvedLabels = snapshot.isPreview ? {} : await resolveDonorLabels(addresses);
  const donorLabel = (address) => resolvedLabels[address] || previewDonorLabels[address] || shortAddress(address);

  container.innerHTML = ranked
    .slice(0, 10)
    .map(
      (r, i) => `
        <div class="leaderboard-row">
          <span class="leaderboard-rank">#${i + 1}</span>
          <span class="leaderboard-donor">${escapeHtml(donorLabel(r.address))}</span>
          <span class="leaderboard-total">${r.total.toFixed(3)} MATIC</span>
        </div>
      `
    )
    .join("");
}

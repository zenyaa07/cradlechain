import { getContract } from "./wallet.js";
import { previewSnapshot } from "./previewData.js";

// Row layout — rank circle, name + stake, reliability bar, percentage — matches
// the design's confirmer list exactly. Address is never shown: a confirmer is a
// platform-vetted NGO identified by its registered label, not a wallet string.
function reliabilityColor(ratio) {
  return ratio >= 0.75 ? "var(--oklch-accent-teal)" : "oklch(60% 0.1 60)";
}

function confirmerRow(rank, label, stakeEth, confirmed, total) {
  const ratio = total > 0 ? confirmed / total : 0;
  const pct = Math.round(ratio * 100);
  const color = reliabilityColor(ratio);
  return `
    <div class="confirmer-row">
      <div class="confirmer-rank">${rank}</div>
      <div class="confirmer-info">
        <div class="confirmer-label">${label}</div>
        <div class="confirmer-stake">Stake: ${stakeEth} MATIC</div>
      </div>
      <div class="confirmer-bar-track">
        <div class="confirmer-bar-fill" style="width:${pct}%;background:${color};"></div>
      </div>
      <div class="confirmer-pct" style="color:${color};">${confirmed}/${total} · ${pct}%</div>
    </div>
  `;
}

// Shared by campaigns.js (create-campaign / assign-confirmer forms) and flagOverdue.js
// (replacement-confirmer dropdown) — every caller needs the same allowlisted, platform-vetted
// confirmer list this panel already reads, so it lives here once.
export async function fetchAllowedConfirmers(contract) {
  const addresses = await contract.getConfirmerList();
  const confirmers = [];
  for (const address of addresses) {
    const info = await contract.platformConfirmers(address);
    if (info.isAllowed) confirmers.push({ address, label: info.label });
  }
  return confirmers;
}

export async function renderConfirmersPanel() {
  const panel = document.getElementById("confirmers-panel");
  panel.innerHTML = '<h3>Verified <span data-relabel="Confirmer">Confirmer</span>s</h3>';
  let contract, addresses;
  try {
    contract = getContract();
    addresses = await contract.getConfirmerList();
    if (addresses.length === 0) throw new Error("no confirmers on-chain yet");
  } catch (error) {
    renderPreviewConfirmers(panel);
    return;
  }

  const nextCampaignId = await contract.nextCampaignId();
  const campaignIds = Array.from({ length: Number(nextCampaignId) }, (_, i) => i);

  let rank = 1;
  for (const address of addresses) {
    const info = await contract.platformConfirmers(address);
    const [confirmed, total] = await contract.getConfirmerScore(address, campaignIds);
    if (!info.isAllowed) continue;
    panel.insertAdjacentHTML("beforeend", confirmerRow(rank++, info.label, ethers.formatEther(info.stake), Number(confirmed), Number(total)));
  }
}

// No wallet connected, RPC unreachable, or no confirmers registered on-chain yet — demo data
// so the panel isn't empty.
function renderPreviewConfirmers(panel) {
  previewSnapshot.confirmers.forEach((info, i) => {
    const score = previewSnapshot.confirmerScores[info.address];
    panel.insertAdjacentHTML("beforeend", confirmerRow(i + 1, info.label, ethers.formatEther(info.stake), score.confirmed, score.total));
  });
}

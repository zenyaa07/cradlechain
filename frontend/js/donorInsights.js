// "Which campaigns am I already in, which should I look at next" — only meaningful
// once we know who's asking, so this stays hidden until a wallet or backend session
// resolves an address. Recommendation logic is deliberately simple (most-donated
// category, not-yet-donated campaigns) rather than a real ranking model.
const CATEGORY_LABELS = ["Urgent", "Ongoing", "Long-term"];

let currentAddress = null;

document.addEventListener("cradlechain:connected", (event) => {
  currentAddress = event.detail?.address || null;
});
window.addEventListener("cradlechain:backend-session", (event) => {
  currentAddress = event.detail?.address || null;
});

function computeInsights(snapshot, address) {
  const lower = address.toLowerCase();
  const yourCampaignIds = new Set(
    snapshot.donations.filter((d) => d.donor.toLowerCase() === lower).map((d) => d.campaignId)
  );
  const yourCampaigns = snapshot.campaigns.filter((c) => yourCampaignIds.has(c.id));
  if (yourCampaigns.length === 0) return { yourCampaigns: [], recommended: [] };

  const categoryCounts = {};
  yourCampaigns.forEach((c) => {
    categoryCounts[c.category] = (categoryCounts[c.category] || 0) + 1;
  });
  const topCategory = Number(Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0][0]);
  const recommended = snapshot.campaigns.filter((c) => !yourCampaignIds.has(c.id) && c.category === topCategory);

  return { yourCampaigns, recommended, topCategory };
}

function scrollToCampaign(id) {
  document.querySelector(`.campaign-card[data-campaign-id="${id}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function campaignChip(campaign) {
  return `<button type="button" class="insight-chip" data-campaign-id="${campaign.id}">${campaign.name}</button>`;
}

export async function renderDonorInsights(snapshot) {
  const mount = document.getElementById("donor-insights");
  if (!mount) return;

  if (!currentAddress) {
    mount.hidden = true;
    mount.innerHTML = "";
    return;
  }

  const { yourCampaigns, recommended, topCategory } = computeInsights(snapshot, currentAddress);
  if (yourCampaigns.length === 0) {
    mount.hidden = true;
    mount.innerHTML = "";
    return;
  }

  mount.hidden = false;
  mount.innerHTML = `
    <div class="insight-block">
      <p class="section-eyebrow">Your campaigns</p>
      <div class="insight-chips">${yourCampaigns.map(campaignChip).join("")}</div>
    </div>
    ${
      recommended.length > 0
        ? `
      <div class="insight-block">
        <p class="section-eyebrow">Recommended for you — you tend to give to ${CATEGORY_LABELS[topCategory]} campaigns</p>
        <div class="insight-chips">${recommended.map(campaignChip).join("")}</div>
      </div>`
        : ""
    }
  `;
  mount.querySelectorAll(".insight-chip").forEach((chip) => {
    chip.addEventListener("click", () => scrollToCampaign(chip.dataset.campaignId));
  });
}

import { getContract, getSigner, txOverrides } from "./wallet.js";
import { getChainSnapshot, invalidateChainSnapshot } from "./chainData.js";
import { renderCheckpointStatuses } from "./confirmations.js";
import { campaignImage, readFileAsDataUrl, saveCampaignImage } from "./campaignImages.js";
import { renderDonorInsights } from "./donorInsights.js";
import { previewSnapshot } from "./previewData.js";
import { renderDonorLedger } from "./donorLedger.js";
import { categoryLabel, categoryColors } from "./mapSeedData.js";
import { mountLiveTriggerButton } from "./liveTrigger.js";
import { fetchAllowedConfirmers } from "./confirmersPanel.js";

// Resolves campaigns (+ their checkpoint history + confirmer) from the shared chain
// snapshot, which already falls back to demo/preview data with no wallet connected
// (see chainData.js) — same source the Overview/Analytics pages use.
export async function fetchCampaigns({ withConfirmerTrack = true } = {}) {
  const snapshot = await getChainSnapshot();
  const isPreview = Boolean(snapshot.isPreview);
  const confirmerLabelByAddress = Object.fromEntries(snapshot.confirmers.map((c) => [c.address, c.label]));
  const campaigns = await Promise.all(
    snapshot.campaigns.map(async (campaign) => {
      const history = snapshot.checkpoints
        .filter((c) => c.campaignId === campaign.id)
        .sort((a, b) => a.checkpointId - b.checkpointId);
      const confirmerAddress = snapshot.confirmerByCampaign[campaign.id];

      let confirmerTrack = { confirmed: 0, total: 0 };
      if (withConfirmerTrack && confirmerAddress) {
        if (isPreview) {
          const preview = previewSnapshot.confirmerScores[confirmerAddress];
          if (preview) confirmerTrack = preview;
        } else {
          try {
            const contract = getContract();
            const campaignIds = snapshot.campaigns.map((c) => c.id);
            const [confirmed, total] = await contract.getConfirmerScore(confirmerAddress, campaignIds);
            confirmerTrack = { confirmed: Number(confirmed), total: Number(total) };
          } catch (err) {
            console.warn(`getConfirmerScore failed for campaign ${campaign.id}:`, err);
          }
        }
      }

      return {
        id: campaign.id,
        campaign,
        history,
        confirmerAddress,
        confirmerLabel: confirmerAddress ? confirmerLabelByAddress[confirmerAddress] : null,
        confirmerTrack,
      };
    })
  );
  return { isPreview, snapshot, campaigns };
}

// Two concurrent triggers (e.g. two live-checkpoint buttons clicked in quick succession) could
// otherwise both clear + repopulate #campaign-list at once, producing duplicate cards. If a
// render is already in flight, queue at most one follow-up — it'll pick up fresh data anyway.
let renderInFlight = false;
let renderQueued = false;

export async function renderDonateCampaignList() {
  if (renderInFlight) {
    renderQueued = true;
    return;
  }
  renderInFlight = true;
  try {
    await renderDonateCampaignListInner();
  } finally {
    renderInFlight = false;
    if (renderQueued) {
      renderQueued = false;
      renderDonateCampaignList().catch((error) => console.error("queued campaign render failed:", error));
    }
  }
}

// Same guard as renderDonateCampaignList above, and for the same reason it started mattering:
// tryRestoreWallet() (wallet.js) now auto-connects on page load, right on the heels of the
// page's own initial unconnected renderOrganizeCampaignList() call. Without this, the two calls'
// "#organize-list.innerHTML = ''" resets interleave — one call's later loop iterations keep
// appending campaign cards onto the *other* call's already-rendered list instead of its own,
// leaving duplicate cards where any Confirm button's listener can end up bound to a container
// that a later `container.innerHTML = ""` (confirmations.js) silently wipes, so clicking it does
// nothing.
let organizeRenderInFlight = false;
let organizeRenderQueued = false;

export async function renderOrganizeCampaignList() {
  if (organizeRenderInFlight) {
    organizeRenderQueued = true;
    return;
  }
  organizeRenderInFlight = true;
  try {
    await renderOrganizeCampaignListInner();
  } finally {
    organizeRenderInFlight = false;
    if (organizeRenderQueued) {
      organizeRenderQueued = false;
      renderOrganizeCampaignList().catch((error) => console.error("queued organize render failed:", error));
    }
  }
}

async function renderDonateCampaignListInner() {
  const list = document.getElementById("campaign-list");
  const { campaigns, isPreview, snapshot } = await fetchCampaigns();
  list.innerHTML = "";
  for (const { id, campaign, confirmerLabel } of campaigns) {
    const card = document.createElement("div");
    card.className = "card card-glass campaign-card";
    card.dataset.campaignId = id.toString();
    card.innerHTML = `
      <img class="campaign-photo" src="${campaignImage(id.toString(), campaign.name)}" alt="${campaign.name}" />
      <div class="campaign-card-header">
        <h3 data-relabel="CampaignHeading">${campaign.name}</h3>
        <div class="campaign-card-badges">
          <span class="badge badge-category" style="background:${categoryColors(categoryLabel(campaign.category)).bg};color:${categoryColors(categoryLabel(campaign.category)).fg};" title="Category is fixed at creation and sets this campaign's gone-dark threshold.">${categoryLabel(campaign.category)} &#9432;</span>
        </div>
      </div>
      ${campaign.organizerName ? `<p class="text-secondary campaign-card-organizer">${campaign.organizerName}</p>` : ""}

      <p class="text-secondary">Confirmer: <strong>${confirmerLabel || "not yet assigned"}</strong></p>

      <form class="donate-form">
        <input name="amount" type="number" step="0.001" min="0.001" placeholder="Amount (POL)" data-relabel="DonationAmount" required />
        <button type="submit" data-relabel="Donate">Donate</button>
      </form>
    `;
    list.appendChild(card);
    if (!isPreview) mountLiveTriggerButton(card, id);

    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    // The donate form lives inside the card, so its own clicks/keys must not navigate away.
    const shouldOpenDetail = (event) => !event.target.closest(".donate-form");
    const openDetail = () =>
      document.dispatchEvent(
        new CustomEvent("cradlechain:navigate", { detail: { page: "campaign-detail", campaignId: id } })
      );
    card.addEventListener("click", (event) => {
      if (shouldOpenDetail(event)) openDetail();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (!shouldOpenDetail(event)) return;
      event.preventDefault();
      openDetail();
    });
  }
  await renderDonorLedger(snapshot);
  await renderDonorInsights(snapshot);
}

// A campaign created before this fix (or one whose registerConfirmer tx failed right after
// createCampaign) has no confirmer and no other way in the app to get one — this is the
// backfill/retry path, shown only to that campaign's own organizer, only while it's still
// possible (registerConfirmer reverts once a donation has landed).
async function mountAssignConfirmerForm(card, campaignId) {
  const slot = card.querySelector(".assign-confirmer-slot");
  if (!slot) return;
  const signer = getSigner();
  if (!signer) return;

  slot.innerHTML = `
    <form class="assign-confirmer-form">
      <select name="confirmer" required><option value="" disabled selected>Loading verified confirmers…</option></select>
      <button type="submit">Assign confirmer</button>
    </form>
  `;
  const select = slot.querySelector("select");
  try {
    const confirmers = await fetchAllowedConfirmers(getContract());
    populateConfirmerOptions(select, confirmers);
  } catch (error) {
    slot.innerHTML = '<p class="text-secondary">Could not load verified confirmers.</p>';
    return;
  }

  slot.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const contract = getContract(signer);
      const tx = await contract.registerConfirmer(campaignId, new FormData(event.target).get("confirmer"), txOverrides());
      await tx.wait();
      document.dispatchEvent(new CustomEvent("cradlechain:refresh-campaigns"));
      await renderOrganizeCampaignList();
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "insufficient-funds" } }));
    }
  });
}

async function renderOrganizeCampaignListInner() {
  const list = document.getElementById("organize-list");
  const { campaigns, isPreview } = await fetchCampaigns({ withConfirmerTrack: false });
  const signer = getSigner();
  const connectedAddress = signer ? await signer.getAddress() : null;
  list.innerHTML = "";
  for (const { id, campaign, history, confirmerAddress } of campaigns) {
    const card = document.createElement("div");
    card.className = "card card-glass campaign-card";
    card.dataset.campaignId = id.toString();
    card.dataset.nextCheckpointId = history.length.toString();
    const needsConfirmer =
      !isPreview && !confirmerAddress && connectedAddress && connectedAddress.toLowerCase() === campaign.organizer.toLowerCase();
    card.innerHTML = `
      <h3 data-relabel="CampaignHeading">${campaign.name}</h3>

      ${needsConfirmer ? '<div class="assign-confirmer-slot"></div>' : ""}
      <div class="checkpoint-status-list"></div>

      <form class="checkpoint-form">
        <input name="donationId" type="number" min="0" placeholder="Donation ID" required />
        <input name="stageName" placeholder="Stage (e.g. campaign wallet -> vendor)" required />
        <input name="location" placeholder="Location (e.g. Kota Bharu, Kelantan)" required />
        <span class="text-secondary" title="Attaching a photo stores it on IPFS and its hash on-chain — the photo itself isn't stored on the blockchain.">&#9432;</span>
        <input name="proof" type="file" accept="image/*" required />
        <button type="submit" data-relabel="Checkpoint">Log Checkpoint</button>
      </form>
    `;
    list.appendChild(card);
    if (needsConfirmer) await mountAssignConfirmerForm(card, id);
    await renderCheckpointStatuses(id, history, isPreview, campaign.description);
  }
}

// Fires right after tx.wait() resolves a confirm/log/revoke transaction — but tx.wait() only
// promises the tx is mined on whichever RPC MetaMask broadcast it through. Our own reads go
// through a different RPC (see AMOY_RPC_URLS in contractConfig.js), and that node can lag a few
// seconds behind before it reflects the same block. Re-fetching instantly was showing stale
// data, making a just-confirmed checkpoint look unconfirmed until a manual page refresh gave the
// read RPC time to catch up. A short delay here does that waiting instead of asking for one.
document.addEventListener("cradlechain:refresh-campaigns", () => {
  invalidateChainSnapshot();
  setTimeout(() => {
    renderDonateCampaignList();
    renderOrganizeCampaignList();
  }, 2000);
});

function populateConfirmerOptions(select, confirmers) {
  select.innerHTML = confirmers.length
    ? confirmers.map((c) => `<option value="${c.address}">${c.label}</option>`).join("")
    : '<option value="" disabled selected>No verified confirmers yet — ask the platform owner to approve one first</option>';
}

export function mountCreateCampaignForm() {
  const form = document.getElementById("create-campaign-form");
  const confirmerSelect = document.getElementById("create-campaign-confirmer");
  fetchAllowedConfirmers(getContract())
    .then((confirmers) => populateConfirmerOptions(confirmerSelect, confirmers))
    .catch(() => populateConfirmerOptions(confirmerSelect, []));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const signer = getSigner();
    if (!signer) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "no-wallet-connected" } }));
      return;
    }
    const contract = getContract(signer);
    const data = new FormData(form);
    const newCampaignId = await contract.nextCampaignId();
    const photos = data.getAll("photo");
    const tx = await contract.createCampaign(
      data.get("name"),
      data.get("description"),
      data.get("targetWallet"),
      Number(data.get("category")),
      txOverrides()
    );
    await tx.wait();

    // Must happen before any donation lands (the contract enforces this) — done right away so a
    // campaign is never left donatable-but-unconfirmable. If it fails (rejected, out of gas), the
    // Organize list's "Assign confirmer" retry form (mountAssignConfirmerForm) covers it after.
    try {
      const confirmTx = await contract.registerConfirmer(newCampaignId, data.get("confirmer"), txOverrides());
      await confirmTx.wait();
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "insufficient-funds" } }));
    }

    for (const photo of photos) {
      if (photo && photo.size > 0) {
        saveCampaignImage(newCampaignId.toString(), await readFileAsDataUrl(photo));
      }
    }
    form.reset();
    await renderOrganizeCampaignList();
    await renderDonateCampaignList();
  });
}

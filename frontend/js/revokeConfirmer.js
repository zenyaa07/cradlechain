import { getContract, getSigner, txOverrides } from "./wallet.js";
import { fetchAllowedConfirmers } from "./confirmersPanel.js";

// Admin-only (platformOwner) control for revokeConfirmer -> cooldown -> finalizeRevocation.
// Mirrors flagOverdue.js's shape: render nothing unless there's something an admin can
// actually do here, so this stays invisible for every other visitor including in preview mode.
let countdownTimer = null;

function clearCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = null;
}

export async function mountRevokeConfirmerPanel(campaignId, isPreview) {
  clearCountdown();
  const slot = document.querySelector(`.campaign-card[data-campaign-id="${campaignId}"] .detail-revoke-slot`);
  if (!slot) return;

  if (isPreview) {
    slot.innerHTML = "";
    return;
  }

  const signer = getSigner();
  if (!signer) {
    slot.innerHTML = "";
    return;
  }

  const contract = getContract(signer);
  const [connectedAddress, platformOwner] = await Promise.all([signer.getAddress(), contract.platformOwner()]);
  if (connectedAddress.toLowerCase() !== platformOwner.toLowerCase()) {
    slot.innerHTML = "";
    return;
  }

  let currentConfirmer, pending;
  try {
    [currentConfirmer, pending] = await Promise.all([
      contract.campaignConfirmer(campaignId),
      contract.pendingRevocations(campaignId),
    ]);
  } catch (error) {
    slot.innerHTML = "";
    return;
  }

  if (pending.active) {
    renderPendingRevocation(slot, contract, campaignId, Number(pending.revokeAt));
    return;
  }

  slot.innerHTML = `
    <div class="detail-revoke">
      <p class="text-secondary">Admin: revoke this campaign's confirmer</p>
      <form class="revoke-confirmer-form">
        <select name="replacement" required><option value="" disabled selected>Loading verified confirmers…</option></select>
        <button type="submit">Revoke &amp; schedule replacement</button>
      </form>
    </div>
  `;
  const select = slot.querySelector("select");
  try {
    const confirmers = await fetchAllowedConfirmers(contract);
    const eligible = confirmers.filter((c) => c.address.toLowerCase() !== currentConfirmer.toLowerCase());
    select.innerHTML = eligible.length
      ? eligible.map((c) => `<option value="${c.address}">${c.label}</option>`).join("")
      : '<option value="" disabled selected>No other verified confirmers available</option>';
  } catch (error) {
    select.innerHTML = '<option value="" disabled selected>Could not load verified confirmers</option>';
  }

  slot.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const tx = await contract.revokeConfirmer(campaignId, new FormData(event.target).get("replacement"), txOverrides());
      await tx.wait();
      await mountRevokeConfirmerPanel(campaignId, isPreview);
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "revoke-confirmer-failed" } }));
    }
  });
}

function renderPendingRevocation(slot, contract, campaignId, revokeAt) {
  slot.innerHTML = `
    <div class="detail-revoke">
      <p class="badge badge-pending">Confirmer swap scheduled — takes effect in <span class="revoke-countdown"></span></p>
      <button type="button" class="finalize-revocation-btn">Finalize revocation</button>
    </div>
  `;
  const countdownEl = slot.querySelector(".revoke-countdown");
  const finalizeBtn = slot.querySelector(".finalize-revocation-btn");

  const tick = () => {
    const remaining = revokeAt - Math.floor(Date.now() / 1000);
    countdownEl.textContent = remaining > 0 ? `${remaining}s` : "now";
    finalizeBtn.disabled = remaining > 0;
    if (remaining <= 0) clearCountdown();
  };
  tick();
  countdownTimer = setInterval(tick, 1000);

  finalizeBtn.addEventListener("click", async () => {
    try {
      const tx = await contract.finalizeRevocation(campaignId, txOverrides());
      await tx.wait();
      document.dispatchEvent(new CustomEvent("cradlechain:refresh-campaigns"));
      const isPreview = false;
      await mountRevokeConfirmerPanel(campaignId, isPreview);
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "finalize-revocation-failed" } }));
    }
  });
}

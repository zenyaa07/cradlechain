import { getContract, getSigner, txOverrides } from "./wallet.js";
import { fetchAllowedConfirmers } from "./confirmersPanel.js";

export async function mountFlagOverdueButton(campaignId, isPreview) {
  const slot = document.querySelector(`.campaign-card[data-campaign-id="${campaignId}"] .detail-flag-overdue-slot`);
  if (!slot) return;

  if (isPreview) {
    slot.innerHTML = "";
    return;
  }

  const contract = getContract();
  let overdue = false;
  try {
    overdue = await contract.isOverdue(campaignId);
  } catch (error) {
    slot.innerHTML = "";
    return;
  }
  if (!overdue) {
    slot.innerHTML = "";
    return;
  }

  slot.innerHTML = `
    <div class="detail-flag-overdue">
      <p class="badge badge-pending">This campaign's latest checkpoint is overdue</p>
      <form class="flag-overdue-form">
        <select name="replacement" required><option value="" disabled selected>Loading verified confirmers…</option></select>
        <button type="submit">Flag overdue &amp; start confirmer swap</button>
      </form>
    </div>
  `;
  const select = slot.querySelector("select");
  try {
    // flagOverdue() reverts if the replacement equals the campaign's current confirmer —
    // exclude it so the dropdown never offers an option that would revert.
    const [confirmers, currentConfirmer] = await Promise.all([
      fetchAllowedConfirmers(contract),
      contract.campaignConfirmer(campaignId),
    ]);
    const eligible = confirmers.filter((c) => c.address.toLowerCase() !== currentConfirmer.toLowerCase());
    select.innerHTML = eligible.length
      ? eligible.map((c) => `<option value="${c.address}">${c.label}</option>`).join("")
      : '<option value="" disabled selected>No other verified confirmers available</option>';
  } catch (error) {
    select.innerHTML = '<option value="" disabled selected>Could not load verified confirmers</option>';
  }

  slot.querySelector("form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const signer = getSigner();
    if (!signer) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "no-wallet-connected" } }));
      return;
    }
    try {
      const contractWithSigner = getContract(signer);
      const tx = await contractWithSigner.flagOverdue(campaignId, new FormData(event.target).get("replacement"), txOverrides());
      await tx.wait();
      await mountFlagOverdueButton(campaignId, isPreview);
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "flag-overdue-failed" } }));
    }
  });
}

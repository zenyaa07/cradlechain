import { getContract, getSigner, txOverrides } from "./wallet.js";
import { previewSnapshot } from "./previewData.js";

export function mountConfirmerRequestForm() {
  document.getElementById("ngo-onboarding").addEventListener("submit", async (event) => {
    if (!event.target.matches(".ngo-request-form")) return;
    event.preventDefault();
    const signer = getSigner();
    if (!signer) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "no-wallet-connected" } }));
      return;
    }
    const formData = new FormData(event.target);
    const label = formData.get("label");
    const jppmRegNumber = formData.get("jppmRegNumber");
    try {
      const contract = getContract(signer);
      const tx = await contract.requestConfirmerStatus(label, jppmRegNumber, txOverrides());
      await tx.wait();
      event.target.reset();
      await renderAdminReviewList();
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "insufficient-funds" } }));
    }
  });
}

// Preview rows are read-only (Approve disabled) — same "visible but inert without a
// wallet" principle the rest of the app uses, rather than hiding this list entirely.
function renderPreviewRequests(list) {
  list.innerHTML = "";
  previewSnapshot.pendingConfirmerRequests.forEach((request) => {
    const row = document.createElement("div");
    row.className = "ngo-request-row";
    row.title = request.address;
    row.innerHTML = `
      <div class="ngo-request-info">
        <p class="ngo-label">${request.label}</p>
        <p class="text-secondary">JPPM ${request.jppmRegNumber}</p>
      </div>
      <button type="button" class="approve-btn" disabled>Approve</button>
    `;
    list.appendChild(row);
  });
}

export async function renderAdminReviewList() {
  const list = document.getElementById("ngo-review-list");
  if (!list) return;
  list.innerHTML = "";

  const signer = getSigner();
  if (!signer) {
    renderPreviewRequests(list);
    return;
  }

  const contract = getContract(signer);
  const connectedAddress = await signer.getAddress();
  const platformOwner = await contract.platformOwner();
  if (connectedAddress.toLowerCase() !== platformOwner.toLowerCase()) {
    renderPreviewRequests(list);
    return;
  }

  const minStake = await contract.MIN_CONFIRMER_STAKE();
  const requesters = await contract.getConfirmerRequestList();

  for (const requester of requesters) {
    const request = await contract.confirmerRequests(requester);
    if (!request.exists) continue;

    const row = document.createElement("div");
    row.className = "ngo-request-row";
    row.title = requester;
    row.innerHTML = `
      <div class="ngo-request-info">
        <p class="ngo-label"></p>
        <p class="text-secondary">JPPM <span class="ngo-jppm"></span></p>
      </div>
      <input type="number" step="0.01" min="0.1" class="stake-input" value="${ethers.formatEther(minStake)}" />
      <button type="button" class="approve-btn">Approve</button>
    `;
    row.querySelector(".ngo-label").textContent = request.label;
    row.querySelector(".ngo-jppm").textContent = request.jppmRegNumber;
    row.querySelector(".approve-btn").addEventListener("click", async () => {
      const stakeValue = row.querySelector(".stake-input").value;
      try {
        const tx = await contract.addPlatformConfirmer(requester, request.label, txOverrides({ value: ethers.parseEther(stakeValue) }));
        await tx.wait();
        await renderAdminReviewList();
      } catch (error) {
        document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "insufficient-funds" } }));
      }
    });
    list.appendChild(row);
  }
}

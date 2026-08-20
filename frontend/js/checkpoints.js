import { getContract, getSigner, txOverrides } from "./wallet.js";
import { PINATA_JWT } from "./pinataConfig.js";
import { saveCheckpointLocation, geocodeLocation } from "./checkpointLocations.js";

export async function uploadProofToIPFS(file) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });
  if (!response.ok) {
    document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "ipfs-upload-failed" } }));
    throw new Error("IPFS upload failed");
  }
  const data = await response.json();
  return data.IpfsHash;
}

export function mountCheckpointForm() {
  document.getElementById("organize-list").addEventListener("submit", async (event) => {
    if (!event.target.matches(".checkpoint-form")) return;
    event.preventDefault();
    const signer = getSigner();
    if (!signer) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "no-wallet-connected" } }));
      return;
    }
    const card = event.target.closest(".campaign-card");
    const campaignId = card.dataset.campaignId;
    const formData = new FormData(event.target);
    const stageName = formData.get("stageName");
    const donationId = formData.get("donationId");
    const location = formData.get("location");
    const file = formData.get("proof");

    if (!file || file.size === 0) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "evidence-required" } }));
      return;
    }
    let ipfsHash;
    try {
      ipfsHash = await uploadProofToIPFS(file);
    } catch (error) {
      return;
    }
    // Geocoding is best-effort: a typo or an offline Nominatim shouldn't block logging the
    // checkpoint on-chain, it just means the custody map falls back to the demo route/pin.
    let geocoded = null;
    try {
      geocoded = await geocodeLocation(location);
    } catch (error) {
      console.warn(`geocoding "${location}" failed:`, error);
    }
    try {
      const contract = getContract(signer);
      const tx = await contract.logCheckpoint(campaignId, donationId, stageName, ipfsHash, txOverrides());
      await tx.wait();
      if (geocoded) {
        const checkpointId = Number(card.dataset.nextCheckpointId || 0);
        saveCheckpointLocation(campaignId, checkpointId, { ...geocoded, label: stageName || geocoded.label });
      }
      event.target.reset();
      document.dispatchEvent(new CustomEvent("cradlechain:refresh-campaigns"));
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "insufficient-funds" } }));
    }
  });
}

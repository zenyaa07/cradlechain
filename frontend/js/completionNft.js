import { getContract, getSigner, txOverrides } from "./wallet.js";

// Mirrors contracts/CradleChain.sol's mintCompletionNFT requirements exactly: all
// checkpoints confirmed AND all donations released — checking only the former lets the
// button render for a campaign whose mint call would still revert.
function isEligible(history, donations, releasedDonationIds) {
  const checkpointsConfirmed = history.length > 0 && history.every((c) => Number(c.status) === 1);
  const donationsReleased = donations.length > 0 && donations.every((d) => releasedDonationIds.has(d.donationId));
  return checkpointsConfirmed && donationsReleased;
}

export async function mountCompletionNftButton(campaignId, history, isPreview, donations, releasedDonationIds) {
  const slot = document.querySelector(`.campaign-card[data-campaign-id="${campaignId}"] .detail-nft-slot`);
  if (!slot) return;

  if (isPreview) {
    slot.innerHTML = isEligible(history, donations, releasedDonationIds)
      ? '<p class="text-secondary detail-nft-note">This campaign has confirmed every checkpoint — in the live contract a Completion NFT would be mintable here.</p>'
      : "";
    return;
  }

  if (!isEligible(history, donations, releasedDonationIds)) {
    slot.innerHTML = "";
    return;
  }

  const contract = getContract();
  let alreadyMinted = false;
  try {
    alreadyMinted = await contract.completionMinted(campaignId);
  } catch (error) {
    slot.innerHTML = "";
    return;
  }

  if (alreadyMinted) {
    slot.innerHTML = '<p class="badge badge-confirmed">Completion NFT minted</p>';
    return;
  }

  slot.innerHTML = '<button type="button" class="detail-nft-mint-btn">Mint Completion NFT</button>';
  slot.querySelector("button").addEventListener("click", async () => {
    const signer = getSigner();
    if (!signer) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "no-wallet-connected" } }));
      return;
    }
    try {
      const contractWithSigner = getContract(signer);
      const tx = await contractWithSigner.mintCompletionNFT(campaignId, txOverrides());
      await tx.wait();
      await mountCompletionNftButton(campaignId, history, isPreview, donations, releasedDonationIds);
    } catch (error) {
      // ethers v6: user-rejected MetaMask prompts and on-chain reverts carry distinct
      // .code values — don't collapse either into the generic insufficient-funds message.
      let code = "insufficient-funds";
      if (error.code === "ACTION_REJECTED") code = "tx-rejected";
      else if (error.code === "CALL_EXCEPTION") code = "mint-not-eligible";
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code } }));
    }
  });
}

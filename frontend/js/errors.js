const MESSAGES = {
  "no-metamask": "MetaMask not detected. Install the MetaMask extension to connect a wallet and donate.",
  "no-wallet-connected": "Connect your wallet first.",
  "ipfs-upload-failed": "Uploading your proof photo to IPFS failed. Please try again or log the checkpoint without a photo.",
  "evidence-required": "A checkpoint needs a photo of evidence attached before it can be logged.",
  "ai-summary-timeout": "The AI summary service timed out. Showing a fallback summary instead.",
  "ai-verify-timeout": "The AI evidence check timed out. You can still confirm this checkpoint without it.",
  "insufficient-funds": "This transaction failed — your wallet doesn't have enough test-MATIC. Use the Amoy faucet to top up.",
  "not-registered-confirmer": "Rejected on-chain: this wallet isn't the registered confirmer for this campaign, so it can't confirm this checkpoint.",
  "confirm-failed": "Confirming this checkpoint failed. Try again in a moment.",
  "auth-failed": "Sign up or log in failed. Check your email and password and try again.",
  "donate-failed": "Your RM donation failed. Please try again.",
  "invalid-input": "Enter a valid email and password.",
  "email-taken": "An account with that email already exists. Log in instead.",
  "invalid-credentials": "Incorrect email or password.",
  "not-authenticated": "Log in first to donate this way.",
  "trigger-checkpoint-failed": "Triggering a live checkpoint failed. Try again in a moment.",
  "flag-overdue-failed": "Flagging this checkpoint as overdue failed. Try again in a moment.",
  "revoke-confirmer-failed": "Revoking this campaign's confirmer failed. Try again in a moment.",
  "finalize-revocation-failed": "Finalizing the confirmer swap failed — the cooldown may not have elapsed yet.",
  "mint-not-eligible": "This campaign isn't eligible for a Completion NFT yet — every checkpoint must be confirmed and every donation released.",
  "tx-rejected": "Transaction was cancelled.",
};

export function showErrorBanner(code) {
  const banner = document.getElementById("error-banner");
  banner.textContent = MESSAGES[code] || "Something went wrong.";
  banner.hidden = false;
}

document.addEventListener("cradlechain:error", (event) => showErrorBanner(event.detail.code));

// Now fixed to the viewport (style.css) so it stays visible regardless of scroll — nothing
// ever hid it again before, so give it a click-to-dismiss instead of leaving it stuck up top.
document.getElementById("error-banner").addEventListener("click", (event) => {
  event.target.hidden = true;
});

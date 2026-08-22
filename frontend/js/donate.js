import { getContract, getSigner, txOverrides } from "./wallet.js";
import { getCsrfToken, API_BASE } from "./backendAuth.js";

let backendSession = null;
window.addEventListener("cradlechain:backend-session", (event) => {
  backendSession = event.detail;
  updateAmountPlaceholders(document, backendSession ? "Amount (RM)" : "Amount (POL)");
});

function updateAmountPlaceholders(scope, text) {
  scope.querySelectorAll('.donate-form input[name="amount"]').forEach((input) => {
    input.placeholder = text;
  });
}

// `root` lets the same handler serve both the donate list and the campaign detail page's
// sidebar form — both live inside a `.campaign-card[data-campaign-id]`, which is all this
// needs to resolve the campaign.
export function mountDonateForms(root = document.getElementById("campaign-list")) {
  // campaigns.js/campaignDetail.js render fresh .donate-form HTML with a hardcoded
  // "Amount (POL)" placeholder every time campaign cards (re)render — which happens after
  // the one-time cradlechain:backend-session event above already fired on page load. Without
  // this, a signed-in custodial donor keeps seeing "(POL)" on any form rendered after login.
  const applyCurrentPlaceholder = () => updateAmountPlaceholders(root, backendSession ? "Amount (RM)" : "Amount (POL)");
  new MutationObserver(applyCurrentPlaceholder).observe(root, { childList: true, subtree: true });
  applyCurrentPlaceholder();

  root.addEventListener("submit", async (event) => {
    if (!event.target.matches(".donate-form")) return;
    event.preventDefault();
    const campaignId = event.target.closest(".campaign-card").dataset.campaignId;
    const amount = new FormData(event.target).get("amount");

    if (backendSession) {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`${API_BASE}/donate/`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
        body: JSON.stringify({ campaignId: Number(campaignId), rmAmount: amount }),
      });
      if (!response.ok) {
        document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "donate-failed" } }));
        return;
      }
      event.target.reset();
      return;
    }

    const signer = getSigner();
    if (!signer) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "no-wallet-connected" } }));
      return;
    }
    try {
      const contract = getContract(signer);
      const tx = await contract.donate(campaignId, txOverrides({ value: ethers.parseEther(amount) }));
      await tx.wait();
      event.target.reset();
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "insufficient-funds" } }));
    }
  });
}

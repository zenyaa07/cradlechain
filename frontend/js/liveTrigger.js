// Cards get torn down and rebuilt on every campaign-list re-render (see campaigns.js),
// which would otherwise wipe the tx link seconds after a demo trigger. Keyed by campaignId
// so a freshly (re)mounted card can restore whichever tx it last logged.
const lastTxHashByCampaignId = new Map();

export function mountLiveTriggerButton(card, campaignId) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "Trigger live checkpoint";
  button.title = "Logs a real on-chain checkpoint for this campaign right now — for judges to test live.";

  const txLink = document.createElement("a");
  txLink.target = "_blank";
  txLink.rel = "noopener noreferrer";
  txLink.style.display = "none";
  txLink.style.marginLeft = "0.5rem";

  const previousTxHash = lastTxHashByCampaignId.get(campaignId);
  if (previousTxHash) {
    txLink.href = `https://amoy.polygonscan.com/tx/${previousTxHash}`;
    txLink.textContent = "View tx";
    txLink.style.display = "";
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "Logging on-chain...";
    txLink.style.display = "none";
    try {
      const response = await fetch("/api/trigger-checkpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId }),
      });
      if (!response.ok) throw new Error("trigger-checkpoint failed");
      const { txHash } = await response.json();
      if (txHash) {
        lastTxHashByCampaignId.set(campaignId, txHash);
        txLink.href = `https://amoy.polygonscan.com/tx/${txHash}`;
        txLink.textContent = "View tx";
        txLink.style.display = "";
      }
      document.dispatchEvent(new CustomEvent("cradlechain:refresh-campaigns"));
    } catch (error) {
      document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "trigger-checkpoint-failed" } }));
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });

  const header = card.querySelector(".campaign-card-header") || card.firstElementChild;
  header.insertAdjacentElement("afterend", txLink);
  header.insertAdjacentElement("afterend", button);
}

import { getContract, getSigner, txOverrides } from "./wallet.js";
import { previewSnapshot } from "./previewData.js";

const AI_VERDICT_LABELS = {
  plausible: { text: "✓ AI check: plausible", cls: "badge-ai-plausible" },
  mismatch: { text: "⚠ AI check: mismatch", cls: "badge-ai-mismatch" },
  unclear: { text: "AI check: unclear", cls: "badge-ai-unclear" },
};

// history is resolved by the caller (chain snapshot or preview fallback). isPreview disables
// the "confirm" write action — there's no real contract behind demo data to send that
// transaction to. campaignDescription feeds the AI plausibility-check prompt (see runAiCheck
// below) — advisory only, never blocks confirming. Who's actually allowed to confirm is
// enforced by the contract itself, not by which wallet this function was rendered for.
export async function renderCheckpointStatuses(campaignId, history, isPreview = false, campaignDescription = "") {
  const signer = getSigner();
  const connectedAddress = signer ? await signer.getAddress() : null;

  const container = document.querySelector(`.campaign-card[data-campaign-id="${campaignId}"] .checkpoint-status-list`);
  container.innerHTML = "";

  // A checkpoint is still on-chain forever once logged (no delete function, by design — that's
  // the whole point of an immutable custody trail), but an accidental double-submit (same stage,
  // same photo, same status) doesn't need to render as two identical rows. Collapses only exact
  // duplicates — a real second checkpoint on the same stage with a different photo still shows.
  const seen = new Set();

  history.forEach((checkpoint, index) => {
    const dedupeKey = `${checkpoint.stageName}|${checkpoint.ipfsProofHash}|${checkpoint.status}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const row = document.createElement("div");
    row.className = "checkpoint-row";
    const isConfirmed = Number(checkpoint.status) === 1;
    const [fromNode, toNode] = checkpoint.stageName.split(/->|→/).map((s) => s.trim());
    row.innerHTML = `
      <span class="checkpoint-stage">
        <span class="checkpoint-node">${fromNode}</span>
        ${toNode ? `<span class="checkpoint-arrow">→</span><span class="checkpoint-node">${toNode}</span>` : ""}
      </span>
      <span class="badge ${isConfirmed ? "badge-confirmed" : "badge-pending"}">
        ${isConfirmed ? "confirmed" : "pending confirmation"}
      </span>
      ${
        checkpoint.ipfsProofHash
          ? `<a class="checkpoint-evidence-link" href="https://gateway.pinata.cloud/ipfs/${checkpoint.ipfsProofHash}" target="_blank" rel="noopener">View evidence photo</a>`
          : ""
      }
    `;

    if (!isConfirmed && checkpoint.ipfsProofHash) {
      const aiSlot = document.createElement("div");
      aiSlot.className = "badge badge-ai-checking";
      aiSlot.textContent = "Checking evidence…";
      row.appendChild(aiSlot);
      runAiCheck(aiSlot, checkpoint, campaignId, campaignDescription, isPreview);
    }

    // Rendered for any connected wallet, not just the registered confirmer — the contract is
    // what enforces who can actually confirm (CradleChain.sol:153). Hiding the button for
    // everyone else would hide that enforcement instead of demonstrating it.
    if (!isPreview && !isConfirmed && connectedAddress) {
      const confirmBtn = document.createElement("button");
      confirmBtn.textContent = "Confirm this checkpoint";
      confirmBtn.title = "Only the wallet address registered as this campaign's confirmer can actually confirm — any other wallet will be rejected on-chain.";
      confirmBtn.addEventListener("click", async () => {
        try {
          const contractWithSigner = getContract(signer);
          const tx = await contractWithSigner.confirmCheckpoint(campaignId, index, txOverrides());
          await tx.wait();
          // Re-render from a fresh chain read, not a bare recursive call — this function has
          // no access to the fetched history/confirmerAddress/description its own signature
          // requires, and calling itself with just campaignId would crash on history.forEach.
          document.dispatchEvent(new CustomEvent("cradlechain:refresh-campaigns"));
        } catch (error) {
          // ethers v6 only sets .code === "CALL_EXCEPTION" for reverts seen through a direct
          // RPC provider. Routed through MetaMask's injected provider (as this always is), a
          // gas-estimation revert instead surfaces with .reason (the decoded require string)
          // or raw revert .data, and .code often comes back "UNKNOWN_ERROR" — checking .reason
          // and .data too is what actually catches the "not the registered confirmer" case.
          let code = "confirm-failed";
          if (error.code === "ACTION_REJECTED") code = "tx-rejected";
          else if (error.code === "CALL_EXCEPTION" || error.reason || error.data) code = "not-registered-confirmer";
          else if (error.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(error.shortMessage || error.message || "")) code = "insufficient-funds";
          document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code } }));
        }
      });
      row.appendChild(confirmBtn);
    }
    container.appendChild(row);
  });
}

// ipfsProofHash is content-addressed — the same photo always hashes the same, so a cached
// verdict never goes stale. Re-rendering the checkpoint list (page load, wallet connect,
// backend-session change) would otherwise re-spend a Gemini vision call per pending photo
// every time — and Gemini's free tier is a 20-requests/day cap, so this matters a lot more
// here than for the Groq-backed summarize endpoint.
const FAILURE_RETRY_MS = 5 * 60 * 1000;

function cachedVerdict(ipfsProofHash) {
  try {
    const cached = JSON.parse(sessionStorage.getItem(`cc-ai-verdict:${ipfsProofHash}`));
    if (!cached) return null;
    // A failure (e.g. quota exhausted) is cached briefly too — a burst of re-renders
    // shouldn't keep re-spending calls on a check that's just going to fail again, but it's
    // still worth retrying occasionally in case the quota freed up.
    if (cached.failed) return Date.now() - cached.ts < FAILURE_RETRY_MS ? cached : null;
    return cached;
  } catch (error) {
    return null;
  }
}

// Runs after the row (confirm button included) is already in the DOM and only ever swaps
// the placeholder badge in place — this check is advisory only and must never gate or
// delay the confirm button (see Global Constraints in the plan).
async function runAiCheck(slot, checkpoint, campaignId, campaignDescription, isPreview) {
  if (isPreview) {
    const result = previewSnapshot.aiVerdicts?.[campaignId]?.[checkpoint.checkpointId];
    if (result) {
      renderAiVerdict(slot, result);
    } else {
      renderAiNote(slot, "AI check unavailable");
    }
    return;
  }

  const cached = cachedVerdict(checkpoint.ipfsProofHash);
  if (cached) {
    if (cached.failed) renderAiNote(slot, "AI check unavailable", () => retryAiCheck(slot, checkpoint, campaignId, campaignDescription, isPreview));
    else renderAiVerdict(slot, cached);
    return;
  }

  try {
    const response = await fetch("/api/verify-checkpoint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stageName: checkpoint.stageName,
        campaignDescription,
        ipfsProofHash: checkpoint.ipfsProofHash,
      }),
    });
    if (!response.ok) throw new Error("verify-checkpoint endpoint failed");
    const result = await response.json();
    sessionStorage.setItem(`cc-ai-verdict:${checkpoint.ipfsProofHash}`, JSON.stringify(result));
    renderAiVerdict(slot, result);
  } catch (error) {
    sessionStorage.setItem(`cc-ai-verdict:${checkpoint.ipfsProofHash}`, JSON.stringify({ failed: true, ts: Date.now() }));
    document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "ai-verify-timeout" } }));
    renderAiNote(slot, "AI check unavailable", () => retryAiCheck(slot, checkpoint, campaignId, campaignDescription, isPreview));
  }
}

// A manual retry bypasses the cache entirely (not just the failure-retry window) — the user
// clicked because they want another attempt right now, not because FAILURE_RETRY_MS happened
// to elapse.
function retryAiCheck(slot, checkpoint, campaignId, campaignDescription, isPreview) {
  sessionStorage.removeItem(`cc-ai-verdict:${checkpoint.ipfsProofHash}`);
  slot.className = "badge badge-ai-checking";
  slot.textContent = "Checking evidence…";
  runAiCheck(slot, checkpoint, campaignId, campaignDescription, isPreview);
}

function renderAiVerdict(slot, result) {
  if (result.verdict === "no-evidence") {
    renderAiNote(slot, "No photo evidence uploaded");
    return;
  }
  const label = AI_VERDICT_LABELS[result.verdict] || AI_VERDICT_LABELS.unclear;
  slot.className = `badge ${label.cls}`;
  slot.textContent = label.text;
  if (result.reasoning) {
    const reasoningEl = document.createElement("div");
    reasoningEl.className = "badge-ai-reasoning";
    reasoningEl.textContent = result.reasoning;
    slot.appendChild(reasoningEl);
  }
}

function renderAiNote(slot, text, onRetry) {
  slot.className = "badge badge-ai-note";
  slot.textContent = text;
  if (onRetry) {
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "badge-ai-retry";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", onRetry);
    slot.appendChild(retryBtn);
  }
}

import { ethers } from "ethers";
import fs from "fs";
import path from "path";

const deployment = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "frontend", "js", "contractDeployment.json"), "utf-8")
);

const inFlight = new Set();
const RELAYER_SAFETY_FLOOR = ethers.parseEther("0.05");

// Amoy's minimum priority fee has been observed well above what fee-data estimates suggest
// (seen live-tripping MetaMask with a "gas tip cap ..., minimum needed 25000000000" rejection),
// so both server-sent txs below force a fee comfortably over that floor rather than trusting
// the provider's own suggestion.
const TX_OVERRIDES = {
  maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
  maxFeePerGas: ethers.parseUnits("100", "gwei"),
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const { campaignId } = req.body;
  if (campaignId === undefined || campaignId === null || Number.isNaN(Number(campaignId))) {
    res.status(400).json({ error: "invalid-campaign-id" });
    return;
  }

  if (!process.env.DEMO_ORGANIZER_PRIVATE_KEY || !process.env.ALCHEMY_AMOY_URL) {
    res.status(500).json({ error: "trigger-not-configured" });
    return;
  }

  if (inFlight.has(campaignId)) {
    res.status(429).json({ error: "request-in-progress" });
    return;
  }
  inFlight.add(campaignId);

  try {
    const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_AMOY_URL);
    const readContract = new ethers.Contract(deployment.address, deployment.abi, provider);

    const campaign = await readContract.getCampaign(campaignId);
    if (!campaign.exists) {
      res.status(400).json({ error: "unknown-campaign" });
      return;
    }

    const organizer = new ethers.Wallet(process.env.DEMO_ORGANIZER_PRIVATE_KEY, provider);
    const organizerBalance = await provider.getBalance(organizer.address);
    if (organizerBalance < RELAYER_SAFETY_FLOOR) {
      res.status(503).json({ error: "organizer-depleted" });
      return;
    }

    const writeContract = new ethers.Contract(deployment.address, deployment.abi, organizer);
    const history = await writeContract.getCampaignHistory(campaignId);
    const stageName = `vendor -> distribution point (live #${history.length})`;

    // Non-empty placeholder to satisfy CradleChain.sol:139's evidence-proof check — this
    // checkpoint is auto-confirmed a few lines below before any viewer sees it, same reasoning
    // as scripts/seed.js's checkpoint 0 placeholder.
    const tx = await writeContract.logCheckpoint(campaignId, 0, stageName, "QmLiveTriggerProofPlaceholder0000000001", TX_OVERRIDES);
    const receipt = await tx.wait();
    const checkpointId = history.length;

    // Confirm it too, so live-triggered checkpoints end up Confirmed like the seeded ones —
    // otherwise every click degrades the confirmer track-record ratio shown in step 3 with a
    // Pending checkpoint nothing ever confirms. We only wait for the confirm tx to be *submitted*,
    // not mined — waiting on both txs' confirmations back-to-back is what made this endpoint feel
    // slow. It mines a couple seconds after the response goes out; the UI just shows it as
    // Pending until the next refresh picks up Confirmed. A confirm failure must not undo the log.
    let confirmTxHash = null;
    if (process.env.DEMO_CONFIRMER_PRIVATE_KEY) {
      try {
        const confirmer = new ethers.Wallet(process.env.DEMO_CONFIRMER_PRIVATE_KEY, provider);
        const confirmerContract = new ethers.Contract(deployment.address, deployment.abi, confirmer);
        const confirmTx = await confirmerContract.confirmCheckpoint(campaignId, checkpointId, TX_OVERRIDES);
        confirmTxHash = confirmTx.hash;
        confirmTx.wait().catch((err) => console.warn("trigger-checkpoint: confirm tx failed to mine:", err?.message || err));
      } catch (err) {
        console.warn("trigger-checkpoint: confirm step failed:", err?.message || err);
      }
    } else {
      console.warn("trigger-checkpoint: DEMO_CONFIRMER_PRIVATE_KEY not set, checkpoint left Pending");
    }

    res.status(200).json({ txHash: receipt.hash, checkpointId, confirmTxHash });
  } catch (err) {
    console.error("trigger-checkpoint failed:", err?.message || err);
    res.status(502).json({ error: "trigger-failed" });
  } finally {
    inFlight.delete(campaignId);
  }
}

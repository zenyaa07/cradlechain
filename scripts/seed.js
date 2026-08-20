const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

// MIN_CONFIRMER_STAKE is a fixed contract constant (contracts/CradleChain.sol:23) — the only
// cost here that can't be trimmed without a fresh redeploy. Fund amounts below are generous
// (deployer holds ~50 POL) so a real-world Amoy gas-price spike mid-run can't strand a role
// wallet without enough left to pay for its next tx, the way a too-tight floor did before.
const CONFIRMER_STAKE = ethers.parseEther("0.1");
const ROLE_FUND_AMOUNT = ethers.parseEther("0.05");
const ROLE_FLOOR = ethers.parseEther("0.02");
const DONOR_FUND_AMOUNT = ethers.parseEther("0.02");
// Must clear the largest single DONATION_AMOUNTS entry (0.005) plus gas headroom, or a donor
// wallet can sit just above the floor but short of the next donation's actual tx cost (as
// happened on Amoy: balance 0.00696 ETH, needed 0.00699 ETH, floor was 0.005 so no top-up fired).
const DONOR_FLOOR = ethers.parseEther("0.01");
const DONATION_AMOUNTS = ["0.004", "0.003", "0.005", "0.004"];
const CHECKPOINT_STATUS_PENDING = 0n; // CheckpointStatus.Pending (contracts/CradleChain.sol:50)

// campaignDonations is a Solidity dynamic-array public getter, not a mapping with a zero
// default — indexing past the array's current length reverts rather than returning zeroed
// struct data. existsAt() probes a donation index by catching that revert.
//
// This is NOT used for checkpoints: empirically (both against Hardhat's local EDR network and
// a live Amoy RPC via Alchemy), an out-of-bounds array-index revert on this contract carries no
// decodable revert data (error.data === "0x"), so a generic catch here cannot be narrowed to
// "index doesn't exist" vs. "some other revert" by inspecting the error. For checkpoints,
// checkpointId is contract-assigned (not caller-specified — CradleChain.sol:137), so a false
// "doesn't exist" from a transient error would create a second, orphaned Pending checkpoint
// that the rest of this script never confirms. See the checkpoint block below, which sidesteps
// that risk entirely by using getCampaignHistory() instead of probing an index.
async function existsAt(contract, getterName, campaignId, index) {
  try {
    return await contract[getterName](campaignId, index);
  } catch (error) {
    return null;
  }
}

// Checkpoints 1 and 2 for each campaign except campaign 2 (the deliberate stalled/goneDark
// demo case — its single checkpoint must stay unconfirmed) and campaign 6 (handled separately
// below, alongside its existing completion-NFT setup checkpoint). Stage names/order match
// frontend/js/mapSeedData.js's CHECKPOINT_WAYPOINTS indices 1-2 for each campaign, so the
// custody map's first 3 stops are real confirmed hops instead of "future" placeholders.
const EXTRA_CHECKPOINTS = {
  0: [
    { stageName: "vendor -> flood relief distribution centre, Kota Bharu", donationId: 0 },
    { stageName: "distribution centre -> flood-displaced households, Pengkalan Chepa", donationId: 1 },
  ],
  1: [
    { stageName: "vendor -> school meal distribution centre, Ranau district", donationId: 0 },
    { stageName: "distribution centre -> weekly delivery, rural primary schools", donationId: 1 },
  ],
  3: [
    { stageName: "vendor -> welfare centre, Sungai Buloh", donationId: 0 },
    { stageName: "welfare centre -> emergency welfare case, Subang Jaya", donationId: 1 },
  ],
  4: [
    { stageName: "vendor -> community centre, Kundasang", donationId: 0 },
    { stageName: "community centre -> household aid delivery, Kg Mesilou", donationId: 1 },
  ],
  5: [
    { stageName: "vendor -> rehabilitation facility, Pekan Rembau", donationId: 0 },
    { stageName: "facility -> home therapy visit, Rembau district", donationId: 1 },
  ],
  7: [
    { stageName: "vendor -> healthcare facility, Bukit Mertajam", donationId: 0 },
    { stageName: "facility -> elderly home-visit outreach, Bukit Mertajam", donationId: 1 },
  ],
};

// One more checkpoint per campaign, logged but deliberately left unconfirmed — otherwise
// every real checkpoint on-chain ends up Confirmed (nothing left pending), which doesn't
// read as a live, honest "awaiting sign-off" state. Campaign 2 already has its one
// (never-confirmed) checkpoint; campaign 6 is the completion-NFT demo and needs every
// donation released, so it's excluded here too. Stage names match
// frontend/js/mapSeedData.js's CHECKPOINT_WAYPOINTS index 3 for each campaign.
const PENDING_CHECKPOINT = {
  0: { stageName: "flood-displaced households, Pengkalan Chepa -> follow-up relief supplies, Wakaf Bharu", donationId: 1 },
  1: { stageName: "weekly delivery, rural primary schools -> term restock, Ranau district schools", donationId: 1 },
  3: { stageName: "emergency welfare case, Subang Jaya -> emergency food parcel distribution, Kepong", donationId: 1 },
  4: { stageName: "household aid delivery, Kg Mesilou -> highland school supplies delivery, Kundasang", donationId: 1 },
  5: { stageName: "home therapy visit, Rembau district -> assistive equipment delivery, Pekan Rembau", donationId: 1 },
  7: { stageName: "elderly home-visit outreach, Bukit Mertajam -> mobile clinic visit, Bukit Mertajam", donationId: 1 },
};

const CAMPAIGNS = [
  { name: "Urgent Flood Relief - Kelantan", description: "Emergency supplies for flood-displaced families.", category: 0 },
  { name: "Ongoing School Meals - Sabah", description: "Weekly meal program for rural primary schools.", category: 1 },
  { name: "Long-term Reef Restoration - Semporna", description: "Multi-year coral reef rebuilding with local fishers.", category: 2 },
  { name: "Cahaya Damai Family Shelter", description: "Shelter, food, and welfare support for single-parent families and at-risk children in Sungai Buloh, Selangor.", category: 1 },
  { name: "Harapan Highlands Community Fund", description: "Community welfare and advocacy support for highland indigenous communities in Kundasang, Sabah.", category: 1 },
  { name: "Sinar Setia Rehabilitation Centre", description: "Rehabilitation and daily-living support for persons with disabilities (OKU) in Pekan Rembau, Negeri Sembilan.", category: 1 },
  { name: "Kasih Ceria Children's Home", description: "Residential care and education for orphaned and underprivileged children in Setapak, Kuala Lumpur.", category: 1 },
  { name: "Nadi Sihat Community Health Outreach", description: "Healthcare, elder care, and family support programs across Penang's mainland communities.", category: 2 },
];

async function fundIfLow(deployer, wallet, fundAmount, floor) {
  const balance = await ethers.provider.getBalance(wallet.address);
  if (balance >= floor) return;
  const tx = await deployer.sendTransaction({ to: wallet.address, value: fundAmount });
  await tx.wait();
}

async function main() {
  if (!process.env.DEMO_ORGANIZER_PRIVATE_KEY || !process.env.DEMO_CONFIRMER_PRIVATE_KEY) {
    throw new Error("Set DEMO_ORGANIZER_PRIVATE_KEY and DEMO_CONFIRMER_PRIVATE_KEY in .env first.");
  }

  const [deployer] = await hre.ethers.getSigners();
  const deploymentPath = path.join(__dirname, "..", "frontend", "js", "contractDeployment.json");
  const deployment = require(deploymentPath);
  const contract = new ethers.Contract(deployment.address, deployment.abi, deployer);

  // Fix a pre-existing null-fromBlock bug: chainData.js's donation/release event queries pass
  // deploymentBlockNumber as queryFilter's fromBlock, and null is not guaranteed to mean
  // "genesis" on every RPC. Patch it here so it can't be forgotten before real donations exist.
  if (deployment.deploymentBlockNumber === null || deployment.deploymentBlockNumber === undefined) {
    const currentBlock = await ethers.provider.getBlockNumber();
    deployment.deploymentBlockNumber = Math.max(currentBlock - 5, 0);
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log("patched deploymentBlockNumber ->", deployment.deploymentBlockNumber);
  }

  const organizer = new ethers.Wallet(process.env.DEMO_ORGANIZER_PRIVATE_KEY, ethers.provider);
  const confirmer = new ethers.Wallet(process.env.DEMO_CONFIRMER_PRIVATE_KEY, ethers.provider);
  await fundIfLow(deployer, organizer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
  await fundIfLow(deployer, confirmer, ROLE_FUND_AMOUNT, ROLE_FLOOR);

  const confirmerInfo = await contract.platformConfirmers(confirmer.address);
  if (!confirmerInfo.isAllowed) {
    const tx = await contract.addPlatformConfirmer(confirmer.address, "CradleChain Demo Confirmer", {
      value: CONFIRMER_STAKE,
    });
    await tx.wait();
    console.log("allowlisted confirmer", confirmer.address);
  } else {
    console.log("confirmer already allowlisted, skipping addPlatformConfirmer");
  }

  // Funding (fundIfLow) happens per-donation below, only once we know that donation is actually
  // about to be sent — a resume where all donations already exist on-chain should fund nothing.
  const donorA = ethers.Wallet.createRandom().connect(ethers.provider);
  const donorB = ethers.Wallet.createRandom().connect(ethers.provider);

  // Idempotent/resumable: campaign ids are sequential from 0, so nextCampaignId() tells us how
  // many of CAMPAIGNS already exist on-chain from a prior (possibly interrupted) run. Existing
  // campaigns are reused as-is (never recreated); only the missing per-campaign steps run.
  const existingCount = Number(await contract.nextCampaignId());
  const campaignIds = [];

  for (let i = 0; i < CAMPAIGNS.length; i++) {
    const c = CAMPAIGNS[i];
    let campaignId;

    // Re-fund the organizer before its transactions this iteration (createCampaign,
    // registerConfirmer, logCheckpoint) in case earlier campaigns in this same run drained it
    // below floor — mirrors the confirmer re-fund below, needed now that 8 campaigns means up to
    // ~24 organizer txs per run instead of ~9.
    await fundIfLow(deployer, organizer, ROLE_FUND_AMOUNT, ROLE_FLOOR);

    if (i < existingCount) {
      const onChain = await contract.campaigns(i);
      if (!onChain.exists || onChain.name !== c.name) {
        throw new Error(
          `campaign ${i} on-chain does not match expected seed data (got name "${onChain.name}", expected "${c.name}"). ` +
            `Refusing to continue automatically — inspect chain state by hand.`
        );
      }
      campaignId = i;
      console.log("campaign", campaignId, c.name, "already exists on-chain, reusing");
    } else {
      const vendorWallet = ethers.Wallet.createRandom();
      const tx = await contract.connect(organizer).createCampaign(c.name, c.description, vendorWallet.address, c.category);
      await tx.wait();
      campaignId = i;
      console.log("created campaign", campaignId, c.name);
    }
    campaignIds.push(campaignId);

    const isRegistered = await contract.confirmerRegistered(campaignId);
    if (!isRegistered) {
      const tx = await contract.connect(organizer).registerConfirmer(campaignId, confirmer.address);
      await tx.wait();
      console.log("campaign", campaignId, "confirmer registered");
    } else {
      console.log("campaign", campaignId, "confirmer already registered, skipping");
    }

    const donation0 = await existsAt(contract, "campaignDonations", campaignId, 0);
    if (!donation0) {
      await fundIfLow(deployer, donorA, DONOR_FUND_AMOUNT, DONOR_FLOOR);
      const tx = await contract
        .connect(donorA)
        .donate(campaignId, { value: ethers.parseEther(DONATION_AMOUNTS[campaignId % DONATION_AMOUNTS.length]) });
      await tx.wait();
      console.log("campaign", campaignId, "donation A recorded");
    } else {
      console.log("campaign", campaignId, "donation A already exists, skipping");
    }

    const donation1 = await existsAt(contract, "campaignDonations", campaignId, 1);
    if (!donation1) {
      await fundIfLow(deployer, donorB, DONOR_FUND_AMOUNT, DONOR_FLOOR);
      const tx = await contract
        .connect(donorB)
        .donate(campaignId, { value: ethers.parseEther(DONATION_AMOUNTS[(campaignId + 1) % DONATION_AMOUNTS.length]) });
      await tx.wait();
      console.log("campaign", campaignId, "donation B recorded");
    } else {
      console.log("campaign", campaignId, "donation B already exists, skipping");
    }

    // getCampaignHistory() returns the full checkpoints array — reading it never reverts
    // regardless of length, so it tells us whether checkpoint 0 exists without probing an
    // index. Once existence is established (just created, or already present), reading index 0
    // directly below is safe: there is no out-of-bounds risk left to guard against.
    const checkpointHistory = await contract.getCampaignHistory(campaignId);
    if (checkpointHistory.length === 0) {
      // checkpoint 0 is auto-confirmed a few lines below, before any live viewer sees it, so
      // this placeholder never needs to resolve to a real photo on IPFS — it only has to
      // satisfy the contract's non-empty check (CradleChain.sol:139). A real photo is only
      // needed for a checkpoint left Pending for the live AI-evidence-check demo beat, seeded
      // separately (see docs/demo-script.md Beat 0).
      const tx = await contract
        .connect(organizer)
        .logCheckpoint(campaignId, 0, "campaign wallet -> vendor", "QmSeedCheckpointProofPlaceholder00000001");
      await tx.wait();
      console.log("campaign", campaignId, "checkpoint 0 logged");
    } else {
      console.log("campaign", campaignId, "checkpoint 0 already logged, skipping");
    }

    const checkpointAfterLog = await contract.campaignCheckpoints(campaignId, 0);
    if (checkpointAfterLog.status === CHECKPOINT_STATUS_PENDING) {
      // Re-fund the confirmer just before its next tx in case earlier campaigns in this same
      // run drained it below floor — Amoy gas prices can vary between txs within one run.
      await fundIfLow(deployer, confirmer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
      const tx = await contract.connect(confirmer).confirmCheckpoint(campaignId, 0);
      await tx.wait();
      console.log("campaign", campaignId, "checkpoint 0 confirmed");
    } else {
      console.log("campaign", campaignId, "checkpoint 0 already confirmed, skipping");
    }

    const extraCheckpoints = EXTRA_CHECKPOINTS[campaignId];
    if (extraCheckpoints) {
      for (let ci = 0; ci < extraCheckpoints.length; ci++) {
        const checkpointIndex = ci + 1; // checkpoint 0 already handled above
        const { stageName, donationId } = extraCheckpoints[ci];
        const historySoFar = await contract.getCampaignHistory(campaignId);
        if (historySoFar.length <= checkpointIndex) {
          await fundIfLow(deployer, organizer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
          const tx = await contract
            .connect(organizer)
            .logCheckpoint(
              campaignId,
              donationId,
              stageName,
              `QmSeedCheckpointProofPlaceholder${String(campaignId).padStart(2, "0")}${String(checkpointIndex).padStart(2, "0")}`
            );
          await tx.wait();
          console.log("campaign", campaignId, "checkpoint", checkpointIndex, "logged");
        } else {
          console.log("campaign", campaignId, "checkpoint", checkpointIndex, "already logged, skipping");
        }

        const checkpoint = await contract.campaignCheckpoints(campaignId, checkpointIndex);
        if (checkpoint.status === CHECKPOINT_STATUS_PENDING) {
          await fundIfLow(deployer, confirmer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
          const tx = await contract.connect(confirmer).confirmCheckpoint(campaignId, checkpointIndex);
          await tx.wait();
          console.log("campaign", campaignId, "checkpoint", checkpointIndex, "confirmed");
        } else {
          console.log("campaign", campaignId, "checkpoint", checkpointIndex, "already confirmed, skipping");
        }
      }
    }

    const pending = PENDING_CHECKPOINT[campaignId];
    if (pending) {
      const checkpointIndex = extraCheckpoints ? extraCheckpoints.length + 1 : 1;
      const historySoFar = await contract.getCampaignHistory(campaignId);
      if (historySoFar.length <= checkpointIndex) {
        await fundIfLow(deployer, organizer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
        const tx = await contract
          .connect(organizer)
          .logCheckpoint(
            campaignId,
            pending.donationId,
            pending.stageName,
            `QmSeedCheckpointProofPlaceholderPending${String(campaignId).padStart(2, "0")}`
          );
        await tx.wait();
        console.log("campaign", campaignId, "checkpoint", checkpointIndex, "logged (left unconfirmed on purpose)");
      } else {
        console.log("campaign", campaignId, "checkpoint", checkpointIndex, "already logged, skipping");
      }
    }
  }

  // mintCompletionNFT requires EVERY donation released, not just every checkpoint confirmed
  // (CradleChain.sol:274-277) — but every campaign above only has a checkpoint tied to
  // donationId 0, so donation B (index 1) never releases and mint always reverts. Give campaign
  // 6 a second checkpoint tied to donation B and confirm it too, so it's mint-eligible — the
  // actual mintCompletionNFT call is left for the live demo beat, not fired here.
  const COMPLETION_DEMO_CAMPAIGN_ID = 6;
  await fundIfLow(deployer, organizer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
  const completionHistory = await contract.getCampaignHistory(COMPLETION_DEMO_CAMPAIGN_ID);
  if (completionHistory.length < 2) {
    const tx = await contract
      .connect(organizer)
      .logCheckpoint(
        COMPLETION_DEMO_CAMPAIGN_ID,
        1,
        "vendor -> final beneficiary",
        "QmSeedCheckpointProofPlaceholder00000002"
      );
    await tx.wait();
    console.log("campaign", COMPLETION_DEMO_CAMPAIGN_ID, "checkpoint 1 logged (completion setup)");
  } else {
    console.log("campaign", COMPLETION_DEMO_CAMPAIGN_ID, "checkpoint 1 already logged, skipping");
  }

  const completionCheckpoint1 = await contract.campaignCheckpoints(COMPLETION_DEMO_CAMPAIGN_ID, 1);
  if (completionCheckpoint1.status === CHECKPOINT_STATUS_PENDING) {
    await fundIfLow(deployer, confirmer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
    const tx = await contract.connect(confirmer).confirmCheckpoint(COMPLETION_DEMO_CAMPAIGN_ID, 1);
    await tx.wait();
    console.log("campaign", COMPLETION_DEMO_CAMPAIGN_ID, "checkpoint 1 confirmed (completion setup)");
  } else {
    console.log("campaign", COMPLETION_DEMO_CAMPAIGN_ID, "checkpoint 1 already confirmed, skipping");
  }

  // Third real hop for campaign 6, on top of its existing completion-NFT setup checkpoint,
  // so it lands at 3 confirmed hops like the other non-stalled campaigns.
  await fundIfLow(deployer, organizer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
  const completionHistory2 = await contract.getCampaignHistory(COMPLETION_DEMO_CAMPAIGN_ID);
  if (completionHistory2.length < 3) {
    const tx = await contract
      .connect(organizer)
      .logCheckpoint(
        COMPLETION_DEMO_CAMPAIGN_ID,
        1,
        "final beneficiary -> school fees & supplies, Setapak",
        "QmSeedCheckpointProofPlaceholder0603"
      );
    await tx.wait();
    console.log("campaign", COMPLETION_DEMO_CAMPAIGN_ID, "checkpoint 2 logged (extra hop)");
  } else {
    console.log("campaign", COMPLETION_DEMO_CAMPAIGN_ID, "checkpoint 2 already logged, skipping");
  }

  const completionCheckpoint2 = await contract.campaignCheckpoints(COMPLETION_DEMO_CAMPAIGN_ID, 2);
  if (completionCheckpoint2.status === CHECKPOINT_STATUS_PENDING) {
    await fundIfLow(deployer, confirmer, ROLE_FUND_AMOUNT, ROLE_FLOOR);
    const tx = await contract.connect(confirmer).confirmCheckpoint(COMPLETION_DEMO_CAMPAIGN_ID, 2);
    await tx.wait();
    console.log("campaign", COMPLETION_DEMO_CAMPAIGN_ID, "checkpoint 2 confirmed (extra hop)");
  } else {
    console.log("campaign", COMPLETION_DEMO_CAMPAIGN_ID, "checkpoint 2 already confirmed, skipping");
  }

  const demoConfigPath = path.join(__dirname, "..", "frontend", "js", "demoConfig.js");
  fs.writeFileSync(
    demoConfigPath,
    `// Generated by scripts/seed.js — the real on-chain ids of the seeded demo campaigns.\n` +
      `export const DEMO_CAMPAIGN_IDS = ${JSON.stringify(campaignIds)};\n` +
      `export const COMPLETION_DEMO_CAMPAIGN_ID = ${COMPLETION_DEMO_CAMPAIGN_ID};\n`
  );
  console.log("Seed complete. Campaign IDs:", campaignIds);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

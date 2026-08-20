const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CradleChain", function () {
  let contract, organizer, donor;

  beforeEach(async function () {
    [organizer, donor] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    contract = await CradleChain.deploy();
  });

  it("deploys", async function () {
    expect(await contract.getAddress()).to.properAddress;
  });

  it("creates a campaign and returns an incrementing id", async function () {
    await expect(contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0))
      .to.not.be.reverted;
    const campaign = await contract.getCampaign(0);
    expect(campaign.name).to.equal("Flood Relief");
    expect(campaign.category).to.equal(0);
    expect(campaign.organizer).to.equal(organizer.address);
  });

  it("logs a donation and emits DonationTagged", async function () {
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0);
    await expect(contract.connect(donor).donate(0, { value: ethers.parseEther("0.01") }))
      .to.emit(contract, "DonationTagged")
      .withArgs(0, 0, donor.address, ethers.parseEther("0.01"), anyValue());
  });

  it("reverts donate() on a non-existent campaign", async function () {
    await expect(contract.connect(donor).donate(99, { value: 1 })).to.be.reverted;
  });

  it("keeps the donated ETH in the contract instead of forwarding it at donate time", async function () {
    const [, , targetWallet] = await ethers.getSigners();
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", targetWallet.address, 0);
    await expect(
      contract.connect(donor).donate(0, { value: ethers.parseEther("0.01") })
    ).to.changeEtherBalances(
      [donor, targetWallet, contract],
      [ethers.parseEther("-0.01"), 0, ethers.parseEther("0.01")]
    );
  });
});

describe("confirmer registration", function () {
  let contract, owner, organizer, confirmerA, randomWallet;
  const STAKE = ethers.parseEther("0.1");
  beforeEach(async function () {
    [owner, organizer, confirmerA, randomWallet] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    contract = await CradleChain.deploy();
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0);
  });
  it("owner can add a platform-verified confirmer with a stake", async function () {
    await expect(contract.connect(owner).addPlatformConfirmer(confirmerA.address, "Mercy Malaysia - verified NGO", { value: STAKE })).to.not.be.reverted;
    const list = await contract.getConfirmerList();
    expect(list).to.include(confirmerA.address);
  });
  it("rejects adding a confirmer below the minimum stake", async function () {
    await expect(contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: 1 })).to.be.reverted;
  });
  it("organizer can register an allowlisted confirmer for their campaign", async function () {
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: STAKE });
    await expect(contract.connect(organizer).registerConfirmer(0, confirmerA.address)).to.not.be.reverted;
    expect(await contract.campaignConfirmer(0)).to.equal(confirmerA.address);
  });
  it("reverts registering a non-allowlisted address as confirmer (demo beat 1)", async function () {
    await expect(
      contract.connect(organizer).registerConfirmer(0, randomWallet.address)
    ).to.be.revertedWith("confirmer not platform-verified");
  });
  it("reverts registering a confirmer twice for the same campaign", async function () {
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: STAKE });
    await contract.connect(organizer).registerConfirmer(0, confirmerA.address);
    await expect(contract.connect(organizer).registerConfirmer(0, confirmerA.address)).to.be.reverted;
  });
  it("reverts registering a confirmer after a donation has already been made", async function () {
    const [, , donor] = await ethers.getSigners();
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: STAKE });
    await contract.connect(donor).donate(0, { value: 1 });
    await expect(
      contract.connect(organizer).registerConfirmer(0, confirmerA.address)
    ).to.be.revertedWith("confirmer must be registered before first donation");
  });
});

describe("checkpoint chain of custody", function () {
  let contract, owner, organizer, confirmerA, randomWallet;
  const STAKE = ethers.parseEther("0.1");
  beforeEach(async function () {
    [owner, organizer, confirmerA, randomWallet] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    contract = await CradleChain.deploy();
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0);
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: STAKE });
    await contract.connect(organizer).registerConfirmer(0, confirmerA.address);
    await contract.connect(organizer).donate(0, { value: 1 });
  });
  it("organizer logs a checkpoint as pending and emits CheckpointLogged", async function () {
    await expect(contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "Qm123"))
      .to.emit(contract, "CheckpointLogged")
      .withArgs(0, 0, "campaign wallet -> vendor");
  });
  it("reverts logCheckpoint from a non-organizer", async function () {
    await expect(contract.connect(randomWallet).logCheckpoint(0, 0, "stage", "Qm123")).to.be.reverted;
  });
  it("reverts logCheckpoint with an empty ipfsProofHash", async function () {
    await expect(
      contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "")
    ).to.be.revertedWith("evidence proof required");
  });
  it("registered confirmer can confirm a pending checkpoint", async function () {
    await contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "Qm123");
    await expect(contract.connect(confirmerA).confirmCheckpoint(0, 0))
      .to.emit(contract, "CheckpointConfirmation")
      .withArgs(0, 0);
  });
  it("reverts confirmCheckpoint from an unregistered wallet (demo beat 3)", async function () {
    await contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "Qm123");
    await expect(
      contract.connect(randomWallet).confirmCheckpoint(0, 0)
    ).to.be.revertedWith("not the registered confirmer");
  });
});

describe("escrow-gated fund release", function () {
  let contract, owner, organizer, confirmerA, donor, targetWallet;
  const STAKE = ethers.parseEther("0.1");
  const DONATION = ethers.parseEther("0.01");
  beforeEach(async function () {
    [owner, organizer, confirmerA, donor, targetWallet] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    contract = await CradleChain.deploy();
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", targetWallet.address, 0);
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: STAKE });
    await contract.connect(organizer).registerConfirmer(0, confirmerA.address);
    await contract.connect(donor).donate(0, { value: DONATION });
    await contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "Qm123");
  });
  it("releases exactly that donation's ETH to targetWallet on confirmation", async function () {
    await expect(
      contract.connect(confirmerA).confirmCheckpoint(0, 0)
    ).to.changeEtherBalances([contract, targetWallet], [DONATION * -1n, DONATION]);
  });
  it("emits FundsReleased on confirmation", async function () {
    await expect(contract.connect(confirmerA).confirmCheckpoint(0, 0))
      .to.emit(contract, "FundsReleased")
      .withArgs(0, 0, DONATION);
  });
  it("confirming a second checkpoint on an already-released donation succeeds without a double transfer", async function () {
    await contract.connect(confirmerA).confirmCheckpoint(0, 0);
    await contract.connect(organizer).logCheckpoint(0, 0, "vendor -> proof of delivery", "Qm456");
    await expect(
      contract.connect(confirmerA).confirmCheckpoint(0, 1)
    ).to.changeEtherBalances([contract, targetWallet], [0n, 0n]);
    const checkpoint = await contract.campaignCheckpoints(0, 1);
    expect(checkpoint.status).to.equal(1n);
  });
  it("leaves the donation stuck in the contract if the checkpoint is never confirmed", async function () {
    const contractAddress = await contract.getAddress();
    expect(await ethers.provider.getBalance(contractAddress)).to.equal(STAKE + DONATION);
  });
});

describe("confirmer revocation and slashing", function () {
  let contract, owner, organizer, confirmerA, confirmerB;
  const STAKE = ethers.parseEther("0.1");
  beforeEach(async function () {
    [owner, organizer, confirmerA, confirmerB] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    contract = await CradleChain.deploy();
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0);
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "labelA", { value: STAKE });
    await contract.connect(owner).addPlatformConfirmer(confirmerB.address, "labelB", { value: STAKE });
    await contract.connect(organizer).registerConfirmer(0, confirmerA.address);
  });
  it("owner schedules a revocation with a future revokeAt", async function () {
    const tx = await contract.connect(owner).revokeConfirmer(0, confirmerB.address);
    await expect(tx).to.emit(contract, "ConfirmerRevocationScheduled");
    const pending = await contract.pendingRevocations(0);
    expect(pending.newConfirmer).to.equal(confirmerB.address);
    expect(pending.active).to.equal(true);
  });
  it("reverts finalizeRevocation before the cooldown elapses", async function () {
    await contract.connect(owner).revokeConfirmer(0, confirmerB.address);
    await expect(contract.finalizeRevocation(0)).to.be.reverted;
  });
  it("finalizes the swap after the cooldown elapses, callable by anyone", async function () {
    await contract.connect(owner).revokeConfirmer(0, confirmerB.address);
    await ethers.provider.send("evm_increaseTime", [3 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await expect(contract.connect(confirmerA).finalizeRevocation(0))
      .to.emit(contract, "ConfirmerRevocationFinalized")
      .withArgs(0, confirmerB.address);
    expect(await contract.campaignConfirmer(0)).to.equal(confirmerB.address);
  });
  it("owner can slash a confirmer, zeroing their stake and allowlist status", async function () {
    await contract.connect(owner).slashConfirmer(confirmerA.address);
    const info = await contract.platformConfirmers(confirmerA.address);
    expect(info.isAllowed).to.equal(false);
    expect(info.stake).to.equal(0);
  });
  it("reverts confirmCheckpoint from a confirmer who has since been slashed", async function () {
    await contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "Qm123");
    await contract.connect(owner).slashConfirmer(confirmerA.address);
    await expect(contract.connect(confirmerA).confirmCheckpoint(0, 0))
      .to.be.revertedWith("confirmer no longer platform-verified");
  });
});
describe("getCampaignHistory and full round trip", function () {
  it("returns the full checkpoint chain with correct pending/confirmed status", async function () {
    const [owner, organizer, donorX, confirmerA] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    const contract = await CradleChain.deploy();
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0);
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: ethers.parseEther("0.1") });
    await contract.connect(organizer).registerConfirmer(0, confirmerA.address);
    await contract.connect(donorX).donate(0, { value: ethers.parseEther("0.01") });
    await contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "Qm111");
    await contract.connect(organizer).logCheckpoint(0, 0, "vendor -> proof of delivery", "Qm222");
    await contract.connect(confirmerA).confirmCheckpoint(0, 0);
    const history = await contract.getCampaignHistory(0);
    expect(history.length).to.equal(2);
    expect(history[0].status).to.equal(1); // Confirmed
    expect(history[1].status).to.equal(0); // Pending
  });

  it("supports a second, independent concurrent campaign", async function () {
    const [owner, organizer, donorX] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    const contract = await CradleChain.deploy();

    await contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0);
    await contract.connect(organizer).createCampaign("School Supplies", "desc2", organizer.address, 1);
    await contract.connect(donorX).donate(0, { value: 1 });
    await contract.connect(donorX).donate(1, { value: 1 });

    const historyA = await contract.getCampaignHistory(0);
    const historyB = await contract.getCampaignHistory(1);
    expect(historyA.length).to.equal(0);
    expect(historyB.length).to.equal(0);
    const campaignB = await contract.getCampaign(1);
    expect(campaignB.name).to.equal("School Supplies");
  });
});
describe("getConfirmerScore", function () {
  it("counts confirmed/total checkpoints for a confirmer across multiple campaigns", async function () {
    const [owner, organizer, donorX, confirmerA] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    const contract = await CradleChain.deploy();

    await contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0);
    await contract.connect(organizer).createCampaign("School Supplies", "desc2", organizer.address, 1);
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: ethers.parseEther("0.1") });
    await contract.connect(organizer).registerConfirmer(0, confirmerA.address);
    await contract.connect(organizer).registerConfirmer(1, confirmerA.address);

    await contract.connect(donorX).donate(0, { value: 1 });
    await contract.connect(donorX).donate(1, { value: 1 });

    // campaign 0: two checkpoints, one confirmed
    await contract.connect(organizer).logCheckpoint(0, 0, "stage1", "Qm1");
    await contract.connect(organizer).logCheckpoint(0, 0, "stage2", "Qm2");
    await contract.connect(confirmerA).confirmCheckpoint(0, 0);

    // campaign 1: one checkpoint, unconfirmed
    await contract.connect(organizer).logCheckpoint(1, 0, "stage1", "Qm3");

    const [confirmed, total] = await contract.getConfirmerScore(confirmerA.address, [0, 1]);
    expect(confirmed).to.equal(1);
    expect(total).to.equal(3);
  });
});

describe("completion NFT", function () {
  let contract, owner, organizer, confirmerA, donor, targetWallet;
  const STAKE = ethers.parseEther("0.1");
  const DONATION = ethers.parseEther("0.01");
  beforeEach(async function () {
    [owner, organizer, confirmerA, donor, targetWallet] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    contract = await CradleChain.deploy();
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", targetWallet.address, 0);
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "label", { value: STAKE });
    await contract.connect(organizer).registerConfirmer(0, confirmerA.address);
    await contract.connect(donor).donate(0, { value: DONATION });
    await contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "Qm123");
  });
  it("reverts mintCompletionNFT before the checkpoint is confirmed", async function () {
    await expect(contract.mintCompletionNFT(0)).to.be.revertedWith("not all checkpoints confirmed");
  });
  it("mints a completion NFT to the organizer once all checkpoints are confirmed and donations released", async function () {
    await contract.connect(confirmerA).confirmCheckpoint(0, 0);
    await expect(contract.mintCompletionNFT(0))
      .to.emit(contract, "CompletionNFTMinted")
      .withArgs(0, organizer.address, 0);
    expect(await contract.ownerOf(0)).to.equal(organizer.address);
    expect(await contract.completionMinted(0)).to.equal(true);
  });
  it("reverts a second mint for the same campaign", async function () {
    await contract.connect(confirmerA).confirmCheckpoint(0, 0);
    await contract.mintCompletionNFT(0);
    await expect(contract.mintCompletionNFT(0)).to.be.revertedWith("completion NFT already minted");
  });
  it("reverts mintCompletionNFT on a campaign with no checkpoints logged", async function () {
    await contract.connect(organizer).createCampaign("No Checkpoints Yet", "desc", targetWallet.address, 0);
    await expect(contract.mintCompletionNFT(1)).to.be.revertedWith("no checkpoints logged");
  });
});

describe("flagOverdue", function () {
  let contract, owner, organizer, confirmerA, confirmerB, donor;
  const STAKE = ethers.parseEther("0.1");
  beforeEach(async function () {
    [owner, organizer, confirmerA, confirmerB, donor] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    contract = await CradleChain.deploy();
    await contract.connect(organizer).createCampaign("Flood Relief", "desc", organizer.address, 0); // category 0 = Urgent, 3-day threshold
    await contract.connect(owner).addPlatformConfirmer(confirmerA.address, "labelA", { value: STAKE });
    await contract.connect(owner).addPlatformConfirmer(confirmerB.address, "labelB", { value: STAKE });
    await contract.connect(organizer).registerConfirmer(0, confirmerA.address);
    await contract.connect(donor).donate(0, { value: 1 });
    await contract.connect(organizer).logCheckpoint(0, 0, "campaign wallet -> vendor", "Qm123");
  });
  it("isOverdue is false before the category threshold elapses", async function () {
    expect(await contract.isOverdue(0)).to.equal(false);
  });
  it("reverts flagOverdue before the checkpoint is actually overdue", async function () {
    await expect(contract.flagOverdue(0, confirmerB.address)).to.be.revertedWith("checkpoint not overdue");
  });
  it("isOverdue is true once the Urgent (3-day) threshold elapses on a pending checkpoint", async function () {
    await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    expect(await contract.isOverdue(0)).to.equal(true);
  });
  it("anyone can call flagOverdue once overdue, scheduling the same cooldown as revokeConfirmer", async function () {
    await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await expect(contract.connect(donor).flagOverdue(0, confirmerB.address))
      .to.emit(contract, "ConfirmerRevocationScheduled");
    const pending = await contract.pendingRevocations(0);
    expect(pending.newConfirmer).to.equal(confirmerB.address);
    expect(pending.active).to.equal(true);
  });
  it("reverts flagOverdue with a non-allowlisted replacement", async function () {
    const [, , , , , randomWallet] = await ethers.getSigners();
    await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await expect(contract.flagOverdue(0, randomWallet.address)).to.be.revertedWith("replacement not platform-verified");
  });
  it("finalizeRevocation completes a flagOverdue-triggered swap after the cooldown", async function () {
    await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await contract.flagOverdue(0, confirmerB.address);
    await ethers.provider.send("evm_increaseTime", [3 * 60 + 1]);
    await ethers.provider.send("evm_mine");
    await expect(contract.finalizeRevocation(0))
      .to.emit(contract, "ConfirmerRevocationFinalized")
      .withArgs(0, confirmerB.address);
    expect(await contract.campaignConfirmer(0)).to.equal(confirmerB.address);
  });
});

describe("NGO onboarding request flow", function () {
  let contract, owner, ngo;
  beforeEach(async function () {
    [owner, ngo] = await ethers.getSigners();
    const CradleChain = await ethers.getContractFactory("CradleChain");
    contract = await CradleChain.deploy();
  });
  it("submits a confirmer request and emits ConfirmerRequested", async function () {
    await expect(contract.connect(ngo).requestConfirmerStatus("Mercy Malaysia", "JPPM-123"))
      .to.emit(contract, "ConfirmerRequested")
      .withArgs(ngo.address, "Mercy Malaysia", "JPPM-123");
    const list = await contract.getConfirmerRequestList();
    expect(list).to.include(ngo.address);
  });
  it("reverts a second request while one is already pending", async function () {
    await contract.connect(ngo).requestConfirmerStatus("Mercy Malaysia", "JPPM-123");
    await expect(
      contract.connect(ngo).requestConfirmerStatus("Mercy Malaysia", "JPPM-123")
    ).to.be.revertedWith("request already pending");
  });
  it("clears the pending request once addPlatformConfirmer approves it", async function () {
    await contract.connect(ngo).requestConfirmerStatus("Mercy Malaysia", "JPPM-123");
    await contract.connect(owner).addPlatformConfirmer(ngo.address, "Mercy Malaysia", { value: ethers.parseEther("0.1") });
    const request = await contract.confirmerRequests(ngo.address);
    expect(request.exists).to.equal(false);
    await expect(contract.connect(ngo).requestConfirmerStatus("Mercy Malaysia", "JPPM-123")).to.not.be.reverted;
  });
  it("does not duplicate an address in the request list after re-requesting post-approval", async function () {
    await contract.connect(ngo).requestConfirmerStatus("Mercy Malaysia", "JPPM-123");
    await contract.connect(owner).addPlatformConfirmer(ngo.address, "Mercy Malaysia", { value: ethers.parseEther("0.1") });
    await contract.connect(ngo).requestConfirmerStatus("Mercy Malaysia", "JPPM-123");
    const list = await contract.getConfirmerRequestList();
    const occurrences = list.filter((addr) => addr.toLowerCase() === ngo.address.toLowerCase());
    expect(occurrences.length).to.equal(1);
  });
});

function anyValue() {
  return (x) => typeof x === "bigint";
}

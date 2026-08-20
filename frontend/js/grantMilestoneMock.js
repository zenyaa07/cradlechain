const LABEL_MAP = {
  Campaign: "Grant",
  CreateCampaign: "Create Grant",
  Donate: "Fund",
  Confirmer: "Milestone Reviewer",
  Checkpoint: "Milestone",
  DonationAmount: "Funding Amount",
  ActiveCampaigns: "Active Grants",
  ConfirmersStat: "Milestone Reviewers",
  HeroHeadline: "Every grant climbs its own ladder.",
  HeroSubtitle:
    "CradleChain tags each disbursement on-chain the moment it’s committed, and shows every milestone gate it passes through until it reaches its destination.",
};

export function toggleGrantMilestoneMode(enabled) {
  document.body.classList.toggle("grant-mode", enabled);
  document.querySelectorAll("[data-relabel]").forEach((el) => {
    const key = el.dataset.relabel;
    const isPlaceholder = "placeholder" in el;
    if (!el.dataset.originalLabel) el.dataset.originalLabel = isPlaceholder ? el.placeholder : el.textContent;
    const value = enabled ? LABEL_MAP[key] || el.dataset.originalLabel : el.dataset.originalLabel;
    if (isPlaceholder) el.placeholder = value;
    else el.textContent = value;
  });
}

// The contract escrows every donation at donate() time and only forwards it to targetWallet
// inside confirmCheckpoint() (contracts/CradleChain.sol:159-165) — so "in escrow" here is
// exactly "deposited minus released", not a separate on-chain concept to compute.
let currentAddress = null;

document.addEventListener("cradlechain:connected", (event) => {
  currentAddress = event.detail?.address || null;
});
window.addEventListener("cradlechain:backend-session", (event) => {
  currentAddress = event.detail?.address || null;
});

export function computeDonorLedger(snapshot, donorAddress) {
  const lower = donorAddress.toLowerCase();
  const donorDonations = snapshot.donations.filter((d) => d.donor.toLowerCase() === lower);
  const releasedKeys = new Set(snapshot.releases.map((r) => `${r.campaignId}-${r.donationId}`));

  let deposited = 0;
  let released = 0;
  donorDonations.forEach((d) => {
    const amount = Number(ethers.formatEther(d.amount));
    deposited += amount;
    if (releasedKeys.has(`${d.campaignId}-${d.donationId}`)) released += amount;
  });

  return { deposited, released, escrowed: deposited - released, donationCount: donorDonations.length };
}

export async function renderDonorLedger(snapshot) {
  const mount = document.getElementById("donor-ledger");
  if (!mount) return;

  if (!currentAddress) {
    mount.hidden = true;
    mount.innerHTML = "";
    return;
  }

  const ledger = computeDonorLedger(snapshot, currentAddress);
  if (ledger.donationCount === 0) {
    mount.hidden = true;
    mount.innerHTML = "";
    return;
  }

  mount.hidden = false;
  mount.innerHTML = `
    <h3>Your contributions</h3>
    <div class="donor-ledger-row">
      <div class="donor-ledger-stat">
        <span class="donor-ledger-figure">${ledger.deposited.toFixed(3)}</span>
        <span class="text-secondary">Deposited (MATIC)</span>
      </div>
      <div class="donor-ledger-stat">
        <span class="donor-ledger-figure">${ledger.escrowed.toFixed(3)}</span>
        <span class="text-secondary">In escrow</span>
      </div>
      <div class="donor-ledger-stat">
        <span class="donor-ledger-figure">${ledger.released.toFixed(3)}</span>
        <span class="text-secondary">Released</span>
      </div>
    </div>
  `;
}

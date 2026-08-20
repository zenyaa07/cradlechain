import { getProvider } from "./wallet.js";

const NEAR_ZERO = ethers.parseEther("0.001");

export function initGasDrip() {
  document.addEventListener("cradlechain:connected", handleConnected);
}

async function handleConnected(event) {
  const { address } = event.detail;
  try {
    const balance = await getProvider().getBalance(address);
    if (balance >= NEAR_ZERO) return;

    const response = await fetch("/api/relay-gas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!response.ok) return;

    const status = document.getElementById("gas-drip-status");
    if (status) {
      status.textContent = "Sent you a small amount of test-MATIC to get started";
      status.hidden = false;
    }
  } catch (error) {
    // best-effort UX nicety only; never block wallet connect on a drip failure
  }
}

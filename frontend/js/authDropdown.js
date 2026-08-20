// Open/close + tab switching for the topbar auth dropdown, and keeping its pill label in
// sync with whichever session is active (backend email/password, or a connected wallet).
// backendAuth.js and wallet.js own the actual sign-in logic; this only owns the chrome.
function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function initAuthDropdown() {
  const dropdown = document.getElementById("auth-dropdown");
  const pill = document.getElementById("auth-pill");
  const dot = document.getElementById("auth-pill-dot");
  const label = document.getElementById("auth-pill-label");
  const panel = document.getElementById("auth-panel");
  const tabs = dropdown.querySelectorAll(".auth-tab");
  const tabPanels = dropdown.querySelectorAll(".auth-tab-panel");

  let walletConnected = false;
  let backendAddress = null;

  pill.addEventListener("click", (event) => {
    event.stopPropagation();
    panel.hidden = !panel.hidden;
  });
  document.addEventListener("click", (event) => {
    if (!dropdown.contains(event.target)) panel.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") panel.hidden = true;
  });

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("auth-tab-active", t === tab));
      tabPanels.forEach((p) => {
        p.hidden = p.dataset.tabPanel !== tab.dataset.tab;
      });
    });
  });

  function updatePill() {
    const active = backendAddress || walletConnected;
    dot.classList.toggle("auth-pill-dot-active", active);
    label.textContent = backendAddress ? shortAddress(backendAddress) : walletConnected ? "Wallet connected" : "Sign in";
  }

  window.addEventListener("cradlechain:backend-session", (event) => {
    backendAddress = event.detail ? event.detail.address : null;
    updatePill();
  });
  document.addEventListener("cradlechain:connected", () => {
    walletConnected = true;
    updatePill();
  });
}

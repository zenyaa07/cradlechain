import { CONTRACT_ADDRESS, CONTRACT_ABI, AMOY_CHAIN_ID, AMOY_RPC_URLS } from "./contractConfig.js";
import { API_BASE } from "./backendAuth.js";

let provider, signer, readProvider;

// Marks that the user explicitly disconnected — the only thing that stops tryRestoreWallet()
// from silently reconnecting on the next page load. MetaMask has no real programmatic
// "disconnect" (the site stays permitted in the extension itself until the user removes it
// there); this flag is what makes the app itself respect a disconnect across a refresh.
const DISCONNECT_FLAG = "cradlechain-wallet-disconnected";

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function getProvider() {
  if (!window.ethereum) {
    document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "no-metamask" } }));
    throw new Error("no-metamask");
  }
  if (!provider) provider = new ethers.BrowserProvider(window.ethereum);
  return provider;
}

// Campaign/network reads always go through our own RPC (AMOY_RPC_URL), never through
// window.ethereum — MetaMask's configured Amoy endpoint is whatever the user happened to add
// it with (often a pruned/rate-limited public node) and reads like chainData.js's eth_getLogs
// scan need an endpoint we've actually verified keeps full history. This also means reads work
// for backend-session (custodial) donors who never install MetaMask.
//
// batchMaxCount is deliberately 1 (no batching): drpc.org's free plan hard-rejects any JSON-RPC
// batch over 3 requests ("Batch of more than 3 requests are not allowed on free plan") and
// returns that as an opaque 500 — which is what was actually causing this app's reads to fail,
// not the request volume itself. One call per HTTP request costs a bit of latency but sidesteps
// the cap entirely; both free endpoints in AMOY_RPC_URLS still turned out flaky even for single
// unbatched calls (verified directly), which is why chainData.js retries across them too.
//
// ethers.FallbackProvider was tried here first, but it only escalates to the next provider on
// a stall (timeout) — a fast HTTP 500 from drpc.org counts as a completed (if failed) attempt,
// so it never actually reached the second endpoint. chainData.js does the real per-call retry
// across AMOY_RPC_URLS for the heavy eth_getLogs reads instead; this stays a single provider for
// the app's lighter, one-off reads (confirmers panel, campaign list, etc).
function getReadProvider() {
  if (!readProvider) {
    readProvider = new ethers.JsonRpcProvider(AMOY_RPC_URLS[0], undefined, {
      batchMaxCount: 1,
    });
  }
  return readProvider;
}

// Shared by the initial connect and by the accountsChanged listener below — both end with
// the same signer refresh, status text, and refresh event, just triggered differently.
async function applyActiveAccount(address) {
  signer = await getProvider().getSigner();
  localStorage.removeItem(DISCONNECT_FLAG);
  // Short address, never the full 42-char string — a signed-up donor's chosen name
  // (or anonymous placeholder) replaces this once /api/donor-labels/ resolves.
  document.getElementById("wallet-status").textContent = shortAddress(address);
  fetch(`${API_BASE}/donor-labels/?addresses=${address}`)
    .then((r) => (r.ok ? r.json() : {}))
    .then((labels) => {
      const label = labels[address];
      if (label) document.getElementById("wallet-status").textContent = `${label} · ${shortAddress(address)}`;
    })
    .catch(() => {});
  document.dispatchEvent(new CustomEvent("cradlechain:connected", { detail: { address } }));
}

// Shared by connectWallet() and tryRestoreWallet() — both need MetaMask account switches to
// keep the app in sync without a re-click, so both attach this the same way.
function attachAccountsChangedListener() {
  if (window.ethereum.__cradlechainAccountsListenerAttached) return;
  window.ethereum.__cradlechainAccountsListenerAttached = true;
  window.ethereum.on("accountsChanged", (newAccounts) => {
    if (newAccounts.length === 0) {
      signer = undefined;
      document.getElementById("wallet-status").textContent = "not connected";
      return;
    }
    applyActiveAccount(newAccounts[0]);
  });
}

// Called once on page load. eth_accounts (unlike eth_requestAccounts) never prompts — it just
// returns whatever accounts this site is already permitted to see, so this silently restores
// the session after a refresh instead of making the demo re-click Connect and re-approve every
// time. Skips entirely if the user explicitly disconnected last time (DISCONNECT_FLAG) or never
// connected in the first place (empty accounts).
export async function tryRestoreWallet() {
  if (!window.ethereum || localStorage.getItem(DISCONNECT_FLAG) === "true") return null;
  const accounts = await window.ethereum.request({ method: "eth_accounts" });
  if (accounts.length === 0) return null;
  await applyActiveAccount(accounts[0]);
  attachAccountsChangedListener();
  return { address: accounts[0] };
}

// App-level disconnect only — MetaMask itself still shows this site as permitted until the user
// removes it from the extension's own connected-sites list. This just makes CradleChain forget
// the session (clears the signer, stops tryRestoreWallet() from auto-reconnecting) so a refresh
// lands back on "not connected" instead of silently reconnecting.
export function disconnectWallet() {
  signer = undefined;
  localStorage.setItem(DISCONNECT_FLAG, "true");
  document.getElementById("wallet-status").textContent = "not connected";
  document.dispatchEvent(new CustomEvent("cradlechain:disconnected"));
}

export async function connectWallet() {
  if (!window.ethereum) {
    document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "no-metamask" } }));
    return null;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  let chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (chainId !== AMOY_CHAIN_ID) {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: AMOY_CHAIN_ID }],
    });
    chainId = AMOY_CHAIN_ID;
  }
  await applyActiveAccount(accounts[0]);

  // Once permission is granted, switching the active account in the MetaMask extension itself
  // (no re-click of Connect needed) fires this — lets a demo move between the organizer/confirmer/
  // admin wallets by only touching MetaMask, matching how the rest of this app already re-renders
  // off the cradlechain:connected event.
  attachAccountsChangedListener();

  return { address: accounts[0], chainId };
}

export function getSigner() {
  return signer;
}

export function getContract(signerOrProvider) {
  return new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signerOrProvider || getReadProvider());
}

// Amoy's current minimum priority fee is 25 gwei; MetaMask/Alchemy's suggested fee has been
// landing well under that (seen as low as 1.5 gwei — a stale estimate), which gets the raw
// transaction rejected outright before it's ever mined ("gas tip cap ..., minimum needed
// 25000000000"). Every write call spreads this into its overrides object instead of trusting
// the wallet's own fee suggestion. maxFeePerGas is set alongside it — otherwise ethers derives
// that from the same stale fee data and it can end up below maxPriorityFeePerGas, which ethers
// itself rejects before ever sending.
export function txOverrides(extra = {}) {
  return {
    maxPriorityFeePerGas: ethers.parseUnits("30", "gwei"),
    maxFeePerGas: ethers.parseUnits("100", "gwei"),
    ...extra,
  };
}

// Deliberately hardcoded, not fetched from anywhere real — this PoC demos the proof
// mechanism, not a real membership registry. The fixed sibling path matches the fixture
// used in zk/test/MembershipVerifier.test.js so this page and the contract test agree.
const FIXED_PATH_ELEMENTS = ["1", "1", "1", "1"];
const FIXED_PATH_INDICES = ["0", "0", "0", "0"];
const WASM_PATH = "../build/membership_js/membership.wasm";
const ZKEY_PATH = "../build/membership.zkey";

// Filled in after deploying zk/contracts/MembershipVerifier.sol to Amoy — this PoC is
// demoed against whatever network the deployment targets, kept separate from
// frontend/js/contractConfig.js (CradleChain's own deployment) on purpose.
const VERIFIER_ADDRESS = "0x0000000000000000000000000000000000000000";
const VERIFIER_ABI = [
  "function verifyProof(uint256[2] a, uint256[2][2] b, uint256[2] c, uint256[1] publicSignals) public view returns (bool)",
];

let lastProof = null;
let lastPublicSignals = null;

document.getElementById("zk-prove-btn").addEventListener("click", async () => {
  const output = document.getElementById("zk-output");
  const secret = document.getElementById("zk-secret").value.trim();
  if (!secret) {
    output.textContent = "Enter a secret first.";
    return;
  }
  output.textContent = "Generating proof in-browser (snarkjs.wasm)…";
  try {
    const input = { secret, pathElements: FIXED_PATH_ELEMENTS, pathIndices: FIXED_PATH_INDICES };
    const { proof, publicSignals } = await window.snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);
    lastProof = proof;
    lastPublicSignals = publicSignals;
    output.textContent = `Proof generated. Public signal (root): ${publicSignals[0]}\n\nYour secret never left the browser.`;
    document.getElementById("zk-verify-btn").disabled = false;
  } catch (error) {
    output.textContent = `Proof generation failed: ${error.message}`;
  }
});

document.getElementById("zk-verify-btn").addEventListener("click", async () => {
  const output = document.getElementById("zk-output");
  if (!lastProof) return;
  if (!window.ethereum) {
    output.textContent = "MetaMask not detected — connect a wallet to verify on-chain.";
    return;
  }
  try {
    const callData = await window.snarkjs.groth16.exportSolidityCallData(lastProof, lastPublicSignals);
    const [a, b, c, signals] = JSON.parse(`[${callData}]`);
    const provider = new ethers.BrowserProvider(window.ethereum);
    const contract = new ethers.Contract(VERIFIER_ADDRESS, VERIFIER_ABI, provider);
    const valid = await contract.verifyProof(a, b, c, signals);
    output.textContent += `\n\nOn-chain verification result: ${valid ? "VALID ✓" : "INVALID ✗"}`;
  } catch (error) {
    output.textContent += `\n\nOn-chain verification failed: ${error.message}`;
  }
});

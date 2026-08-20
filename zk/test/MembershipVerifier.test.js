const { expect } = require("chai");
const { ethers } = require("hardhat");
const snarkjs = require("snarkjs");
const path = require("path");

describe("MembershipVerifier (isolated ZK PoC)", function () {
  it("deploys independently of CradleChain", async function () {
    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    expect(await verifier.getAddress()).to.properAddress;
  });

  it("accepts a real proof generated against the compiled circuit", async function () {
    const wasmPath = path.join(__dirname, "..", "build", "membership_js", "membership.wasm");
    const zkeyPath = path.join(__dirname, "..", "build", "membership.zkey");

    // A depth-4 tree where every sibling is the same fixed value — enough to exercise a
    // real prove/verify round trip for this PoC without standing up a real registry.
    const input = {
      secret: "12345",
      pathElements: ["1", "1", "1", "1"],
      pathIndices: ["0", "0", "0", "0"],
    };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    const callData = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const [a, b, c, signals] = JSON.parse(`[${callData}]`);

    expect(await verifier.verifyProof(a, b, c, signals)).to.equal(true);
  });

  it("rejects a proof with a tampered public signal", async function () {
    const wasmPath = path.join(__dirname, "..", "build", "membership_js", "membership.wasm");
    const zkeyPath = path.join(__dirname, "..", "build", "membership.zkey");
    const input = { secret: "12345", pathElements: ["1", "1", "1", "1"], pathIndices: ["0", "0", "0", "0"] };
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath);

    const Verifier = await ethers.getContractFactory("Groth16Verifier");
    const verifier = await Verifier.deploy();
    const callData = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);
    const [a, b, c, signals] = JSON.parse(`[${callData}]`);
    signals[0] = "999999999999999999999999999999";

    expect(await verifier.verifyProof(a, b, c, signals)).to.equal(false);
  });
});

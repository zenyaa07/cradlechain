const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
async function main() {
  const CradleChain = await hre.ethers.getContractFactory("CradleChain");
  const contract = await CradleChain.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const deploymentBlockNumber = contract.deploymentTransaction().blockNumber;
  const artifact = await hre.artifacts.readArtifact("CradleChain");
  const out = {
    address,
    abi: artifact.abi,
    network: hre.network.name,
    deployedAt: new Date().toISOString(),
    deploymentBlockNumber,
  };
  const outDir = path.join(__dirname, "..", "frontend", "js");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "contractDeployment.json"), JSON.stringify(out, null, 2));
  console.log("Deployed CradleChain to", address);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } = require("hardhat/builtin-tasks/task-names");
const glob = require("glob");
const path = require("path");

// zk/contracts/MembershipVerifier.sol lives outside the default `contracts/` source
// dir on purpose (isolated PoC, never imported by CradleChain.sol) — this just adds
// it to the compile set without touching CradleChain's source root.
subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS, async (_, hre, runSuper) => {
  const paths = await runSuper();
  const zkGlob = path.join(hre.config.paths.root, "zk", "contracts", "**", "*.sol").split(path.sep).join("/");
  const zkPaths = glob.sync(zkGlob);
  return [...paths, ...zkPaths];
});

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    amoy: {
      url: process.env.ALCHEMY_AMOY_URL || "",
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

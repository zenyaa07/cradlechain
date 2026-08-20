import deployment from "./contractDeployment.json" with { type: "json" };

export const CONTRACT_ADDRESS = deployment.address;
export const CONTRACT_ABI = deployment.abi;
export const AMOY_CHAIN_ID = "0x13882";
// rpc-amoy.polygon.technology fails to resolve from some sandboxed/corporate network paths
// (confirmed ENOTFOUND repeatedly during dev).
//
// publicnode.com only keeps eth_getLogs history for ~2 days of blocks — once the seeded
// donations aged past that window, queryFilterInChunks() started hitting "History has been
// pruned" on the earliest chunk, which throws and drops the whole snapshot to the 2-donor
// preview fallback (see getChainSnapshot in chainData.js).
//
// Two full-archive, CORS-enabled endpoints, tried in order (see getReadProvider in wallet.js) —
// a single free public RPC with no API key intermittently 500s under this app's ~24-call read
// burst per page load, so one endpoint alone isn't reliable enough on its own.
//
// tenderly.co listed first, not drpc.org: as of 2026-08-20 drpc.org rejects every call —
// even eth_blockNumber — with a 400 "method does not exist" (verified directly with curl,
// not a rate-limit symptom). getReadProvider() below only ever uses index 0 with no fallback
// of its own, so whichever URL is first here is the one every getConfirmerScore/confirmers-
// panel/etc. read depends on. Swap back once drpc.org is confirmed healthy again.
export const AMOY_RPC_URLS = ["https://polygon-amoy.gateway.tenderly.co", "https://polygon-amoy.drpc.org"];
export const DEPLOYMENT_BLOCK_NUMBER = deployment.deploymentBlockNumber;

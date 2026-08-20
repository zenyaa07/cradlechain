import { CONTRACT_ADDRESS, CONTRACT_ABI, DEPLOYMENT_BLOCK_NUMBER, AMOY_RPC_URLS } from "./contractConfig.js";
import { previewSnapshot } from "./previewData.js";

let cachedSnapshot = null;
// Leaderboard, network graph, campaigns list, confirmers panel, and analytics chart all call
// getChainSnapshot() independently on page load. Without this, none of them has resolved yet
// when the others start, so every one kicks off its own full ~24-call fetchLiveSnapshot() in
// parallel — 5x the RPC load a single page load actually needs, enough to tip a free public
// endpoint into rate-limiting. This makes concurrent callers share one in-flight fetch instead.
let inflightFetch = null;
function fetchLiveSnapshotDeduped() {
  if (!inflightFetch) {
    inflightFetch = fetchLiveSnapshot().finally(() => {
      inflightFetch = null;
    });
  }
  return inflightFetch;
}

// A hard page refresh always loses the in-memory cache above, so it was paying the full
// ~24-call RPC waterfall every time — the public Amoy RPC throttles those calls server-side
// regardless of client-side parallelism, so there's a real floor there (see fetchLiveSnapshot).
// Persisting a short-lived copy in sessionStorage means only the first load per tab (or the
// first load after the TTL lapses) pays that cost; refreshes inside the window are instant.
const CACHE_KEY = "cc-chain-snapshot-v1";
const CACHE_TTL_MS = 30_000;

// donation/release amounts and confirmer stakes are BigInt (ethers v6) — JSON can't carry
// those natively, so tag/untag them across the stringify boundary.
function bigintReplacer(_key, value) {
  return typeof value === "bigint" ? { __bigint__: value.toString() } : value;
}

function bigintReviver(_key, value) {
  return value && typeof value === "object" && "__bigint__" in value ? BigInt(value.__bigint__) : value;
}

function readSnapshotCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { savedAt, snapshot } = JSON.parse(raw, bigintReviver);
    if (Date.now() - savedAt > CACHE_TTL_MS) return null;
    return snapshot;
  } catch (error) {
    return null;
  }
}

function writeSnapshotCache(snapshot) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), snapshot }, bigintReplacer));
  } catch (error) {
    // sessionStorage can be unavailable (private browsing) or full — caching is a nice-to-have.
  }
}

// Some public RPC providers (e.g. publicnode.com) cap eth_getLogs at a 10,000-block range —
// querying from the deployment block to "latest" starts failing outright once the chain has
// moved on far enough. Page through in chunks so donation/release history keeps working no
// matter how old the deployment block gets.
const MAX_LOG_RANGE = 9500; // safety margin under the common 10,000-block provider cap

// Chunks are fetched with Promise.all, not awaited one at a time — the deployment block is now
// 100k+ blocks behind "latest", meaning a dozen-plus chunks per event type. Firing them together
// instead of serially cuts total wall-clock time to roughly one round trip instead of a dozen
// stacked up; batching them into fewer HTTP requests was tried too, but the free RPC endpoints
// here reject batches outright (see batchMaxCount in getReadProvider), so each chunk is still
// its own request, just concurrent rather than sequential.
async function queryFilterInChunks(contract, filter, fromBlock) {
  const provider = contract.runner.provider ?? contract.runner;
  const latest = await provider.getBlockNumber();
  const ranges = [];
  for (let start = fromBlock; start <= latest; start += MAX_LOG_RANGE) {
    ranges.push([start, Math.min(start + MAX_LOG_RANGE - 1, latest)]);
  }
  const chunks = await Promise.all(ranges.map(([start, end]) => contract.queryFilter(filter, start, end)));
  return chunks.flat();
}

export async function getChainSnapshot() {
  if (cachedSnapshot) return cachedSnapshot;

  const cached = readSnapshotCache();
  if (cached) {
    cachedSnapshot = cached;
    // Serve the cached copy immediately, then quietly refetch so the data doesn't stay
    // stale past this tab's next real load — the user never waits on this one.
    fetchLiveSnapshotDeduped()
      .then((fresh) => {
        if (fresh.campaigns.length > 0) {
          cachedSnapshot = fresh;
          writeSnapshotCache(fresh);
        }
      })
      .catch(() => {});
    return cachedSnapshot;
  }

  try {
    const snapshot = await fetchLiveSnapshotDeduped();
    cachedSnapshot = snapshot.campaigns.length > 0 ? snapshot : { ...previewSnapshot, isPreview: true };
  } catch (error) {
    cachedSnapshot = { ...previewSnapshot, isPreview: true };
  }
  if (!cachedSnapshot.isPreview) writeSnapshotCache(cachedSnapshot);
  return cachedSnapshot;
}

// No wallet connected, RPC unreachable, or a freshly-deployed contract with nothing on it yet —
// any of these fall back to the preview snapshot in getChainSnapshot() above.
//
// A single free public RPC (no API key) intermittently 500s under this function's read burst,
// and that error lands fast enough that it never trips ethers' own stall-based retry — so retry
// the whole snapshot fetch against a fresh contract on each of AMOY_RPC_URLS in turn, rather
// than trusting one endpoint to be up for the whole call.
async function fetchLiveSnapshot() {
  let lastError;
  for (const url of AMOY_RPC_URLS) {
    try {
      // batchMaxCount: 1 — see the matching comment in wallet.js's getReadProvider for why.
      const provider = new ethers.JsonRpcProvider(url, undefined, { batchMaxCount: 1 });
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
      return await fetchSnapshotFrom(contract);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

// Every per-campaign/per-confirmer read below fires in parallel (Promise.all) rather than
// one-at-a-time — public RPC providers (publicnode.com et al.) round-trip at 300-700ms each,
// so awaiting ~30 calls in series was turning every refresh into an 8-16s wait.
async function fetchSnapshotFrom(contract) {
  const nextCampaignId = await contract.nextCampaignId();

  // organizerName/organizerBlurb/detailDescription/why/howDetail aren't on the contract's
  // Campaign struct — for the seeded demo campaigns (ids matching previewData.js) we still
  // have that authored copy, so merge it in rather than falling back to generic text.
  const previewById = Object.fromEntries(previewSnapshot.campaigns.map((c) => [c.id, c]));

  const ids = Array.from({ length: Number(nextCampaignId) }, (_, i) => BigInt(i));
  const perCampaign = await Promise.all(
    ids.map(async (id) => {
      const [campaign, history, confirmerAddress] = await Promise.all([
        contract.getCampaign(id),
        contract.getCampaignHistory(id),
        contract.campaignConfirmer(id),
      ]);
      return { id, campaign, history, confirmerAddress };
    })
  );

  const campaigns = [];
  const checkpoints = [];
  const confirmerByCampaign = {};

  for (const { id, campaign, history, confirmerAddress } of perCampaign) {
    if (!campaign.exists) continue;
    const campaignId = Number(id);
    const preview = previewById[campaignId]?.name === campaign.name ? previewById[campaignId] : null;
    campaigns.push({
      id: campaignId,
      name: campaign.name,
      description: campaign.description,
      category: Number(campaign.category),
      targetWallet: campaign.targetWallet,
      organizer: campaign.organizer,
      ...(preview && {
        organizerName: preview.organizerName,
        organizerBlurb: preview.organizerBlurb,
        detailDescription: preview.detailDescription,
        why: preview.why,
        howDetail: preview.howDetail,
      }),
    });

    history.forEach((checkpoint, checkpointId) => {
      checkpoints.push({
        campaignId,
        checkpointId,
        donationId: Number(checkpoint.donationId),
        stageName: checkpoint.stageName,
        status: Number(checkpoint.status),
        loggedAt: Number(checkpoint.loggedAt),
        confirmedAt: Number(checkpoint.confirmedAt),
        ipfsProofHash: checkpoint.ipfsProofHash,
      });
    });

    if (confirmerAddress !== ethers.ZeroAddress) {
      confirmerByCampaign[campaignId] = confirmerAddress;
    }
  }

  const [donationEvents, releaseEvents, confirmerAddresses] = await Promise.all([
    queryFilterInChunks(contract, contract.filters.DonationTagged(), DEPLOYMENT_BLOCK_NUMBER),
    queryFilterInChunks(contract, contract.filters.FundsReleased(), DEPLOYMENT_BLOCK_NUMBER),
    contract.getConfirmerList(),
  ]);

  const donations = donationEvents.map((event) => ({
    campaignId: Number(event.args.campaignId),
    donationId: Number(event.args.donationId),
    donor: event.args.donor,
    amount: event.args.amount,
    timestamp: Number(event.args.timestamp),
  }));

  const releases = releaseEvents.map((event) => ({
    campaignId: Number(event.args.campaignId),
    donationId: Number(event.args.donationId),
    amount: event.args.amount,
  }));

  const confirmerInfos = await Promise.all(confirmerAddresses.map((address) => contract.platformConfirmers(address)));
  const confirmers = confirmerAddresses.map((address, i) => ({
    address,
    label: confirmerInfos[i].label,
    stake: confirmerInfos[i].stake,
    isAllowed: confirmerInfos[i].isAllowed,
  }));

  return { campaigns, checkpoints, confirmerByCampaign, donations, releases, confirmers };
}

export function invalidateChainSnapshot() {
  // Only drop the in-flight fetch reference if there was actually a snapshot to invalidate —
  // without this, a fetch already running when invalidate() is called (e.g. the sessionStorage-
  // hit path's background "quietly refetch") stays the one getChainSnapshotDeduped() hands back
  // to the very next caller, since dedup only starts a new fetch when inflightFetch is null.
  // That meant a confirm/log/revoke's post-write re-render could resolve with data fetched
  // before the write went out. But every one of those cases starts from an already-populated
  // cachedSnapshot; on the very first page load — before anything has ever loaded — the
  // "cradlechain:connected" handler (index.html) calls this too (tryRestoreWallet's auto-connect
  // now races that first load), and there's no stale write to invalidate yet. Clearing
  // inflightFetch there just abandons the first fetch and starts a second, doubling the ~24-call
  // RPC burst fetchLiveSnapshotDeduped above exists to prevent — enough to tip the free Amoy RPC
  // into sustained rate-limiting, which is what was actually breaking Confirm: the click itself
  // was fine, but the campaign list it clicked into never finished loading real data.
  const hadSnapshot = cachedSnapshot !== null;
  cachedSnapshot = null;
  if (hadSnapshot) inflightFetch = null;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch (error) {
    // sessionStorage can be unavailable (private browsing) — nothing to clean up then.
  }
}

export const STUB_SUMMARY = {
  summary: "This campaign has moved funds from the donor wallet to the vendor and is awaiting delivery confirmation. One checkpoint is still pending confirmer sign-off.",
  goneDark: false,
  reason: null,
  pendingCount: 1,
  analysis: { zScore: null },
  ifrcBenchmark: "IFRC benchmark unavailable",
};

const CACHE_TTL_MS = 10 * 60 * 1000;

// Failure fallback for the live Groq call — built purely from checkpoint data already on
// hand, so it stays specific to this campaign instead of showing generic stub prose.
function buildFallbackSummary(contractHistory) {
  const total = contractHistory.length;
  const pendingCount = contractHistory.filter((c) => Number(c.status) !== 1).length;

  let summary;
  if (total === 0) {
    summary = "No checkpoints logged yet.";
  } else {
    const confirmedCount = total - pendingCount;
    const mostRecent = contractHistory.reduce((latest, c) =>
      Number(c.loggedAt) > Number(latest.loggedAt) ? c : latest
    );
    const daysAgo = Math.max(0, Math.floor((Date.now() / 1000 - Number(mostRecent.loggedAt)) / 86400));
    const pendingNote = pendingCount > 0 ? `, ${pendingCount} still awaiting confirmer sign-off` : "";
    summary = `${confirmedCount} of ${total} checkpoints confirmed so far. Most recent stage logged: "${mostRecent.stageName}", ${daysAgo} day(s) ago${pendingNote}.`;
  }

  return {
    summary,
    goneDark: false,
    reason: null,
    pendingCount,
    analysis: { zScore: null },
    ifrcBenchmark: "IFRC benchmark unavailable",
  };
}

// The same campaign gets re-rendered (page load, wallet connect, backend-session change)
// well within a checkpoint history actually changing — cache by campaign + checkpoint
// fingerprint so those re-renders don't re-spend a Groq call for an identical prompt.
function cachedSummary(campaignId, checkpoints) {
  const key = `cc-ai-summary:${campaignId}`;
  const fingerprint = JSON.stringify(checkpoints);
  try {
    const cached = JSON.parse(sessionStorage.getItem(key));
    if (cached && cached.fingerprint === fingerprint && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.data;
    }
  } catch (error) {
    // corrupt/missing cache entry — fall through and fetch fresh
  }
  return null;
}

function storeSummary(campaignId, checkpoints, data) {
  const key = `cc-ai-summary:${campaignId}`;
  sessionStorage.setItem(key, JSON.stringify({ fingerprint: JSON.stringify(checkpoints), data, ts: Date.now() }));
}

function renderPipelineSteps(data, contractHistory, extras = {}) {
  const zScore = data.analysis?.zScore;
  const zScoreExceeded = zScore !== null && zScore !== undefined && zScore > 2;
  const paceText =
    zScore === null || zScore === undefined
      ? "Not enough history to compare yet"
      : zScoreExceeded
      ? "Much slower than this campaign's usual pace"
      : zScore >= 1
      ? "Slower than this campaign's usual pace"
      : "In line with this campaign's usual pace";
  const statusText = data.goneDark || zScoreExceeded
    ? "Gone dark"
    : zScore !== null && zScore !== undefined && zScore >= 1
    ? "Slower than usual"
    : "On pace";
  const statusDetail = data.reason ? ` — ${data.reason}` : "";

  const track = extras.confirmerTrack;
  const trackText = track && track.total > 0
    ? `${track.confirmed}/${track.total} checkpoints confirmed across this confirmer's campaigns`
    : "No track record yet for this confirmer";

  return `
    <div class="ai-pipeline">
      <div class="ai-pipeline-step"><span class="ai-pipeline-step-label">1. Checkpoints retrieved</span>${contractHistory.length}</div>
      <div class="ai-pipeline-step"><span class="ai-pipeline-step-label">2. Pace vs. campaign history</span>${paceText}</div>
      <div class="ai-pipeline-step"><span class="ai-pipeline-step-label">3. Confirmer track record</span>${trackText}</div>
      <div class="ai-pipeline-step"><span class="ai-pipeline-step-label">4. Status</span>${statusText}${statusDetail}</div>
    </div>
    <p>${data.summary}</p>
    ${data.ifrcBenchmark ? `<p class="text-secondary ai-ifrc-note">${data.ifrcBenchmark}</p>` : ""}
  `;
}

export async function renderAISummary(campaignId, contractHistory, category, { useStub = false, stubOverride = null, confirmerTrack = null } = {}) {
  let data = stubOverride || STUB_SUMMARY;
  if (!useStub) {
    const checkpoints = contractHistory.map((c) => ({
      stageName: c.stageName,
      status: Number(c.status),
      loggedAt: Number(c.loggedAt),
    }));
    const cached = cachedSummary(campaignId, checkpoints);
    if (cached) {
      data = cached;
    } else {
      try {
        const response = await fetch("/api/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campaignId, category, checkpoints }),
        });
        if (!response.ok) throw new Error("summarize endpoint failed");
        data = await response.json();
        storeSummary(campaignId, checkpoints, data);
      } catch (error) {
        document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: "ai-summary-timeout" } }));
        data = buildFallbackSummary(contractHistory);
      }
    }
  }
  const container = document.querySelector(`.campaign-card[data-campaign-id="${campaignId}"] .ai-summary`);
  if (!container) return data; // card may have been removed from the DOM (e.g. a concurrent re-render) before this resolved
  container.innerHTML = renderPipelineSteps(data, contractHistory, { confirmerTrack });
  return data;
}

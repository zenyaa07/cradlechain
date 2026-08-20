const FETCH_TIMEOUT_MS = 10000;

// Without this, a hung Groq call rides Vercel's own platform timeout instead of
// failing fast into the frontend's stub-summary fallback — matches api/verify-checkpoint.js.
function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

const THRESHOLD_SECONDS = {
  0: 3 * 24 * 60 * 60,
  1: 14 * 24 * 60 * 60,
  2: 30 * 24 * 60 * 60,
};

const ZSCORE_THRESHOLD = 2;

// qwen/qwen3.6-27b is a reasoning model — it thinks out loud in a <think>...</think> block
// before the actual answer. Strip that off, same as api/verify-checkpoint.js.
function stripThinking(text) {
  return text.replace(/^[\s\S]*<\/think>/, "").trim();
}

const IFRC_FETCH_TIMEOUT_MS = 4000; // short — this must never be the reason the whole card is slow
const IFRC_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour, module-scope, reused across warm Vercel instances
const IFRC_NEGATIVE_CACHE_TTL_MS = 60 * 1000; // short — a transient failure shouldn't suppress the benchmark for an hour
let ifrcCache = null; // { value, fetchedAt }

async function fetchIfrcBenchmark() {
  if (ifrcCache) {
    const ttl = ifrcCache.value === null ? IFRC_NEGATIVE_CACHE_TTL_MS : IFRC_CACHE_TTL_MS;
    if (Date.now() - ifrcCache.fetchedAt < ttl) {
      return ifrcCache.value;
    }
  }
  try {
    const response = await fetch("https://goadmin.ifrc.org/api/v2/appeal/?code=MDRMY011", {
      signal: AbortSignal.timeout(IFRC_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`ifrc appeal fetch ${response.status}`);
    const data = await response.json();
    const appeal = data.results?.[0];
    if (!appeal || !appeal.start_date) throw new Error("no IFRC appeal found for MDRMY011");

    const daysSinceStart = Math.round((Date.now() - new Date(appeal.start_date).getTime()) / (24 * 60 * 60 * 1000));
    const value = `IFRC's real Malaysia flood relief operation (MDRMY011, goadmin.ifrc.org/api/v2/appeal/?code=MDRMY011) is ${daysSinceStart} days into its response as of now — a real-world disaster-response pacing reference.`;

    ifrcCache = { value, fetchedAt: Date.now() };
    return value;
  } catch (err) {
    console.error("IFRC benchmark fetch failed:", err?.message || err);
    ifrcCache = { value: null, fetchedAt: Date.now() }; // negative-cache briefly too
    return null;
  }
}

// Compares the gap since the last checkpoint against this campaign's own historical pace,
// so "gone dark" isn't judged only against a fixed category threshold.
function analyzeGaps(checkpoints, now = Date.now()) {
  const sorted = [...checkpoints].sort((a, b) => a.loggedAt - b.loggedAt);
  if (sorted.length < 2) {
    const currentGapSeconds = sorted.length ? now / 1000 - sorted[sorted.length - 1].loggedAt : 0;
    return { currentGapSeconds, meanGapSeconds: null, zScore: null };
  }

  const historicalGaps = [];
  for (let i = 1; i < sorted.length; i++) {
    historicalGaps.push(sorted[i].loggedAt - sorted[i - 1].loggedAt);
  }
  const meanGapSeconds = historicalGaps.reduce((sum, gap) => sum + gap, 0) / historicalGaps.length;
  const variance =
    historicalGaps.reduce((sum, gap) => sum + (gap - meanGapSeconds) ** 2, 0) / historicalGaps.length;
  const stdDev = Math.sqrt(variance);

  const lastLoggedAt = sorted[sorted.length - 1].loggedAt;
  const currentGapSeconds = now / 1000 - lastLoggedAt;
  const zScore = stdDev > 0 ? (currentGapSeconds - meanGapSeconds) / stdDev : null;

  return { currentGapSeconds, meanGapSeconds, zScore };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const { category, checkpoints } = req.body;
  const pendingCount = checkpoints.filter((c) => c.status === 0).length;
  const mostRecentLoggedAt = checkpoints.length
    ? Math.max(...checkpoints.map((c) => c.loggedAt))
    : 0;
  const threshold = THRESHOLD_SECONDS[category];
  const thresholdExceeded =
    mostRecentLoggedAt > 0 && Date.now() / 1000 - mostRecentLoggedAt > threshold;

  const analysis = analyzeGaps(checkpoints);
  const zScoreExceeded = analysis.zScore !== null && analysis.zScore > ZSCORE_THRESHOLD;
  const goneDark = thresholdExceeded || zScoreExceeded;

  let reason = null;
  if (goneDark) {
    const days = Math.round(analysis.currentGapSeconds / (24 * 60 * 60));
    reason = analysis.meanGapSeconds !== null && analysis.meanGapSeconds > 0
      ? `no update in ${days} days, ${(analysis.currentGapSeconds / analysis.meanGapSeconds).toFixed(1)}x this campaign's usual gap`
      : `no update in ${days} days`;
  }

  const gapContext = analysis.meanGapSeconds !== null && analysis.meanGapSeconds > 0
    ? `This campaign's current gap since the last update is ${(analysis.currentGapSeconds / analysis.meanGapSeconds).toFixed(1)}x its usual pace between checkpoints.`
    : `This campaign doesn't have enough checkpoint history yet to compare pacing.`;

  const prompt = `Summarize this donation campaign's checkpoint history in 2-3 plain-English sentences for a non-technical donor. Mention any checkpoints still awaiting confirmation. Be neutral, not accusatory. ${gapContext} Checkpoints: ${JSON.stringify(checkpoints)}`;

  const [groqResult, ifrcResult] = await Promise.allSettled([
    fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen/qwen3.6-27b",
        messages: [{ role: "user", content: prompt }],
      }),
    }),
    fetchIfrcBenchmark(),
  ]);

  if (groqResult.status !== "fulfilled" || !groqResult.value.ok) {
    res.status(502).json({ error: "ai-summary-timeout" });
    return;
  }

  const groqData = await groqResult.value.json();
  const rawSummary = groqData.choices?.[0]?.message?.content;
  const summary = rawSummary ? stripThinking(rawSummary) : "Summary unavailable.";
  const ifrcBenchmark = ifrcResult.status === "fulfilled" && ifrcResult.value
    ? ifrcResult.value
    : "IFRC benchmark unavailable";


  res.status(200).json({
    summary,
    goneDark,
    reason,
    pendingCount,
    analysis: { currentGapSeconds: analysis.currentGapSeconds, zScore: analysis.zScore },
    ifrcBenchmark,
  });
}

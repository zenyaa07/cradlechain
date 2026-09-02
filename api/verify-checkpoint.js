const VALID_VERDICTS = ["plausible", "unclear", "mismatch"];
const FETCH_TIMEOUT_MS = 20000;

// Bounds both the Pinata fetch and the Gemini call so a hung upstream resolves to the
// brief's 502 verify-failed instead of Vercel's own platform timeout.
function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

// qwen/qwen3.8-27b is a reasoning model — it thinks out loud in a <think>...</think> block
// before the actual two-line answer. Strip that off rather than let it break parseVerdict's
// line-split. If the model got cut off mid-thought (no closing tag — happens under the token
// budget below), there's no safe way to recover the real answer from a half-finished reasoning
// trace, so this throws instead of ever letting raw "<think>..." leak into the UI as if it were
// the verdict reasoning — the caller falls through to the next vision provider on a throw.
function stripThinking(text) {
  if (text.includes("<think>") && !text.includes("</think>")) {
    throw new Error("groq vision: reasoning truncated before closing </think>");
  }
  return text.replace(/^[\s\S]*<\/think>/, "").trim();
}

// Ordered by free-tier headroom: Groq's qwen/qwen3.8-27b (was qwen3.6-27b, deprecated by
// Groq 2026-09-02 and decommissioned 2026-09-14; 3.8 is Groq's stated replacement and still
// multimodal) first, then Gemini (a 20-requests/day cap — confirmed by hitting it),
// then GitHub Models as a last resort. Each entry takes the same (prompt, mimeType,
// base64Image) and returns the model's raw two-line reply, or throws to fall through.
const VISION_PROVIDERS = [
  async function groqVision(prompt, mimeType, base64Image) {
    const response = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b",
        // "none" skips the <think> reasoning phase entirely — this was confirmed for 3.6 via
        // the API's own 400 response, not docs; not yet re-confirmed for 3.8, so watch for a
        // 400 here if Groq's accepted values changed between versions.
        reasoning_effort: "none",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`groq vision ${response.status}: ${await response.text()}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("groq vision: empty response");
    return stripThinking(text);
  },
  async function gemini(prompt, mimeType, base64Image) {
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Image } }] }],
        }),
      }
    );
    if (!response.ok) throw new Error(`gemini ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error("gemini: empty response");
    return text;
  },
  // GITHUB_MODELS_MODEL defaults to the vision-capable Phi-4 variant per GitHub's catalog at
  // https://github.com/marketplace/models — confirm the exact id there and override via env
  // if it's changed, rather than editing this file.
  async function githubModels(prompt, mimeType, base64Image) {
    if (!process.env.GITHUB_MODELS_TOKEN) throw new Error("github models: not configured");
    const response = await fetchWithTimeout("https://models.github.ai/inference/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GITHUB_MODELS_TOKEN}`,
      },
      body: JSON.stringify({
        model: process.env.GITHUB_MODELS_MODEL || "microsoft/Phi-4-multimodal-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
            ],
          },
        ],
      }),
    });
    if (!response.ok) throw new Error(`github models ${response.status}`);
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("github models: empty response");
    return text;
  },
];

async function runVisionCheck(prompt, mimeType, base64Image) {
  for (const provider of VISION_PROVIDERS) {
    try {
      return await provider(prompt, mimeType, base64Image);
    } catch (err) {
      console.error(`verify-checkpoint: ${provider.name} failed — ${err.message}`);
    }
  }
  return null;
}

// Model replies in a fixed two-line format (verdict, then reasoning) so this stays a
// straight line-split instead of asking for JSON and handling markdown-fenced replies.
function parseVerdict(text) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const verdict = lines[0]?.toLowerCase();
  const reasoning = lines[1];

  if (VALID_VERDICTS.includes(verdict) && reasoning) {
    return { verdict, reasoning };
  }

  return { verdict: "unclear", reasoning: text.slice(0, 200) };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method not allowed" });
    return;
  }

  const { stageName, campaignDescription, ipfsProofHash } = req.body;

  if (!ipfsProofHash) {
    res.status(200).json({ verdict: "no-evidence" });
    return;
  }

  try {
    const imageResponse = await fetchWithTimeout(`https://gateway.pinata.cloud/ipfs/${ipfsProofHash}`);
    if (!imageResponse.ok) {
      res.status(502).json({ error: "verify-failed" });
      return;
    }

    const mimeType = imageResponse.headers.get("content-type") || "image/jpeg";
    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString("base64");

    const prompt = `You are checking donation chain-of-custody evidence. A claimed checkpoint stage is "${stageName}" for a campaign described as: "${campaignDescription}". Look at the attached photo and judge whether it plausibly matches this claimed stage and campaign. Respond in exactly two lines: line 1 is exactly one word, one of "plausible", "unclear", or "mismatch"; line 2 is one plain-English sentence of reasoning. No other text.`;

    const text = await runVisionCheck(prompt, mimeType, base64Image);
    if (!text) {
      res.status(502).json({ error: "verify-failed" });
      return;
    }

    res.status(200).json(parseVerdict(text));
  } catch (err) {
    res.status(502).json({ error: "verify-failed" });
  }
}

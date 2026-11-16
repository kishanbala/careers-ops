const Anthropic = require("@anthropic-ai/sdk");
const PROMPTS = require("../lib/prompts.generated.js");
const { applyScoring } = require("../lib/scoring.js");

// Single place to bump when a model is retired (see platform.claude.com/docs/en/about-claude/model-deprecations)
const MODEL = "claude-sonnet-5-5";
// Guards against runaway prompt size / cost from a single request
const MAX_CONTENT_LENGTH = 50000;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  const { mode, content, cv, profile } = req.body || {};
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "No content provided" });
  }
  if (content.length > MAX_CONTENT_LENGTH || (cv && cv.length > MAX_CONTENT_LENGTH)) {
    return res.status(413).json({ error: "Content too large" });
  }

  // Prompts live in prompts/*.md (derived from santifer/career-ops modes/) and are built into lib/prompts.generated.js.
  const effectiveMode = Object.prototype.hasOwnProperty.call(PROMPTS, mode) ? mode : "evaluate";
  const systemPrompt = PROMPTS[effectiveMode];
  let userMessage = content;
  if (cv) userMessage += `\n\nCANDIDATE CV:\n${cv}`;
  if (profile && profile.name) userMessage += `\n\nCANDIDATE CONTEXT:\nName: ${profile.name}\nTarget Role: ${profile.target || ""}\nTarget Salary: ${profile.salary || ""}\nLocation: ${profile.location || ""}\nCareer Story: ${profile.story || ""}`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      thinking: { type: "between_tools" }, // no tools => no thinking tokens billed
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawText = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const cleaned = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    try {
      const parsed = JSON.parse(cleaned);
      const data = effectiveMode === "evaluate" ? applyScoring(parsed) : parsed;
      return res.status(200).json({ success: true, data, mode });
    } catch {
      // stop_reason "max_tokens" means the JSON was cut off; flag it so the UI/log can tell it from a format slip.
      const truncated = message.stop_reason === "max_tokens";
      return res.status(200).json({ success: true, data: { raw: rawText }, mode, ...(truncated && { truncated: true }) });
    }
  } catch (error) {
    return res.status(500).json({ error: "API call failed", message: error.message });
  }
};
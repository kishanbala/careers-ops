const Anthropic = require("@anthropic-ai/sdk");
const PROMPTS = require("../lib/prompts.generated.js");
const { applyScoring } = require("../lib/scoring.js");

// Single place to bump when a model is retired (see platform.claude.com/docs/en/about-claude/model-deprecations)
const MODEL = "claude-sonnet-5-5";
// Guards against runaway prompt size / cost from a single request
const MAX_CONTENT_LENGTH = 50000;

// The model sometimes appends a prose note after the JSON object; take only the first balanced {...}.
function extractJson(text) {
  const start = text.indexOf("{");
  if (start === -1) return text;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

// Browser-origin allowlist: production site, this project's Vercel previews, localhost.
// NOTE: Origin/Referer can be forged by non-browser clients; the Anthropic spend limit is the real backstop.
const PROD_ORIGIN = "https://www.kairoapp.eu";
const PREVIEW_HOST = /^kairo-[a-z0-9-]+-kishanbalas-projects\.vercel\.app$/;
function originAllowed(value) {
  if (!value) return false;
  let u;
  try { u = new URL(value); } catch { return false; }
  if (u.origin === PROD_ORIGIN) return true;
  if (u.protocol === "https:" && PREVIEW_HOST.test(u.hostname)) return true;
  return u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
}

// Simple per-IP in-memory limiter (per warm instance; best-effort)
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const hits = new Map();
function rateLimited(ip, now = Date.now()) {
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > RATE_WINDOW_MS) hits.delete(k);
  const h = hits.get(ip);
  if (!h || now - h.start > RATE_WINDOW_MS) { hits.set(ip, { start: now, n: 1 }); return false; }
  return ++h.n > RATE_LIMIT;
}

module.exports = async function handler(req, res) {
  const origin = req.headers?.origin;
  const source = origin || req.headers?.referer;
  // Browsers always send Origin (or Referer) on cross-site POSTs; requests with neither are non-browser clients,
  // which an Origin check cannot stop anyway, so they fall through to the rate limit.
  if (source && !originAllowed(source)) return res.status(403).json({ error: "Forbidden" });
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ip = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
  if (rateLimited(ip)) return res.status(429).json({ error: "Too many requests" });

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
      const parsed = JSON.parse(extractJson(cleaned));
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
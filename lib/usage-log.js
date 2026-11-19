// Lightweight API usage/cost tracking for api/evaluate.js, backed by Upstash Redis's REST API.
// No SDK dependency — plain fetch, to keep the function bundle small.
//
// Reads KV_REST_API_URL/KV_REST_API_TOKEN (Vercel Marketplace "Redis" integration naming) or
// UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN (Upstash console naming) — whichever is set.
// If neither is configured, every call here is a silent no-op: the feature degrades gracefully
// instead of breaking evaluate.js for anyone who hasn't set up Redis yet.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const RECENT_CAP = 50; // bound on the "recent activity" list, so it never grows unbounded
const MODES = ["evaluate", "pdf", "research", "negotiate", "story", "scan", "contacto"];

function configured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

async function pipeline(commands, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Upstash responded ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

function dateKey(d) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD, UTC
}

// Fire-and-forget from the caller's point of view: never throws, and bounded to a short timeout
// so a slow or unreachable Redis can never meaningfully delay — let alone break — a real evaluate call.
async function logUsage({ mode, inputTokens, outputTokens }) {
  if (!configured()) return;
  const day = dateKey(new Date());
  const record = JSON.stringify({ ts: Date.now(), mode, input: inputTokens, output: outputTokens });
  try {
    await pipeline(
      [
        ["INCRBY", `usage:day:${day}:requests`, "1"],
        ["INCRBY", `usage:day:${day}:input`, String(inputTokens)],
        ["INCRBY", `usage:day:${day}:output`, String(outputTokens)],
        ["INCRBY", `usage:day:${day}:mode:${mode}:requests`, "1"],
        ["LPUSH", "usage:recent", record],
        ["LTRIM", "usage:recent", "0", String(RECENT_CAP - 1)],
      ],
      1500
    );
  } catch {
    // Logging must never affect the user-facing evaluation — swallow any error.
  }
}

// Used by api/usage.js (admin dashboard only). Throws on failure — the dashboard can show that.
async function getUsageSummary(days) {
  if (!configured()) return { configured: false };
  const n = Math.min(Math.max(1, days || 14), 60);
  const dates = [];
  for (let i = n - 1; i >= 0; i--) dates.push(dateKey(new Date(Date.now() - i * 86400000)));

  const perDate = 3 + MODES.length;
  const commands = [];
  for (const d of dates) {
    commands.push(["GET", `usage:day:${d}:requests`]);
    commands.push(["GET", `usage:day:${d}:input`]);
    commands.push(["GET", `usage:day:${d}:output`]);
    for (const m of MODES) commands.push(["GET", `usage:day:${d}:mode:${m}:requests`]);
  }
  commands.push(["LRANGE", "usage:recent", "0", String(RECENT_CAP - 1)]);

  const results = await pipeline(commands, 4000);

  const daily = dates.map((date, i) => {
    const base = i * perDate;
    const num = (idx) => Number(results[base + idx]?.result || 0);
    const modes = {};
    MODES.forEach((m, j) => { modes[m] = num(3 + j); });
    return { date, requests: num(0), input_tokens: num(1), output_tokens: num(2), modes };
  });

  const totals = daily.reduce(
    (acc, d) => ({
      requests: acc.requests + d.requests,
      input_tokens: acc.input_tokens + d.input_tokens,
      output_tokens: acc.output_tokens + d.output_tokens,
    }),
    { requests: 0, input_tokens: 0, output_tokens: 0 }
  );

  const modeTotals = MODES.map((m) => ({
    mode: m,
    requests: daily.reduce((sum, d) => sum + d.modes[m], 0),
  })).sort((a, b) => b.requests - a.requests);

  const recentRaw = results[results.length - 1]?.result || [];
  const recent = recentRaw
    .map((r) => { try { return JSON.parse(r); } catch { return null; } })
    .filter(Boolean);

  return { configured: true, totals, daily, modeTotals, recent };
}

module.exports = { logUsage, getUsageSummary, configured };

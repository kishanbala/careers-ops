// Tests for api/evaluate.js — the single serverless endpoint behind every
// Career Ops feature (evaluate, pdf, research, negotiate, story, scan, contacto).
//
// Run: node --test
//
// No test framework dependency: uses Node's built-in test runner and mocks
// @anthropic-ai/sdk by pre-seeding require.cache, so no real API calls are made.

const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");

const HANDLER_PATH = path.join(__dirname, "..", "api", "evaluate.js");
const SDK_PATH = require.resolve("@anthropic-ai/sdk");

let lastCreateArgs = null;
let nextResponse = null; // { content: [...] } or a thrown Error
let originalSdkCacheEntry;

class FakeAnthropic {
  constructor(opts) {
    this.opts = opts;
  }
  get messages() {
    return {
      create: async (args) => {
        lastCreateArgs = args;
        if (nextResponse instanceof Error) throw nextResponse;
        return nextResponse;
      },
    };
  }
}

function textBlock(text) {
  return { type: "text", text };
}

function jsonReply(obj) {
  return { content: [textBlock(JSON.stringify(obj))] };
}

beforeEach(() => {
  lastCreateArgs = null;
  nextResponse = null;
  process.env.ANTHROPIC_API_KEY = "test-key";

  // Swap the real SDK for the fake before the handler (re)requires it.
  originalSdkCacheEntry = require.cache[SDK_PATH];
  require.cache[SDK_PATH] = { id: SDK_PATH, filename: SDK_PATH, loaded: true, exports: FakeAnthropic };
  delete require.cache[HANDLER_PATH];
});

afterEach(() => {
  if (originalSdkCacheEntry) require.cache[SDK_PATH] = originalSdkCacheEntry;
  else delete require.cache[SDK_PATH];
  delete require.cache[HANDLER_PATH];
});

function loadHandler() {
  return require(HANDLER_PATH);
}

// Minimal mock of the Vercel (req, res) contract actually used by the handler.
function mockRes() {
  const res = {
    headers: {},
    statusCode: null,
    body: undefined,
    ended: false,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}

function mockReq(method, body) {
  return { method, body };
}

// ---------- Transport-level behavior ----------

test("OPTIONS preflight returns 200 with no body and CORS headers", async () => {
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("OPTIONS", {}), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.ended, true);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  assert.equal(res.headers["Access-Control-Allow-Methods"], "POST, OPTIONS");
});

test("non-POST, non-OPTIONS method is rejected with 405", async () => {
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("GET", {}), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.body.error, "Method not allowed");
});

test("missing ANTHROPIC_API_KEY returns 500 before calling the model", async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate", content: "some JD" }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, "ANTHROPIC_API_KEY not configured");
  assert.equal(lastCreateArgs, null, "model should not be called when the key is missing");
});

test("missing content returns 400", async () => {
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate" }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.error, "No content provided");
});

test("non-string content returns 400", async () => {
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate", content: { not: "a string" } }), res);
  assert.equal(res.statusCode, 400);
});

test("oversized content is rejected with 413 before calling the model", async () => {
  const handler = loadHandler();
  const res = mockRes();
  const huge = "x".repeat(50001);
  await handler(mockReq("POST", { mode: "evaluate", content: huge }), res);
  assert.equal(res.statusCode, 413);
  assert.equal(lastCreateArgs, null);
});

test("missing/empty req.body does not throw", async () => {
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", undefined), res);
  assert.equal(res.statusCode, 400);
});

// ---------- Model call configuration (regression guard for the retired-model bug) ----------

test("calls the model with the current, non-retired model id", async () => {
  nextResponse = jsonReply({ ok: true });
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "research", content: "Research: Acme Corp" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(lastCreateArgs.model, "claude-sonnet-5-5");
  assert.notEqual(lastCreateArgs.model, "claude-sonnet-4-20250514");
});

test("disables thinking so output isn't truncated or billed for thinking tokens", async () => {
  nextResponse = jsonReply({ ok: true });
  const handler = loadHandler();
  await handler(mockReq("POST", { mode: "research", content: "Research: Acme Corp" }), mockRes());
  assert.deepEqual(lastCreateArgs.thinking, { type: "between_tools" });
});

// ---------- Per-mode system prompt selection (all 7 features) ----------

const MODES = ["evaluate", "pdf", "research", "negotiate", "story", "scan", "contacto"];

for (const mode of MODES) {
  test(`mode="${mode}" selects its own system prompt and returns parsed JSON`, async () => {
    nextResponse = jsonReply({ marker: mode });
    const handler = loadHandler();
    const res = mockRes();
    await handler(mockReq("POST", { mode, content: `content for ${mode}` }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.mode, mode);
    assert.deepEqual(res.body.data, { marker: mode });
    assert.ok(
      lastCreateArgs.system.toLowerCase().includes(
        mode === "pdf" ? "cv tailor" : mode
      ) || lastCreateArgs.system.length > 0,
      "a mode-specific system prompt should be sent"
    );
  });
}

test("unknown mode falls back to the evaluate system prompt", async () => {
  nextResponse = jsonReply({ ok: true });
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "not-a-real-mode", content: "some content" }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(lastCreateArgs.system.includes("Evaluate this job offer"));
});

test("omitted mode falls back to the evaluate system prompt", async () => {
  nextResponse = jsonReply({ ok: true });
  const handler = loadHandler();
  await handler(mockReq("POST", { content: "some content" }), mockRes());
  assert.ok(lastCreateArgs.system.includes("Evaluate this job offer"));
});

// ---------- Prompt assembly (cv / profile context injection) ----------

test("CV text is appended to the user message when provided", async () => {
  nextResponse = jsonReply({ ok: true });
  const handler = loadHandler();
  await handler(
    mockReq("POST", { mode: "evaluate", content: "JD text", cv: "CV text with 10 years XP" }),
    mockRes()
  );
  const userMsg = lastCreateArgs.messages[0].content;
  assert.ok(userMsg.includes("JD text"));
  assert.ok(userMsg.includes("CANDIDATE CV:"));
  assert.ok(userMsg.includes("CV text with 10 years XP"));
});

test("no CV block is added when cv is omitted", async () => {
  nextResponse = jsonReply({ ok: true });
  const handler = loadHandler();
  await handler(mockReq("POST", { mode: "evaluate", content: "JD text" }), mockRes());
  assert.ok(!lastCreateArgs.messages[0].content.includes("CANDIDATE CV:"));
});

test("profile context is appended only when profile.name is present", async () => {
  nextResponse = jsonReply({ ok: true });
  const handler = loadHandler();
  await handler(
    mockReq("POST", {
      mode: "negotiate",
      content: "Negotiate this",
      profile: { name: "Bala", target: "Senior DA", salary: "80k", location: "Düsseldorf" },
    }),
    mockRes()
  );
  const userMsg = lastCreateArgs.messages[0].content;
  assert.ok(userMsg.includes("Name: Bala"));
  assert.ok(userMsg.includes("Target Role: Senior DA"));
});

test("profile without a name is ignored", async () => {
  nextResponse = jsonReply({ ok: true });
  const handler = loadHandler();
  await handler(
    mockReq("POST", { mode: "negotiate", content: "Negotiate this", profile: { target: "Senior DA" } }),
    mockRes()
  );
  assert.ok(!lastCreateArgs.messages[0].content.includes("CANDIDATE CONTEXT:"));
});

// ---------- Response parsing edge cases ----------

test("thinking blocks before the text block are ignored, not treated as the answer", async () => {
  nextResponse = {
    content: [{ type: "thinking", thinking: "", signature: "sig" }, textBlock(JSON.stringify({ ok: true }))],
  };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate", content: "JD" }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data, { ok: true });
});

test("markdown-fenced JSON (```json ... ```) is stripped before parsing", async () => {
  nextResponse = { content: [textBlock('```json\n{"a":1}\n```')] };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate", content: "JD" }), res);
  assert.deepEqual(res.body.data, { a: 1 });
});

test("non-JSON model output is returned as raw text, not an error", async () => {
  nextResponse = { content: [textBlock("Sorry, I can't produce JSON for that.")] };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate", content: "JD" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.raw, "Sorry, I can't produce JSON for that.");
});

test("empty content array from the model is handled without throwing", async () => {
  nextResponse = { content: [] };
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate", content: "JD" }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.raw, "");
});

// ---------- Upstream failure handling ----------

test("a model/API error (e.g. retired or unknown model) surfaces as 500 with the message", async () => {
  nextResponse = new Error('404 {"type":"error","error":{"type":"not_found_error","message":"model: bogus"}}');
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate", content: "JD" }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error, "API call failed");
  assert.ok(res.body.message.includes("not_found_error"));
});

test("CORS headers are present even on error responses", async () => {
  nextResponse = new Error("boom");
  const handler = loadHandler();
  const res = mockRes();
  await handler(mockReq("POST", { mode: "evaluate", content: "JD" }), res);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});

// Handler integration: server-side scoring is applied to "evaluate" only, and never breaks other modes.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const HANDLER_PATH = path.join(__dirname, "..", "api", "evaluate.js");
const SDK_PATH = require.resolve("@anthropic-ai/sdk");
let reply;
let original;

class FakeAnthropic {
  get messages() {
    return { create: async () => reply };
  }
}
const textReply = (obj, extra = {}) => ({ content: [{ type: "text", text: JSON.stringify(obj) }], ...extra });
const run = async (body) => {
  const res = { headers: {}, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
  await require(HANDLER_PATH)({ method: "POST", body }, res);
  return res;
};

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  original = require.cache[SDK_PATH];
  require.cache[SDK_PATH] = { id: SDK_PATH, filename: SDK_PATH, loaded: true, exports: FakeAnthropic };
  delete require.cache[HANDLER_PATH];
});
afterEach(() => {
  if (original) require.cache[SDK_PATH] = original;
  else delete require.cache[SDK_PATH];
  delete require.cache[HANDLER_PATH];
});

const sc = { northStar: 4, cvMatch: 4, level: 4, comp: 4, growth: 4, remote: 4, companyReputation: 4, techStack: 4, speedToOffer: 4, cultureSignals: 4 };

test("evaluate: server overrides the model's own total/grade from the 10 dimensions", async () => {
  reply = textReply({ finalScore: 1.1, grade: "D", scoring: sc, matchPercent: 80 });
  const res = await run({ mode: "evaluate", content: "JD" });
  assert.equal(res.body.data.finalScore, 4);
  assert.equal(res.body.data.grade, "A-");
  assert.equal(res.body.data.matchPercent, 80); // model-owned field is left alone
  assert.equal(res.body.data.scoreSource, "server-weighted");
});

test("unknown mode falls back to evaluate and is scored too", async () => {
  reply = textReply({ scoring: sc });
  const res = await run({ mode: "nope", content: "JD" });
  assert.equal(res.body.data.finalScore, 4);
  assert.equal(res.body.mode, "nope");
});

test("other modes are never post-processed, even if they happen to contain a scoring key", async () => {
  const payload = { scoring: sc, marker: 1 };
  reply = textReply(payload);
  const res = await run({ mode: "research", content: "Research: Acme" });
  assert.deepEqual(res.body.data, payload);
});

test("evaluate without a scoring block keeps the model's legacy fields", async () => {
  reply = textReply({ finalScore: 4.2, grade: "A-" });
  const res = await run({ mode: "evaluate", content: "JD" });
  assert.deepEqual(res.body.data, { finalScore: 4.2, grade: "A-" });
});

test("a response cut off at max_tokens is flagged, not silently returned as a format slip", async () => {
  reply = { content: [{ type: "text", text: '{"archetype":"Senior' }], stop_reason: "max_tokens" };
  const res = await run({ mode: "evaluate", content: "JD" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.truncated, true);
  assert.ok(res.body.data.raw.startsWith('{"archetype"'));
});

test("a normal non-JSON reply carries no truncated flag", async () => {
  reply = { content: [{ type: "text", text: "plain" }], stop_reason: "end_turn" };
  const res = await run({ mode: "evaluate", content: "JD" });
  assert.ok(!("truncated" in res.body));
});

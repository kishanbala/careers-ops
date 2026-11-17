// Phase 3 spec §3 (issue #27): runTool, isUsable, toolMessage. No real API calls (rule 5): fetch is a stub,
// replies come from tests/fixtures/api/ (synthetic). Closes the Gate A exception for BUG-01/02/05/06/14 in new screens.
const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");

const JS = path.join(__dirname, "..", "public", "js");
const load = () => import(pathToFileURL(path.join(JS, "api.js")).href);
const loadStore = () => import(pathToFileURL(path.join(JS, "store.js")).href); // same instance api.js reads
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "api", n), "utf8"));
const SYN = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "synthetic-profile.json"), "utf8")).profile;

// fetch stub: each queued item is { status, body } (JSON reply), { status, text } (non-JSON body) or "network" (throws).
let calls = [];
let queue = [];
let delays = [];
const reply = (status, body) => ({ status, body });
globalThis.fetch = async (url, opts) => {
  calls.push({ url, ...opts, payload: JSON.parse(opts.body) });
  const r = queue.length ? queue.shift() : reply(200, fx("evaluate.json").response);
  if (r === "network") throw new TypeError("Failed to fetch");
  return {
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    json: async () => (r.text !== undefined ? JSON.parse(r.text) : r.body),
  };
};

beforeEach(async () => {
  calls = [];
  queue = [];
  delays = [];
  const api = await load();
  api._setRetryDelay(async (ms) => { delays.push(ms); });
  (await loadStore()).setProfile({ ...SYN });
});

const CV_MODES = ["evaluate", "pdf", "story", "negotiate", "contacto"];
const OK_FIXTURE = { evaluate: "evaluate.json", pdf: "pdf.json", story: "story.json", research: "research.json", negotiate: "negotiate.json", contacto: "contacto.json" };

test("callAPI is byte-identical to Phase 2 (legacy pages keep using it until Phase 4)", () => {
  const s = fs.readFileSync(path.join(JS, "api.js"), "utf8");
  const a = s.indexOf("export async function callAPI");
  const block = s.slice(a, s.indexOf("\n}\n", a) + 3);
  assert.equal(crypto.createHash("sha256").update(block).digest("hex"), "d09f621147ef7d571104692de81ad4c5ab38c52ecd14252284a004d0afc1cc9d");
});

test("exports: runTool, isUsable (same function as store's), toolMessage, kinds", async () => {
  const api = await load();
  const store = await loadStore();
  assert.equal(typeof api.runTool, "function");
  assert.equal(api.isUsable, store.isUsable);
  assert.deepEqual([...api.TOOL_MODES], ["evaluate", "pdf", "story", "research", "negotiate", "contacto"]);
  assert.deepEqual([...api.TOOL_ERROR_KINDS].sort(), ["cut-off", "empty-input", "empty-profile", "network", "paused", "rate-limited", "refused", "server", "too-long", "unreadable"]);
});

test("every Working fixture comes back ok:true with its data, one call each", async () => {
  const { runTool } = await load();
  for (const [mode, file] of Object.entries({ ...OK_FIXTURE, "pdf ": "pdf-skills-object.json", "evaluate ": "evaluate-injection.json" })) {
    calls = [];
    queue = [reply(200, fx(file).response)];
    const r = await runTool(mode.trim(), { content: "SYNTHETIC input" });
    assert.equal(r.ok, true, `${file}: ${JSON.stringify(r)}`);
    assert.deepEqual(r.data, fx(file).response.data);
    assert.equal(calls.length, 1, file);
    assert.equal(calls[0].url, "/api/evaluate");
    assert.equal(calls[0].method, "POST");
  }
});

test("paused: flag off, unknown flag or unknown mode (scan) sends nothing", async () => {
  const { runTool } = await load();
  const { PAUSED_BANNER } = await import(pathToFileURL(path.join(JS, "features.js")).href);
  for (const [mode, opts] of [["evaluate", { flag: "scan.run" }], ["story", { flag: "no.suchFlag" }], ["scan", {}], ["quick", {}], [undefined, {}]]) {
    const r = await runTool(mode, { content: "x" }, opts);
    assert.deepEqual(r, { ok: false, kind: "paused", message: PAUSED_BANNER }, `${mode} ${JSON.stringify(opts)}`);
  }
  assert.equal(calls.length, 0);
  queue = [reply(200, fx("story.json").response)];
  const on = await runTool("story", { content: "x" }, { flag: "stories.generate" });
  assert.equal(on.ok, true);
  assert.equal(calls.length, 1);
});

test("empty input sends nothing", async () => {
  const { runTool } = await load();
  for (const input of [{ content: "" }, { content: "   \n\t" }, {}, null, undefined, { content: 42 }]) {
    const r = await runTool("evaluate", input);
    assert.equal(r.kind, "empty-input", JSON.stringify(input));
  }
  assert.equal(calls.length, 0);
});

test("too long (content or CV over 50,000 chars) sends nothing; exactly 50,000 is sent", async () => {
  const { runTool, MAX_INPUT_CHARS } = await load();
  const store = await loadStore();
  assert.equal(MAX_INPUT_CHARS, 50000);
  assert.equal((await runTool("evaluate", { content: "a".repeat(50001) })).kind, "too-long");
  store.setProfile({ ...SYN, cv: "c".repeat(50001) });
  assert.equal((await runTool("pdf", { content: "JD" })).kind, "too-long");
  assert.equal(calls.length, 0);
  // research does not send the CV, so a long CV does not block it
  queue = [reply(200, fx("research.json").response)];
  assert.equal((await runTool("research", { content: "Research: fictional co" })).ok, true);
  store.setProfile({ ...SYN });
  assert.equal((await runTool("evaluate", { content: "a".repeat(50000) })).ok, true);
  assert.equal(calls.length, 2);
});

test("missing CV: every CV mode stops before the request (BUG-05); research does not need one", async () => {
  const { runTool, toolMessage } = await load();
  const store = await loadStore();
  for (const p of [{ ...SYN, cv: "" }, { ...SYN, cv: "   " }, { name: "x" }, {}, null]) {
    store.setProfile(p);
    for (const mode of CV_MODES) {
      const r = await runTool(mode, { content: "SYNTHETIC JD" });
      assert.equal(r.kind, "empty-profile", `${mode} ${JSON.stringify(p)}`);
      assert.match(toolMessage(r), /Profile/);
    }
  }
  assert.equal(calls.length, 0);
  queue = [reply(200, fx("research.json").response)];
  assert.equal((await runTool("research", { content: "Research: fictional co" })).ok, true);
  assert.equal(calls.length, 1);
});

test("payload is minimal (design §6): research = {mode, content}; others add cv + 5 profile fields", async () => {
  const { runTool } = await load();
  const store = await loadStore();
  store.setProfile({ ...SYN, extra: "not sent", minscore: "4.0", title: "not sent" });
  queue = [reply(200, fx("research.json").response)];
  await runTool("research", { content: "Research: fictional co", company: "ignored" });
  assert.deepEqual(calls[0].payload, { mode: "research", content: "Research: fictional co" });
  for (const mode of CV_MODES) {
    calls = [];
    queue = [reply(200, fx(OK_FIXTURE[mode]).response)];
    await runTool(mode, { content: "SYNTHETIC", other: "ignored" });
    assert.deepEqual(calls[0].payload, {
      mode, content: "SYNTHETIC", cv: SYN.cv,
      profile: { name: SYN.name, target: SYN.target, salary: SYN.salary, location: SYN.location, story: SYN.story },
    }, mode);
  }
});

test("reply {raw} is unreadable, {raw} + truncated is cut-off (BUG-01/02/06)", async () => {
  const { runTool } = await load();
  queue = [reply(200, fx("raw-failure.json").response)];
  const a = await runTool("story", { content: "q" });
  assert.equal(a.kind, "unreadable");
  queue = [reply(200, { ...fx("raw-failure.json").response, truncated: true })];
  const b = await runTool("story", { content: "q" });
  assert.equal(b.kind, "cut-off");
  assert.equal(calls.length, 2); // never retried: the model call was already billed
  assert.doesNotMatch(a.message + b.message, /SYNTHETIC mocked prose/); // raw text is never shown
});

test("model refusal {error, message} is refused with the model's message (BUG-05)", async () => {
  const { runTool, toolMessage } = await load();
  const f = fx("evaluate-missing-cv.json").response;
  queue = [reply(200, f)];
  const r = await runTool("evaluate", { content: "SYNTHETIC JD" });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "refused");
  assert.equal(r.message, f.data.message.trim());
  assert.equal(toolMessage(r), f.data.message.trim());
  queue = [reply(200, { success: true, data: { error: "x" } })];
  const r2 = await runTool("evaluate", { content: "SYNTHETIC JD" });
  assert.equal(r2.kind, "refused");
  assert.ok(r2.message.length > 0);
});

test("unusable or malformed replies are unreadable, never ok", async () => {
  const { runTool } = await load();
  const bad = [
    ["evaluate", { success: true, data: {} }],
    ["evaluate", { success: true, data: { finalScore: null, roleTitle: "x" } }],
    ["evaluate", { success: true, data: { finalScore: 3.2 } }],
    ["story", { success: true, data: { question: "q" } }],
    ["pdf", { success: true, data: { experience: [] } }],
    ["research", { success: true, data: { company: "x" } }],
    ["negotiate", { success: true, data: { tips: [] } }],
    ["contacto", { success: true, data: { inMailBody: "x" } }],
    ["evaluate", { success: true, data: [] }],
    ["evaluate", { success: true }],
    ["evaluate", null],
    ["story", fx("evaluate.json").response], // a reply for another mode
  ];
  for (const [mode, body] of bad) {
    queue = [reply(200, body)];
    assert.equal((await runTool(mode, { content: "x" })).kind, "unreadable", `${mode} ${JSON.stringify(body).slice(0, 60)}`);
  }
  queue = [{ status: 200, text: "<html>not json" }];
  assert.equal((await runTool("evaluate", { content: "x" })).kind, "unreadable");
});

test("retries: 500 and every 4xx fail at once (BUG-14); 413 is too-long", async () => {
  const { runTool } = await load();
  for (const [status, kind] of [[500, "server"], [400, "server"], [403, "server"], [404, "server"], [405, "server"], [413, "too-long"]]) {
    calls = [];
    delays = [];
    queue = [reply(status, { error: "x" }), reply(200, fx("evaluate.json").response)];
    const r = await runTool("evaluate", { content: "x" });
    assert.equal(r.kind, kind, String(status));
    assert.equal(calls.length, 1, `${status}: exactly one call`);
    assert.deepEqual(delays, []);
  }
});

test("retries: 502/503/504 and network errors retry once after 1.5 s", async () => {
  const { runTool } = await load();
  for (const first of [reply(502, {}), reply(503, {}), reply(504, {}), "network"]) {
    calls = []; delays = [];
    queue = [first, reply(200, fx("evaluate.json").response)];
    assert.equal((await runTool("evaluate", { content: "x" })).ok, true);
    assert.equal(calls.length, 2);
    assert.deepEqual(delays, [1500]);
  }
  for (const [a, b, kind] of [[reply(503, {}), reply(504, {}), "server"], ["network", "network", "network"], ["network", reply(502, {}), "server"], [reply(502, {}), "network", "network"]]) {
    calls = []; delays = [];
    queue = [a, b, reply(200, fx("evaluate.json").response)];
    const r = await runTool("evaluate", { content: "x" });
    assert.equal(r.kind, kind);
    assert.equal(calls.length, 2, "at most 2 billed calls");
    assert.deepEqual(delays, [1500]);
  }
});

test("retries: 429/529 wait 2 s then 4 s, 3 attempts in total, then rate-limited (XC-05)", async () => {
  const { runTool } = await load();
  queue = [reply(429, {}), reply(529, {}), reply(429, {}), reply(200, fx("evaluate.json").response)];
  const r = await runTool("evaluate", { content: "x" });
  assert.equal(r.kind, "rate-limited");
  assert.equal(calls.length, 3);
  assert.deepEqual(delays, [2000, 4000]);
  calls = []; delays = [];
  queue = [reply(529, {}), reply(200, fx("evaluate.json").response)];
  assert.equal((await runTool("evaluate", { content: "x" })).ok, true);
  assert.equal(calls.length, 2);
  assert.deepEqual(delays, [2000]);
});

test("runTool never throws", async () => {
  const { runTool } = await load();
  const real = globalThis.fetch;
  try {
    globalThis.fetch = async () => null;
    assert.equal((await runTool("evaluate", { content: "x" })).kind, "server");
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => { throw new Error("boom"); } });
    assert.equal((await runTool("evaluate", { content: "x" })).kind, "unreadable");
  } finally {
    globalThis.fetch = real;
  }
  await assert.doesNotReject(runTool("evaluate", { get content() { throw new Error("getter"); } }));
});

test("toolMessage: one fixed plain sentence per kind; refused uses the model text", async () => {
  const { toolMessage, TOOL_ERROR_KINDS } = await load();
  const seen = new Set();
  for (const kind of TOOL_ERROR_KINDS) {
    const m = toolMessage({ ok: false, kind });
    assert.ok(typeof m === "string" && m.length > 10 && !/[<>]/.test(m), kind);
    seen.add(m);
  }
  assert.equal(seen.size, TOOL_ERROR_KINDS.length);
  assert.equal(toolMessage({ kind: "paused" }), "Being rebuilt. Back soon.");
  assert.equal(toolMessage({ kind: "refused", message: "  The CV is missing.  " }), "The CV is missing.");
  assert.equal(toolMessage({ kind: "refused", message: "" }), toolMessage({ kind: "refused" }));
  assert.equal(toolMessage({ kind: "server", message: "should not show" }), toolMessage({ kind: "server" }));
  assert.equal(toolMessage(null), toolMessage({ kind: "server" }));
});

test("isUsable per mode (pure)", async () => {
  const { isUsable } = await load();
  for (const [mode, file] of Object.entries(OK_FIXTURE)) assert.equal(isUsable(mode, fx(file).response.data), true, mode);
  assert.equal(isUsable("evaluate", { finalScore: 0, grade: "D" }), true);
  assert.equal(isUsable("evaluate", { finalScore: Infinity, roleTitle: "x" }), false);
  assert.equal(isUsable("evaluate", { finalScore: "4.2", roleTitle: "x" }), false);
  assert.equal(isUsable("evaluate", { finalScore: 4.2, roleTitle: "  ", grade: "" }), false);
  assert.equal(isUsable("story", { question: "q", situation: "s" }), true);
  assert.equal(isUsable("story", { question: "q", fullStory: " " }), false);
  assert.equal(isUsable("pdf", { summary: "s" }), true);
  assert.equal(isUsable("research", { verdict: "v" }), true);
  assert.equal(isUsable("negotiate", { emailBody: "b" }), true);
  assert.equal(isUsable("contacto", { connectionNote: "" }), false);
  assert.equal(isUsable("scan", fx("scan.json").response.data), false);
  assert.equal(isUsable("evaluate", fx("raw-failure.json").response.data), false);
  for (const v of [null, undefined, "x", [], 4]) assert.equal(isUsable("evaluate", v), false);
});

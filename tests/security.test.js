// Security hardening tests: output escaping, https-only links, copy handler, origin check, rate limit.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Phase 1 (#20): the app is split into a markup shell + ES modules; read the shell plus every public/js/**/*.js, concatenated.
const appSource = () => {
  const dir = path.join(__dirname, "..", "public", "js");
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".js")).sort();
  return [fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8"), ...files.map((f) => fs.readFileSync(path.join(dir, f), "utf8"))].join("\n");
};
const HTML = appSource();
const PAYLOAD = '<img src=x onerror=alert(1)><script>x</script>"\'';

// Pull a top-level function's source out of the page script by brace matching.
function fnSource(name) {
  const start = HTML.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  let depth = 0, i = HTML.indexOf("{", start);
  for (; i < HTML.length; i++) {
    if (HTML[i] === "{") depth++;
    else if (HTML[i] === "}" && --depth === 0) break;
  }
  return HTML.slice(start, i + 1);
}

function makeSandbox() {
  const els = {};
  const listeners = [];
  const copied = [];
  const sandbox = {
    document: {
      getElementById: (id) => (els[id] ||= { innerHTML: "", style: {} }),
      querySelector: () => ({ addEventListener: (ev, fn) => listeners.push([ev, fn]) }),
    },
    navigator: { clipboard: { writeText: (t) => (copied.push(t), Promise.resolve()) } },
    URL, showToast: () => {},
    els, listeners, copied,
  };
  vm.createContext(sandbox);
  vm.runInContext(["esc", "safeUrl", "renderEvalBlocks", "renderNegResult", "renderResearchResult", "renderOutreachResult"].map(fnSource).join("\n"), sandbox);
  return sandbox;
}

test("escaping: eval blocks neutralise markup", () => {
  const sb = makeSandbox();
  const html = vm.runInContext("renderEvalBlocks", sb)({ blocks: { roleSummary: PAYLOAD }, keywords: [PAYLOAD] });
  assert.ok(!/<img|<script/i.test(html));
  assert.ok(html.includes("&lt;img"));
});

test("escaping: negotiation, research and outreach output", () => {
  const sb = makeSandbox();
  vm.runInContext("renderNegResult", sb)({ opening: PAYLOAD, tips: [PAYLOAD], emailSubject: PAYLOAD, emailBody: PAYLOAD });
  vm.runInContext("renderResearchResult", sb)({ company: PAYLOAD, overview: PAYLOAD, verdict: PAYLOAD });
  vm.runInContext("renderOutreachResult", sb)({ connectionNote: PAYLOAD, inMailSubject: PAYLOAD, inMailBody: PAYLOAD, tips: [PAYLOAD] });
  for (const id of ["neg-result-content", "research-result-content", "outreach-result-content"]) {
    assert.ok(!/<img|<script/i.test(sb.els[id].innerHTML), id);
  }
});

test("escaping: no remaining raw model fields in templates (CV, header, dashboard, stories, scan)", () => {
  for (const raw of ["${data.roleTitle ||", "${e.role}", "${e.company}", "${b}</li>", "${data.summary}", ">${p.role ||", "${s.fullStory}", "${s.question ||", "${r.role}", "${r.company}"]) {
    assert.ok(!HTML.includes(raw), `unescaped: ${raw}`);
  }
});

test("links: only https URLs are allowed", () => {
  const safe = vm.runInContext("safeUrl", makeSandbox());
  assert.equal(safe("https://example.com/job?id=1"), "https://example.com/job?id=1");
  for (const bad of ["javascript:alert(1)", "http://example.com", "data:text/html,x", "//example.com", "", null, undefined, "not a url"]) {
    assert.equal(safe(bad), "", String(bad));
  }
  assert.ok(HTML.includes("safeUrl(r.url)"));
  assert.ok(!HTML.includes('href="${r.url}"'));
});

test("copy: Copy button uses a listener, not inline JS, and copies the raw text", async () => {
  const sb = makeSandbox();
  vm.runInContext("renderOutreachResult", sb)({ connectionNote: "it's <b>me</b>" });
  const html = sb.els["outreach-result-content"].innerHTML;
  assert.ok(!/onclick/i.test(html));
  assert.equal(sb.listeners.length, 1);
  sb.listeners[0][1]();
  await Promise.resolve();
  assert.deepEqual(sb.copied, ["it's <b>me</b>"]);
});

// ---------- api/evaluate.js ----------
const HANDLER_PATH = path.join(__dirname, "..", "api", "evaluate.js");
const SDK_PATH = require.resolve("@anthropic-ai/sdk");
let savedSdk;

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  savedSdk = require.cache[SDK_PATH];
  class Fake { get messages() { return { create: async () => ({ content: [{ type: "text", text: '{"a":1}' }] }) }; } }
  require.cache[SDK_PATH] = { id: SDK_PATH, filename: SDK_PATH, loaded: true, exports: Fake };
  delete require.cache[HANDLER_PATH];
});
afterEach(() => {
  if (savedSdk) require.cache[SDK_PATH] = savedSdk; else delete require.cache[SDK_PATH];
  delete require.cache[HANDLER_PATH];
});

function call(handler, headers, ip = "1.2.3.4") {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
  return handler({ method: "POST", headers: { "x-forwarded-for": ip, ...headers }, body: { mode: "research", content: "x" } }, res).then(() => res);
}

test("origin: allowed origins pass", async () => {
  const h = require(HANDLER_PATH);
  for (const origin of ["https://www.kairoapp.eu", "https://kairo-abc123-kishanbalas-projects.vercel.app", "https://kairo-git-fix-security-hardening-kishanbalas-projects.vercel.app", "http://localhost:3000"]) {
    assert.equal((await call(h, { origin }, origin)).statusCode, 200, origin);
  }
  assert.equal((await call(h, { referer: "https://www.kairoapp.eu/app" })).statusCode, 200);
});

test("origin: other origins and referers get 403", async () => {
  const h = require(HANDLER_PATH);
  for (const headers of [{ origin: "https://evil.example" }, { origin: "https://kairoapp.eu.evil.example" }, { origin: "https://other-project.vercel.app" }, { origin: "https://kairo-evil.vercel.app" }, { origin: "http://www.kairoapp.eu" }, { referer: "https://evil.example/x" }]) {
    assert.equal((await call(h, headers)).statusCode, 403, JSON.stringify(headers));
  }
});

test("rate limit: 21st request from one IP in the window gets 429, other IPs unaffected", async () => {
  const h = require(HANDLER_PATH);
  const headers = { origin: "https://www.kairoapp.eu" };
  for (let i = 0; i < 20; i++) assert.equal((await call(h, headers, "9.9.9.9")).statusCode, 200);
  assert.equal((await call(h, headers, "9.9.9.9")).statusCode, 429);
  assert.equal((await call(h, headers, "8.8.8.8")).statusCode, 200);
});

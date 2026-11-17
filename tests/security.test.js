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
  const sandbox = { URL };
  vm.createContext(sandbox);
  vm.runInContext(["esc", "safeUrl"].map(fnSource).join("\n"), sandbox);
  return sandbox;
}

// Phase 4A (#39): the legacy string renderers (renderEvalBlocks, renderNeg/Research/OutreachResult) left with the v1
// pages. The same checks now run against the screens that replaced them (role workspace: Fit, Research, Outreach,
// Negotiate), through a minimal DOM shim, with hostile model text. Browser-level twin: e2e/view-role.spec.js.
const { pathToFileURL } = require("node:url");
const JS = path.join(__dirname, "..", "public", "js");
const imp = (f) => import(pathToFileURL(path.join(JS, f)).href);

class TNode { constructor(d) { this.nodeType = 3; this.data = String(d); this.parentNode = null; } get textContent() { return this.data; } get isConnected() { return true; } remove() { this.parentNode?.removeChild(this); } }
class ENode {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.attrs = new Map(); this.listeners = []; this.disabled = false;
    this.style = { setProperty() {}, getPropertyValue() { return ""; } };
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    const self = this;
    this.dataset = new Proxy({}, {
      set(_, k, v) { self.setAttribute("data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), v); return true; },
      get(_, k) { return self.getAttribute("data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())) ?? undefined; },
    });
  }
  get isConnected() { return true; }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(type, fn) { this.listeners.push({ type, fn }); }
  removeEventListener() {}
  appendChild(c) { c.parentNode?.removeChild?.(c); c.parentNode = this; this.childNodes.push(c); return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter((x) => x !== c); c.parentNode = null; return c; }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === "object" ? c : new TNode(c)); }
  replaceChildren(...cs) { for (const c of this.childNodes) c.parentNode = null; this.childNodes = []; this.append(...cs); }
  remove() { this.parentNode?.removeChild(this); }
  focus() {}
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  set textContent(v) { this.replaceChildren(new TNode(v)); }
  all(pred, out = []) { for (const c of this.childNodes) { if (c.nodeType === 1) { if (pred(c)) out.push(c); c.all(pred, out); } } return out; }
  click() { for (const l of this.listeners) if (l.type === "click") l.fn({ currentTarget: this, target: this, preventDefault() {}, stopPropagation() {} }); }
}

function installDom() {
  const copied = [];
  const toast = new ENode("div");
  globalThis.document = { createElement: (t) => new ENode(t), createTextNode: (d) => new TNode(d), getElementById: () => toast, querySelector: () => null };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { clipboard: { writeText: (t) => (copied.push(t), Promise.resolve()) } } });
  return { copied };
}
const settle = () => new Promise((r) => setTimeout(r, 20));
const markupNodes = (el) => el.all((c) => ["IMG", "SCRIPT", "B", "IFRAME"].includes(c.tagName) || [...c.attrs.keys()].some((k) => /^on/i.test(k)));

async function roleKit(replies) {
  installDom();
  const store = await imp("store.js");
  store.setProfile({ name: "SYNTHETIC", cv: "SYNTHETIC CV text for tests.", target: "Data Analyst" });
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async (_url, opts) => {
    const mode = JSON.parse(opts.body).mode;
    return { status: 200, ok: true, json: async () => ({ success: true, mode, data: replies[mode] }) };
  };
  const role = { id: 1700000000901, role: "SYNTHETIC Role", company: "Fictional Co", score: 4.1, grade: "A-", jd: "SYNTHETIC JD for a fictional company.", status: "saved", stageHistory: [] };
  return { store, role, restore: () => { globalThis.fetch = prevFetch; } };
}

test("escaping: Fit blocks and keywords neutralise markup (replaces the legacy renderEvalBlocks check)", async () => {
  installDom();
  const { renderFitTab } = await imp("ui/role/fit-tab.js");
  const el = new ENode("div");
  const data = { finalScore: 4.1, grade: "A-", roleTitle: PAYLOAD, blocks: { roleSummary: PAYLOAD }, keywords: [PAYLOAD] };
  renderFitTab(el, { id: 1700000000900, role: PAYLOAD, company: PAYLOAD, score: 4.1, grade: "A-", fullData: data });
  assert.deepEqual(markupNodes(el), []);
  assert.ok(el.textContent.includes(PAYLOAD), "the hostile text is shown as text");
  const esc = vm.runInContext("esc", makeSandbox()); // still used by the string helpers (grade-chip.js)
  assert.ok(!/<img|<script/i.test(esc(PAYLOAD)) && esc(PAYLOAD).includes("&lt;img"));
});

test("escaping: negotiation, research and outreach output (role workspace tools)", async () => {
  const kit = await roleKit({
    research: { company: PAYLOAD, overview: PAYLOAD, verdict: PAYLOAD },
    negotiate: { opening: PAYLOAD, tips: [PAYLOAD], emailSubject: PAYLOAD, emailBody: PAYLOAD },
    contacto: { connectionNote: PAYLOAD, inMailSubject: PAYLOAD, inMailBody: PAYLOAD, tips: [PAYLOAD] },
  });
  try {
    const tabs = await imp("ui/role/tools-tabs.js");
    for (const [render, action] of [[tabs.renderResearchTab, "run-research"], [tabs.renderNegotiateTab, "run-negotiate"], [tabs.renderOutreachTab, "run-outreach"]]) {
      const el = new ENode("div");
      render(el, kit.role, kit.store.profile);
      el.all((c) => c.getAttribute("data-action") === action)[0].click();
      await settle();
      assert.deepEqual(markupNodes(el), [], action);
      assert.ok(el.textContent.includes(PAYLOAD), `${action}: hostile text shown as text`);
    }
  } finally { kit.restore(); }
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
  // Phase 4A (#39): the legacy scan list (safeUrl(r.url)) is retired; model links now come from the tailored CV.
  assert.ok(HTML.includes("safeUrl(str(d.linkedin))"));
  assert.ok(!HTML.includes('href="${r.url}"'));
  assert.ok(!/href:\s*(?:str\()?d\./.test(HTML), "no model field goes into an href without safeUrl");
});

test("copy: Copy button uses a listener, not inline JS, and copies the raw text", async () => {
  const kit = await roleKit({ contacto: { connectionNote: "it's <b>me</b>" } });
  try {
    const { renderOutreachTab } = await imp("ui/role/tools-tabs.js");
    const { copied } = installDom();
    const el = new ENode("div");
    renderOutreachTab(el, { ...kit.role, id: 1700000000902 });
    el.all((c) => c.getAttribute("data-action") === "run-outreach")[0].click();
    await settle();
    assert.deepEqual(el.all((c) => [...c.attrs.keys()].some((k) => /^on/i.test(k))), []);
    const btn = el.all((c) => c.getAttribute("aria-label") === "Copy connection note")[0];
    assert.ok(btn && btn.listeners.some((l) => l.type === "click"));
    btn.click();
    await settle();
    assert.deepEqual(copied, ["it's <b>me</b>"]);
  } finally { kit.restore(); }
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

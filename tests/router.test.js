// Hash router + first-run state (Phase 2 spec §6, design §3). Pure parts only; the DOM side is in e2e/shell.spec.js.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "router.js")).href);

class MemStorage {
  constructor(e = {}) { this.m = new Map(Object.entries(e)); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
}
const S = (o) => new MemStorage(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])));

// Phase 4A (#39): the v1 pages and #/legacy/:page are retired. Their old hashes now resolve like any unknown hash.
const LEGACY = ["dashboard", "evaluate", "scan", "batch", "cv", "stories", "negotiate", "research", "outreach", "strategy", "profile"];

test("router imports in Node without a DOM and ROUTES is frozen", async () => {
  const r = await load();
  assert.ok(Object.isFrozen(r.ROUTES));
  assert.ok(r.ROUTES.every((x) => Object.isFrozen(x)));
  assert.deepEqual(r.ROUTES.map((x) => x.pattern), ["#/", "#/home", "#/today", "#/pipeline", "#/pipeline/:id", "#/role/:id/:tab?", "#/stories", "#/profile", "#/add", "#/add/several", "#/add/scan"]);
  assert.equal(r.LEGACY_PAGES, undefined);
  assert.equal(r.navigateTo, undefined);
  for (const k of ["parseHash", "href", "go", "start", "onRoute", "firstRunState"]) assert.equal(typeof r[k], "function", k);
  r.go("home"); // no-op without a window
});

test("parseHash: every route", async () => {
  const { parseHash } = await load();
  const cases = {
    "": ["root", {}], "#": ["root", {}], "#/": ["root", {}],
    "#/home": ["home", {}], "#/today": ["today", {}], "#/today/": ["today", {}],
    "#/pipeline": ["pipeline", {}], "#/pipeline/1700000000001": ["pipeline", { id: "1700000000001" }],
    "#/role/42": ["role", { id: "42", tab: "fit" }],
    "#/stories": ["stories", {}], "#/profile": ["profile", {}],
    "#/add": ["add", {}], "#/add/several": ["add", { mode: "several" }], "#/add/scan": ["add", { mode: "scan" }],
  };
  for (const [h, [name, params]] of Object.entries(cases)) assert.deepEqual(parseHash(h), { name, params }, h);
  for (const tab of ["fit", "cv", "research", "outreach", "interview", "negotiate"]) {
    assert.deepEqual(parseHash(`#/role/7/${tab}`), { name: "role", params: { id: "7", tab } });
  }
  for (const page of LEGACY) assert.deepEqual(parseHash(`#/legacy/${page}`), { name: "root", params: {} }, page);
});

test("parseHash: unknown or malformed hashes resolve to #/", async () => {
  const { parseHash } = await load();
  for (const h of ["#/nope", "#home", "#/role", "#/role/1/nope", "#/role/1/cv/x", "#/legacy/home", "#/legacy", "#/add/other", "#/pipeline/<script>", "#/%E0%A4%A", "#/home/extra", "#/legacy/__proto__", "#/role/../../x", null, undefined, 5]) {
    assert.equal(parseHash(h).name, "root", String(h));
  }
});

test("href builds hashes that parse back to the same route", async () => {
  const { href, parseHash } = await load();
  const routes = [["home"], ["today"], ["pipeline"], ["pipeline", { id: "17" }], ["role", { id: "17" }], ["role", { id: "17", tab: "negotiate" }], ["stories"], ["profile"], ["add"], ["add", { mode: "several" }], ["add", { mode: "scan" }]];
  for (const [name, params = {}] of routes) {
    const h = href(name, params);
    const back = parseHash(h);
    assert.equal(back.name, name, h);
    for (const [k, v] of Object.entries(params)) assert.equal(back.params[k], v, h);
  }
  assert.equal(href("role", { id: "1", tab: "fit" }), "#/role/1");
  assert.equal(href("nope"), "#/");
  assert.equal(href("legacy", { page: "cv" }), "#/");
});

test("firstRunState follows design §3 (saved roles always win) and is parse-safe", async () => {
  const { firstRunState } = await load();
  assert.equal(firstRunState(S({})), "home");
  assert.equal(firstRunState(S({ co_profile: "{bad json" })), "home");
  assert.equal(firstRunState(S({ co_profile: {} })), "home");
  assert.equal(firstRunState(S({ co_profile: { name: "", cv: "   ", minscore: 4 } })), "home");
  assert.equal(firstRunState(S({ co_profile: ["x"] })), "home");
  assert.equal(firstRunState(S({ co_profile: "null" })), "home");
  assert.equal(firstRunState(S({ co_profile: { name: "SYNTHETIC" } })), "today-empty");
  assert.equal(firstRunState(S({ co_profile: { name: "SYNTHETIC" }, co_pipeline: [] })), "today-empty");
  assert.equal(firstRunState(S({ co_profile: { name: "SYNTHETIC" }, co_pipeline: "{bad" })), "today-empty");
  assert.equal(firstRunState(S({ co_profile: { name: "SYNTHETIC" }, co_pipeline: { id: 1 } })), "today-empty");
  assert.equal(firstRunState(S({ co_profile: { name: "SYNTHETIC" }, co_pipeline: [{ id: 1 }] })), "today");
  assert.equal(firstRunState(S({ co_pipeline: [{ id: 1 }] })), "today"); // decision 3: never hide saved roles
  assert.equal(firstRunState(null), "home");
  assert.equal(firstRunState({ getItem() { throw new Error("SecurityError"); } }), "home");
});

test("resolveRoute: #/ resolves by state; #/ and #/today redirect to #/home in state home", async () => {
  const { resolveRoute, parseHash } = await load();
  assert.deepEqual(resolveRoute(parseHash("#/"), "home"), { name: "home", params: {}, state: "home", redirect: "#/home" });
  assert.deepEqual(resolveRoute(parseHash("#/today"), "home"), { name: "home", params: {}, state: "home", redirect: "#/home" });
  assert.deepEqual(resolveRoute(parseHash("#/"), "today-empty"), { name: "today", params: {}, state: "today-empty", redirect: "#/today" });
  assert.deepEqual(resolveRoute(parseHash("#/nope"), "today"), { name: "today", params: {}, state: "today", redirect: "#/today" });
  assert.deepEqual(resolveRoute(parseHash("#/today"), "today"), { name: "today", params: {}, state: "today", redirect: null });
  // old v1 bookmarks land on the first-run screen instead of a retired page
  assert.deepEqual(resolveRoute(parseHash("#/legacy/cv"), "home"), { name: "home", params: {}, state: "home", redirect: "#/home" });
  assert.deepEqual(resolveRoute(parseHash("#/legacy/dashboard"), "today"), { name: "today", params: {}, state: "today", redirect: "#/today" });
});

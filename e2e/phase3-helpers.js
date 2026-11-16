// Phase 3 e2e helpers (spec §9). Builders use these with `test` from ./helpers (offline, mocked API,
// page.errors and page.apiCalls). Synthetic data only (rule 15): tests/fixtures/views/seed-v2.json.
const fs = require("node:fs");
const path = require("node:path");
const AxeBuilder = require("@axe-core/playwright").default;
const { expect, fx } = require("./helpers");

const SEED = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "views", "seed-v2.json"), "utf8"));
const CLOCK = SEED.clock; // 2026-11-20T09:00:00.000Z

// Seeds localStorage once per tab (reloads keep what the app wrote). Pass only what the case needs;
// `true` for a key means "use seed-v2.json". theme: 'light' | 'dark' (stored as co_theme, like theme.js).
async function seedState(page, { profile, pipeline, stories, theme } = {}) {
  const pick = (v, k) => (v === true ? SEED.storage[k] : v);
  const s = {};
  if (profile !== undefined) s.co_profile = pick(profile, "co_profile");
  if (pipeline !== undefined) s.co_pipeline = pick(pipeline, "co_pipeline");
  if (stories !== undefined) s.co_stories = pick(stories, "co_stories");
  if (s.co_profile || s.co_pipeline || s.co_stories) s.co_schema = 2;
  if (theme) s.co_theme = theme;
  await page.addInitScript((data) => {
    if (sessionStorage.getItem("__p3seeded")) return;
    sessionStorage.setItem("__p3seeded", "1");
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
  }, s);
}

// Overrides the /api/evaluate mock per mode. Value per mode:
//   'research.json' (a file in tests/fixtures/api/) · { status: 500 } · { raw: true } · { raw: true, truncated: true } · { json: {...} }
// Modes not listed answer with tests/fixtures/api/<mode>.json. Every call is still recorded in page.apiCalls.
async function mockApi(page, map = {}) {
  await page.route("**/api/evaluate", async (route) => {
    const body = route.request().postDataJSON() || {};
    page.apiCalls.push(body.mode);
    page.apiBodies = page.apiBodies || [];
    page.apiBodies.push(body);
    const m = map[body.mode];
    if (m && typeof m === "object" && m.status) return route.fulfill({ status: m.status, json: { error: `mocked ${m.status}` } });
    if (m && typeof m === "object" && m.raw) return route.fulfill({ json: { success: true, data: { raw: "SYNTHETIC mocked prose reply that is not JSON." }, mode: body.mode, ...(m.truncated && { truncated: true }) } });
    if (m && typeof m === "object" && m.json) return route.fulfill({ json: m.json });
    const file = typeof m === "string" ? m : `${body.mode}.json`;
    return route.fulfill({ json: fx(file).response });
  });
}

// Fixed Date only; timers and requestAnimationFrame keep running (screenshots wait on rAF).
async function fixClock(page, at = CLOCK) {
  await page.clock.setFixedTime(new Date(at));
}

// WCAG 2.1 AA, scoped to one view (e.g. '#view-home'). Fails with the rule ids and targets.
async function axeCheck(page, scope) {
  const res = await new AxeBuilder({ page }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  const v = res.violations.map((x) => ({ id: x.id, targets: x.nodes.map((n) => n.target.join(" ")) }));
  expect(v, `axe violations in ${scope}`).toEqual([]);
  return res;
}

// No horizontal page scroll at the current viewport.
async function noHorizontalOverflow(page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over, "horizontal overflow (px)").toBeLessThanOrEqual(0);
}

// Snapshot of the app's data keys, for "storage unchanged" assertions.
const storageSnapshot = (page) =>
  page.evaluate(() => Object.fromEntries(["co_profile", "co_pipeline", "co_stories", "co_schema", "co_theme"].map((k) => [k, localStorage.getItem(k)])));

module.exports = { SEED, CLOCK, seedState, mockApi, fixClock, axeCheck, noHorizontalOverflow, storageSnapshot };

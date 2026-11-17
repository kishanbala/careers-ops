// Pixel checks (Phase 1 #20, extended in Phase 3 #27). Phase 4A (#39) retired the legacy v1 page shots
// (<page>-<w>, dashboard/stories-populated-<w>, evaluate-result-<w>) with the v1 pages; the view shots below remain.
// Baselines come from the PR base rendered in the SAME environment as the comparison:
//  - CI: e2e/capture-baseline.mjs renders the PR base into BASELINE_DIR first.
//  - Local: run the capture script yourself (node e2e/capture-baseline.mjs <base>/public <dir>) and set BASELINE_DIR.
// Compare: at most MAX_DIFF_PIXELS differing pixels per shot (decoded on a canvas in the browser, no extra deps).
// SPLIT_SKIP=1 skips (push to main: no base to compare against).
// SPLIT_ALLOW (comma list of PR labels, set by CI) makes intentional pixel changes explicit (Phase 2 spec §7):
//  - `visual:all` allows every shot; `visual:<prefix>` (e.g. `visual:view-home`) allows shots whose name starts with <prefix>.
//  - Allowed shots are still captured on both sides and written to e2e-results/split-before|after/ (the PR's before/after
//    screenshots) but are not size/pixel-asserted. All other shots keep the MAX_DIFF_PIXELS rule.
//  - Host, error and API-call assertions stay on for every shot.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./helpers");

const BASE = process.env.BASELINE_DIR ? path.resolve(process.env.BASELINE_DIR) : path.join(__dirname, "baseline");
// Tolerance per Bala on issue #20: decision C (small tolerance), then decision A on follow-up comment 6929651153
// (30 px per shot, ~0.005% of a page). GitHub's runner shows renderer noise on random 390 px shots (1 px on cv-390
// and stories-390, 7 px on evaluate-result-390); locally every run is 0 px.
// More than this per screenshot, or any size change, still fails.
const MAX_DIFF_PIXELS = 30;
const BASE_URL = process.env.SPLIT_BASE_URL || "http://127.0.0.1:4173";
const HOST = new URL(BASE_URL).host;
const UPDATE = process.env.UPDATE_BASELINE === "1";
const ALLOW = (process.env.SPLIT_ALLOW || "").split(",").map((l) => l.trim()).filter((l) => l.startsWith("visual:")).map((l) => l.slice("visual:".length));
const allowed = (name) => ALLOW.some((p) => p === "all" || (p !== "" && name.startsWith(p)));
const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];

// Same procedure for capture and compare. Removes transient render noise (seen once in CI: 1 px on cv-390):
// no focus, fonts loaded, transitions settled, two rAFs, then shoot until two consecutive shots are identical
// (what toHaveScreenshot does internally).
async function shot(page) {
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // let 0.15–0.6 s CSS transitions (nav hover/active, dim bars) settle fully
  const take = async () => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
  };
  let prev = await take();
  for (let i = 0; i < 5; i++) {
    const next = await take();
    if (next.equals(prev)) return next;
    prev = next;
  }
  throw new Error("screenshot did not stabilise after 6 shots");
}

async function diffPixels(browser, a, b) {
  if (a.equals(b)) return { diff: 0 };
  const p = await browser.newPage();
  try {
    return await p.evaluate(async ([x, y]) => {
      const load = (s) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = "data:image/png;base64," + s; });
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { diff: -1, size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` };
      const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
      const da = px(ia), db = px(ib);
      let diff = 0;
      for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2] || da[i + 3] !== db[i + 3]) diff++;
      return { diff };
    }, [a.toString("base64"), b.toString("base64")]);
  } finally {
    await p.close();
  }
}

async function check(browser, name, buf) {
  const file = path.join(BASE, `${name}.png`);
  if (UPDATE) { fs.mkdirSync(BASE, { recursive: true }); fs.writeFileSync(file, buf); return; }
  expect(fs.existsSync(file), `missing baseline ${name}.png`).toBe(true);
  if (allowed(name)) {
    for (const [dir, data] of [["split-before", fs.readFileSync(file)], ["split-after", buf]]) {
      fs.mkdirSync(`e2e-results/${dir}`, { recursive: true });
      fs.writeFileSync(`e2e-results/${dir}/${name}.png`, data);
    }
    return;
  }
  const r = await diffPixels(browser, fs.readFileSync(file), buf);
  if (r.diff !== 0) { fs.mkdirSync("e2e-results/split-actual", { recursive: true }); fs.writeFileSync(`e2e-results/split-actual/${name}.png`, buf); }
  expect(r.size, `${name}: screenshot size vs baseline`).toBeUndefined();
  expect(r.diff, `${name}: differing pixels vs baseline (max ${MAX_DIFF_PIXELS})`).toBeLessThanOrEqual(MAX_DIFF_PIXELS);
}

function watch(page) {
  const hosts = new Set();
  const bad = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
  page.on("response", (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
  return { hosts, bad };
}

// ===== Phase 3 view shots (spec §9, issue #27; additive) =====
// view-<screen>-<variant>-<w>-<theme> at 390/820/1440 x light/dark, from tests/fixtures/views/seed-v2.json,
// clock fixed at 2026-11-20T09:00Z, no API calls (tabs show pre-filled inputs, not results).
// Baselines are rendered from the PR base like every other shot, so each Phase 3 screen PR changes only its own
// view-<screen>-* shots (allowed by its visual:view-<screen> label); every other shot must stay within MAX_DIFF_PIXELS.
const VIEW_SEED = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "views", "seed-v2.json"), "utf8"));
const VIEW_ROLE_ID = VIEW_SEED.storage.co_pipeline[0].id;
const VIEW_GROUPS = [
  { seed: "empty", shots: [["home-default", "home", "#/home"]] },
  { seed: "profile", shots: [["today-empty", "today", "#/today"]] },
  {
    seed: "populated",
    shots: [
      ["today-roles", "today", "#/today"],
      ["pipeline-list", "pipeline", "#/pipeline"],
      ["pipeline-detail", "pipeline", `#/pipeline/${VIEW_ROLE_ID}`],
      ...["fit", "cv", "research", "outreach", "interview", "negotiate"].map((t) => [`role-${t}`, "role", `#/role/${VIEW_ROLE_ID}/${t}`]),
      ["profile-default", "profile", "#/profile"],
      ["add-one", "add", "#/add"],
      ["add-several", "add", "#/add/several"],
      ["add-scan", "add", "#/add/scan"],
      ["stories-list", "stories", "#/stories"],
    ],
  },
];

const seedView = (page, group, theme) => {
  const s = VIEW_SEED.storage;
  const data = { co_theme: theme };
  if (group !== "empty") Object.assign(data, { co_schema: s.co_schema, co_profile: s.co_profile });
  if (group === "populated") Object.assign(data, { co_pipeline: s.co_pipeline, co_stories: s.co_stories });
  return page.addInitScript((d) => {
    if (sessionStorage.getItem("__viewseeded")) return;
    sessionStorage.setItem("__viewseeded", "1");
    for (const [k, v] of Object.entries(d)) localStorage.setItem(k, JSON.stringify(v));
  }, data);
};

for (const [w, h] of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    test.describe(`views ${w}px ${theme}`, () => {
      test.skip(process.env.SPLIT_SKIP === "1", "no pre-split base to compare against");
      test.use({ viewport: { width: w, height: h }, timezoneId: "UTC", locale: "en-GB", baseURL: BASE_URL });

      for (const group of VIEW_GROUPS) {
        test(`view shots, ${group.seed}`, async ({ page, browser }) => {
          const net = watch(page);
          await page.clock.setFixedTime(new Date(VIEW_SEED.clock));
          await seedView(page, group.seed, theme);
          for (const [variant, screen, hash] of group.shots) {
            await page.goto("/" + hash);
            await page.waitForLoadState("networkidle");
            expect(await page.evaluate(() => location.hash), `${variant}: route`).toBe(hash);
            await expect(page.locator(`#view-${screen}`)).toHaveClass(/(^|\s)active(\s|$)/);
            await page.waitForFunction((s) => document.getElementById(`view-${s}`).childElementCount > 0, screen);
            await check(browser, `view-${variant}-${w}-${theme}`, await shot(page));
          }
          expect(page.apiCalls).toEqual([]);
          expect(page.errors).toEqual([]);
          expect(net.bad).toEqual([]);
          expect([...net.hosts]).toEqual([HOST]);
        });
      }
    });
  }
}

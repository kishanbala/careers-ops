// Phase 1 (#20): the module split must be pixel-identical to the pre-split single-file app.
// Baselines come from the pre-split build rendered in the SAME environment as the comparison:
//  - CI: e2e/capture-baseline.mjs renders the PR base (pre-split main) into BASELINE_DIR first.
//  - Local: e2e/baseline/ (captured in a dev container from main@c48b9ee), or run the capture script yourself.
// Compare: 0 differing pixels (decoded on a canvas in the browser, no extra deps).
// SPLIT_SKIP=1 skips (push to main: no pre-split base to compare against).
const fs = require("node:fs");
const path = require("node:path");
const { test, expect, profile, fx } = require("./helpers");

const BASE = process.env.BASELINE_DIR ? path.resolve(process.env.BASELINE_DIR) : path.join(__dirname, "baseline");
const BASE_URL = process.env.SPLIT_BASE_URL || "http://127.0.0.1:4173";
const HOST = new URL(BASE_URL).host;
const UPDATE = process.env.UPDATE_BASELINE === "1";
const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
const PAGES = ["dashboard", "evaluate", "scan", "batch", "cv", "stories", "negotiate", "research", "outreach", "strategy", "profile"];
const SYN = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "synthetic-profile.json"), "utf8"));

// Synthetic pipeline + story built from the recorded fixtures; fixed ids/dates so pixels are stable.
const evalData = fx("evaluate.json").response.data;
const storyData = fx("story.json").response.data;
const entry = (i, status, date, extra = {}) => ({
  id: 1700000000000 + i, role: evalData.roleTitle, company: evalData.company, score: evalData.finalScore, grade: evalData.grade,
  match: evalData.matchPercent, archetype: evalData.archetype, location: evalData.jobLocation, status, date, fullData: evalData, jd: "SYNTHETIC JD", ...extra,
});
const PIPELINE = [
  entry(1, "applied", "2026-11-10T12:00:00.000Z"),
  entry(2, "interviewing", "2026-11-05T12:00:00.000Z", { company: "Fictional Co B", score: 4.2, grade: "A-", match: 90 }),
  entry(3, "rejected", "2026-10-28T12:00:00.000Z", { company: "Fictional Co C", score: 2.1, grade: "D", match: 40, fullData: undefined }),
];
const STORIES = [{ id: 1700000000100, ...storyData }];

const seed = (page, populated) =>
  page.addInitScript(([p, pl, st]) => {
    localStorage.setItem("co_profile", JSON.stringify(p));
    if (pl) localStorage.setItem("co_pipeline", JSON.stringify(pl));
    if (st) localStorage.setItem("co_stories", JSON.stringify(st));
  }, [profile.profile || profile, populated ? PIPELINE : null, populated ? STORIES : null]);

async function shot(page) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400); // let 0.15–0.6 s CSS transitions (nav hover/active, dim bars) settle fully
  return page.screenshot({ fullPage: true, animations: "disabled", caret: "hide" });
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
  const r = await diffPixels(browser, fs.readFileSync(file), buf);
  if (r.diff !== 0) { fs.mkdirSync("e2e-results/split-actual", { recursive: true }); fs.writeFileSync(`e2e-results/split-actual/${name}.png`, buf); }
  expect(r, `${name}: pixel diff vs baseline`).toEqual({ diff: 0 });
}

function watch(page) {
  const hosts = new Set();
  const bad = [];
  page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
  page.on("response", (r) => r.status() >= 400 && bad.push(`${r.status()} ${r.url()}`));
  return { hosts, bad };
}

const nav = (page, id) => page.evaluate((i) => document.querySelector(`.nav-item[data-page="${i}"]`).click(), id);

for (const [w, h] of VIEWPORTS) {
  test.describe(`split ${w}px`, () => {
    test.skip(process.env.SPLIT_SKIP === "1", "no pre-split base to compare against");
    test.use({ viewport: { width: w, height: h }, timezoneId: "UTC", locale: "en-GB", baseURL: BASE_URL });

    test("every page matches the pre-split baseline", async ({ page, browser }) => {
      const net = watch(page);
      await seed(page, false);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      for (const id of PAGES) {
        await nav(page, id);
        await expect(page.locator(`#page-${id}`)).toBeVisible();
        await check(browser, `${id}-${w}`, await shot(page));
      }
      expect(page.errors).toEqual([]);
      expect(net.bad).toEqual([]);
      expect([...net.hosts]).toEqual([HOST]);
    });

    test("populated dashboard, stories and evaluate result match the baseline", async ({ page, browser }) => {
      const net = watch(page);
      await seed(page, true);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await check(browser, `dashboard-populated-${w}`, await shot(page));
      await nav(page, "stories");
      await check(browser, `stories-populated-${w}`, await shot(page));
      await nav(page, "evaluate");
      await page.fill("#eval-jd", SYN.jds.standard);
      await page.click("#eval-run-btn");
      await expect(page.locator("#eval-result-state")).toBeVisible({ timeout: 15000 });
      await check(browser, `evaluate-result-${w}`, await shot(page));
      expect(page.apiCalls).toEqual(["evaluate"]);
      expect(page.errors).toEqual([]);
      expect(net.bad).toEqual([]);
      expect([...net.hosts]).toEqual([HOST]);
    });
  });
}

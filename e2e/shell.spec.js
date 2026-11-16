// Phase 2B: shell, hash router, first-run states, storage v2 in the browser.
// Layout and routes only: no colour or font assertions (spec §8).
const fs = require("node:fs");
const path = require("node:path");
const { test, expect, seedProfile } = require("./helpers");

const fixture = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "storage", n), "utf8")).storage;
const seedStorage = (page, storage) =>
  page.addInitScript((s) => {
    if (sessionStorage.getItem("__seeded")) return; // seed once per tab, so reloads keep what the app wrote
    sessionStorage.setItem("__seeded", "1");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v));
  }, storage);
const shell = (page) => page.locator(".app-shell");
const hash = (page) => page.evaluate(() => location.hash);
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

test("no profile: #/ opens Home (purpose line + Start with your CV), no bottom nav on phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await expect(shell(page)).toHaveAttribute("data-state", "home");
  await expect(shell(page)).toHaveAttribute("data-has-roles", "false");
  expect(await hash(page)).toBe("#/home");
  await expect(page.locator("#view-home")).toBeVisible();
  await expect(page.locator("#view-home .view-purpose")).toHaveCount(1);
  await expect(page.locator("#view-home .view-action")).toHaveText("Start with your CV");
  await expect(page.locator(".shell-bottom-nav")).toBeHidden();
  await expect(page.locator(".page-section.active")).toHaveCount(0);
  await page.click("#view-home .view-action");
  expect(await hash(page)).toBe("#/profile");
  await expect(page.locator("#page-profile")).toBeVisible();
  expect(page.errors).toEqual([]);
});

test("no profile: #/today redirects to #/home", async ({ page }) => {
  await page.goto("/#/today");
  await expect(page.locator("#view-home")).toBeVisible();
  expect(await hash(page)).toBe("#/home");
});

test("profile, no roles: Today shows the first-job action, which opens Evaluate", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/");
  await expect(shell(page)).toHaveAttribute("data-state", "today-empty");
  expect(await hash(page)).toBe("#/today");
  await expect(page.locator("#view-today .view-action")).toHaveText("Evaluate your first job");
  await page.click("#view-today .view-action");
  expect(await hash(page)).toBe("#/add");
  await expect(page.locator("#page-evaluate")).toBeVisible();
  await expect(page.locator("#eval-jd")).toBeVisible();
  expect(page.errors).toEqual([]);
});

test("roles exist: Today shows the pipeline; bottom nav on phone only; left nav on desktop", async ({ page }) => {
  await seedStorage(page, fixture("v2-basic.json"));
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await expect(shell(page)).toHaveAttribute("data-state", "today");
  await expect(shell(page)).toHaveAttribute("data-has-roles", "true");
  await expect(page.locator("#page-dashboard")).toBeVisible();
  await expect(page.locator("#sb-badge")).toHaveText("4");
  const bottom = page.locator(".shell-bottom-nav");
  await expect(bottom).toBeVisible();
  await expect(bottom.locator("a")).toHaveText(["Today", "Pipeline", "", "Stories", "Profile"]);
  await expect(bottom.locator('a[aria-label="Add role"]')).toHaveCount(1);
  await expect(page.locator(".shell-nav")).toBeHidden();
  const tabs = await bottom.locator("a").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...tabs)).toBeGreaterThanOrEqual(44);
  await bottom.locator('a[href="#/stories"]').click();
  await expect(page.locator("#page-stories")).toBeVisible();
  await expect(bottom.locator('a[href="#/stories"]')).toHaveAttribute("aria-current", "page");

  await page.setViewportSize(DESKTOP);
  await expect(bottom).toBeHidden();
  await expect(page.locator(".shell-nav")).toBeVisible();
  await page.locator('.shell-nav a[href="#/pipeline"]').click();
  expect(await hash(page)).toBe("#/pipeline");
  await expect(page.locator("#page-dashboard")).toBeVisible();
  expect(page.errors).toEqual([]);
});

test("phone menu opens the nav drawer with the legacy tools; Escape closes it", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  const btn = page.locator(".shell-menu-btn");
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".shell-nav")).toBeVisible();
  await page.locator(".shell-tools > summary").click();
  await page.locator('.shell-tools .nav-item[data-page="research"]').click();
  await expect(page.locator("#page-research")).toBeVisible();
  await expect(page.locator(".shell-nav")).toBeHidden(); // navigating closes the drawer
  await btn.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".shell-nav")).toBeHidden();
});

test("legacy nav items route through #/legacy/:page; back and forward work", async ({ page }) => {
  await seedProfile(page);
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  for (const id of ["evaluate", "cv", "negotiate"]) {
    await page.evaluate((i) => document.querySelector(`.nav-item[data-page="${i}"]`).click(), id);
    expect(await hash(page)).toBe(`#/legacy/${id}`);
    await expect(page.locator(`#page-${id}`)).toBeVisible();
    await expect(page.locator(".page-section.active")).toHaveCount(1);
  }
  await page.goBack();
  await expect(page.locator("#page-cv")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#page-evaluate")).toBeVisible();
  await page.goForward();
  await expect(page.locator("#page-cv")).toBeVisible();
  await expect(page.locator('.nav-item[data-page="strategy"]')).toBeHidden(); // Career Strategy hidden until built (design §1)
  expect(page.errors).toEqual([]);
});

test("deep links: add modes, role stub, unknown hash", async ({ page }) => {
  await seedStorage(page, fixture("v2-basic.json"));
  await page.goto("/#/add/several");
  await expect(page.locator("#page-batch")).toBeVisible();
  await page.goto("/#/add/scan");
  await expect(page.locator("#page-scan")).toBeVisible();
  await page.goto("/#/role/1700000000004/cv");
  await expect(page.locator("#view-role .page-title")).toHaveText("Product Analyst at Hollowpine Games (fictional)");
  await expect(page.locator("#view-role .view-action")).toHaveAttribute("href", "#/pipeline");
  await page.goto("/#/role/999");
  await expect(page.locator("#view-role .page-title")).toHaveText("Role not found");
  await page.goto("/#/definitely-not-a-route");
  await expect(page.locator("#page-dashboard")).toBeVisible();
  expect(await hash(page)).toBe("#/today");
  expect(page.errors).toEqual([]);
});

test("theme toggle is mounted in the header", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".shell-header #theme-toggle-slot .theme-toggle")).toHaveCount(1);
});

test("v1 data is migrated on load: co_schema 2, co_backup_v1 snapshot, v2 fields added", async ({ page }) => {
  const v1 = fixture("v1-basic.json");
  await seedStorage(page, v1);
  await page.goto("/");
  await expect(page.locator("#sb-badge")).toHaveText("3");
  const s = await page.evaluate(() => ({ schema: localStorage.getItem("co_schema"), backup: JSON.parse(localStorage.getItem("co_backup_v1")), pipeline: JSON.parse(localStorage.getItem("co_pipeline")) }));
  expect(s.schema).toBe("2");
  expect(JSON.parse(s.backup.keys.co_pipeline)).toEqual(v1.co_pipeline);
  expect(s.pipeline.map((r) => r.stageHistory)).toEqual([[], [], []]);
  expect(s.pipeline.map((r) => r.jdComplete)).toEqual([true, false, true]);
  await page.reload();
  const again = await page.evaluate(() => localStorage.getItem("co_backup_v1"));
  expect(JSON.parse(again)).toEqual(s.backup); // idempotent: snapshot taken once
  expect(page.errors).toEqual([]);
});

test("Evaluate & Track stores the full JD with a v2 role", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/#/add");
  await expect(page.locator("#page-evaluate")).toBeVisible();
  const jd = "SYNTHETIC JD for a fictional company. ".repeat(40);
  await page.fill("#eval-jd", jd);
  await page.click("#eval-run-btn");
  await expect(page.locator("#eval-result-state")).toBeVisible({ timeout: 15000 });
  const role = await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline"))[0]);
  expect(role.jd).toBe(jd.trim());
  expect(role.jd.length).toBeGreaterThan(500);
  expect(role.jdComplete).toBe(true);
  expect(role.stageHistory).toEqual([{ status: "researching", at: role.date }]);
  await expect(shell(page)).toHaveAttribute("data-has-roles", "true");
  await expect(shell(page)).toHaveAttribute("data-state", "today");
  expect(page.apiCalls).toEqual(["evaluate"]);
  expect(page.errors).toEqual([]);
});

test("primary destinations are at least 44px tall at every width", async ({ page }) => {
  await seedStorage(page, fixture("v2-basic.json"));
  for (const vp of [{ width: 820, height: 1180 }, DESKTOP]) {
    await page.setViewportSize(vp);
    await page.goto("/");
    const hs = await page.locator(".shell-nav .shell-link").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
    expect(hs.length).toBe(5);
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(44);
  }
});

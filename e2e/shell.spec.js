// Phase 2B shell, hash router, first-run states, storage v2 in the browser.
// Rewritten for Phase 3 (issue #27, spec §9): view-agnostic. It checks the hash, which #view-<name> is the active
// view, aria-current, the bottom nav and the spec §6 data-action hooks, so the Phase 2 stubs can be replaced by the
// Phase 3 screens without editing this file. Phase 4A (#39): the legacy pages and #/legacy/:page are retired.
// Layout and routes only: no colour or font assertions (Phase 2 spec §8).
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

// The route rendered #view-<name> as the one active view (whatever the screen draws inside it).
async function expectView(page, name) {
  await expect(page.locator(`#view-${name}`)).toHaveClass(/(^|\s)active(\s|$)/);
  await expect(page.locator(".view.active")).toHaveCount(1);
}

test("no profile: #/ opens Home with Start with your CV, no bottom nav on phone", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await expect(shell(page)).toHaveAttribute("data-state", "home");
  await expect(shell(page)).toHaveAttribute("data-has-roles", "false");
  expect(await hash(page)).toBe("#/home");
  await expectView(page, "home");
  await expect(page.locator("#view-home")).toBeVisible();
  const start = page.locator('#view-home [data-action="start-cv"]');
  await expect(start).toHaveCount(1);
  await expect(start).toHaveText("Start with your CV");
  await expect(page.locator(".shell-bottom-nav")).toBeHidden();
  await expect(page.locator(".page-section.active")).toHaveCount(0);
  await start.click();
  expect(await hash(page)).toBe("#/profile");
  await expectView(page, "profile");
  await expect(page.locator('.shell-nav [data-dest="profile"]')).toHaveAttribute("aria-current", "page");
  expect(page.errors).toEqual([]);
});

test("no profile: #/today redirects to #/home", async ({ page }) => {
  await page.goto("/#/today");
  await expectView(page, "home");
  await expect(page.locator("#view-home")).toBeVisible();
  expect(await hash(page)).toBe("#/home");
});

test("profile, no roles: Today shows the first-job hook; Add role opens #/add", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/");
  await expect(shell(page)).toHaveAttribute("data-state", "today-empty");
  expect(await hash(page)).toBe("#/today");
  await expectView(page, "today");
  await expect(page.locator('#view-today [data-action="first-job"]')).toHaveCount(1);
  await expect(page.locator('#view-today [data-action="first-job"]')).toBeVisible();
  await expect(page.locator('.shell-nav [data-dest="today"]')).toHaveAttribute("aria-current", "page");
  await page.setViewportSize(DESKTOP);
  await page.locator('.shell-nav a[href="#/add"]').click();
  expect(await hash(page)).toBe("#/add");
  await expectView(page, "add");
  await expect(page.locator('.shell-nav [data-dest="add"]')).toHaveAttribute("aria-current", "page");
  expect(page.errors).toEqual([]);
});

test("roles exist: Today is the start screen; bottom nav on phone only; left nav on desktop", async ({ page }) => {
  await seedStorage(page, fixture("v2-basic.json"));
  await page.setViewportSize(PHONE);
  await page.goto("/");
  await expect(shell(page)).toHaveAttribute("data-state", "today");
  await expect(shell(page)).toHaveAttribute("data-has-roles", "true");
  expect(await hash(page)).toBe("#/today");
  await expectView(page, "today");
  await expect(page.locator("#sb-badge")).toHaveText("4");
  const bottom = page.locator(".shell-bottom-nav");
  await expect(bottom).toBeVisible();
  await expect(bottom.locator("a")).toHaveText(["Today", "Pipeline", "", "Stories", "Profile"]);
  await expect(bottom.locator('a[aria-label="Add role"]')).toHaveCount(1);
  await expect(bottom.locator('a[href="#/today"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".shell-nav")).toBeHidden();
  const tabs = await bottom.locator("a").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(Math.min(...tabs)).toBeGreaterThanOrEqual(44);
  await bottom.locator('a[href="#/stories"]').click();
  expect(await hash(page)).toBe("#/stories");
  await expectView(page, "stories");
  await expect(bottom.locator('a[href="#/stories"]')).toHaveAttribute("aria-current", "page");

  await page.setViewportSize(DESKTOP);
  await expect(bottom).toBeHidden();
  await expect(page.locator(".shell-nav")).toBeVisible();
  await page.locator('.shell-nav a[href="#/pipeline"]').click();
  expect(await hash(page)).toBe("#/pipeline");
  await expectView(page, "pipeline");
  await expect(page.locator('.shell-nav [data-dest="pipeline"]')).toHaveAttribute("aria-current", "page");
  expect(page.errors).toEqual([]);
});

// Phase 4A (#39): the "Tools" group is gone; the drawer holds the five primary destinations.
test("phone menu opens the nav drawer with the primary destinations; Escape closes it", async ({ page }) => {
  await page.setViewportSize(PHONE);
  await page.goto("/");
  const btn = page.locator(".shell-menu-btn");
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".shell-nav")).toBeVisible();
  await expect(page.locator(".shell-nav .shell-link")).toHaveCount(5);
  await expect(page.locator(".shell-tools, .shell-nav .nav-item")).toHaveCount(0);
  await page.locator('.shell-nav a[href="#/stories"]').click();
  expect(await hash(page)).toBe("#/stories");
  await expectView(page, "stories");
  await expect(page.locator(".shell-nav")).toBeHidden(); // navigating closes the drawer
  await btn.click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".shell-nav")).toBeHidden();
});

// Phase 4A (#39): replaces "legacy nav items route through #/legacy/:page". Same intent on the views: nav links
// route by hash, one view is active, back and forward work; old #/legacy/* bookmarks fall back to the first-run route.
test("nav links route through the hash; back and forward work; old #/legacy links fall back", async ({ page }) => {
  await seedProfile(page);
  await page.setViewportSize(DESKTOP);
  await page.goto("/");
  for (const id of ["add", "profile", "stories"]) {
    await page.locator(`.shell-nav a[href="#/${id}"]`).click();
    expect(await hash(page)).toBe(`#/${id}`);
    await expectView(page, id);
    await expect(page.locator(`.shell-nav [data-dest="${id}"]`)).toHaveAttribute("aria-current", "page");
  }
  await page.goBack();
  await expectView(page, "profile");
  await page.goBack();
  await expectView(page, "add");
  await page.goForward();
  await expectView(page, "profile");
  await expect(page.locator(".shell-nav")).not.toContainText("Career Strategy"); // not built (design §1)
  for (const old of ["cv", "evaluate", "dashboard"]) {
    await page.goto(`/#/legacy/${old}`);
    expect(await hash(page)).toBe("#/today");
    await expectView(page, "today");
  }
  await expect(page.locator('[id^="page-"]')).toHaveCount(0);
  expect(page.errors).toEqual([]);
});

test("deep links: add modes, role workspace, unknown role, unknown hash", async ({ page }) => {
  await seedStorage(page, fixture("v2-basic.json"));
  await page.goto("/#/add/several");
  await expectView(page, "add");
  await expect(page.locator('[data-dest="add"]').first()).toHaveAttribute("aria-current", "page");
  await page.goto("/#/add/scan");
  expect(await hash(page)).toBe("#/add/scan");
  await expectView(page, "add");
  await page.goto("/#/role/1700000000004/cv");
  expect(await hash(page)).toBe("#/role/1700000000004/cv");
  await expectView(page, "role");
  await expect(page.locator("#view-role")).toContainText("Product Analyst");
  await expect(page.locator("#view-role")).toContainText("Hollowpine Games (fictional)");
  await page.goto("/#/role/999");
  await expectView(page, "role");
  await expect(page.locator("#view-role")).toContainText("Role not found");
  await expect(page.locator('#view-role a[href="#/pipeline"]').first()).toBeVisible();
  await page.goto("/#/definitely-not-a-route");
  expect(await hash(page)).toBe("#/today");
  await expectView(page, "today");
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

// Phase 4A (#39): Evaluate & Track moved from #/legacy/evaluate to Add role (#/add). Stores the full JD with a v2 role.
test("Evaluate & Track stores the full JD with a v2 role", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/#/add");
  await expectView(page, "add");
  const jd = "SYNTHETIC JD for a fictional company. ".repeat(40);
  await page.getByLabel("Job description", { exact: true }).fill(jd);
  await page.getByRole("button", { name: "Evaluate and track" }).click();
  await expect(page).toHaveURL(/#\/role\/\d+$/, { timeout: 15000 });
  const role = await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline"))[0]);
  expect(role.jd).toBe(jd);
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

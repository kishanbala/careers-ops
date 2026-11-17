const { test, expect, seedProfile } = require("./helpers");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("node:fs");

const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
// Phase 4A (#39): the v1 pages are retired. Every Working feature now lives on one of these views (spec §6).
const VIEWS = [["home", "#/home"], ["today", "#/today"], ["pipeline", "#/pipeline"], ["add", "#/add"], ["add", "#/add/several"], ["add", "#/add/scan"], ["stories", "#/stories"], ["profile", "#/profile"]];

for (const [w, h] of VIEWPORTS) {
  test.describe(`${w}px`, () => {
    test.use({ viewport: { width: w, height: h } });

    test("loads without script errors; every view opens; screenshot + axe report", async ({ page }) => {
      await seedProfile(page);
      await page.goto("/");
      await expect(page.locator(".view.active")).toHaveCount(1);
      for (const [name, hash] of VIEWS) {
        await page.goto("/" + hash);
        await expect(page.locator(`#view-${name}`)).toHaveClass(/(^|\s)active(\s|$)/);
        await expect(page.locator(`#view-${name}`)).toBeVisible();
        await expect(page.locator(`#view-${name} h1`).first()).toBeVisible();
      }
      await page.goto("/#/today");
      await expect(page.locator("#view-today")).toBeVisible();
      await page.screenshot({ path: `e2e-results/shots/today-${w}.png`, fullPage: true });
      const axe = await new AxeBuilder({ page }).analyze(); // report-only (see issue #12, out of scope)
      fs.mkdirSync("e2e-results/axe", { recursive: true });
      fs.writeFileSync(`e2e-results/axe/axe-${w}.json`, JSON.stringify(axe.violations.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })), null, 1));
      expect(page.errors).toEqual([]);
    });
  });
}

test("empty dashboard shows an empty state", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#sb-badge")).toHaveText("0");
});

// Phase 4A (#39): Evaluate & Track moved from the legacy Evaluate page to Add role (#/add).
test("Evaluate & Track with mocked reply adds a pipeline row and persists", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/#/add");
  await page.getByLabel("Job description", { exact: true }).fill("Senior Data Analyst. SQL, dashboards, stakeholder management. Düsseldorf hybrid.");
  await page.getByRole("button", { name: "Evaluate and track" }).click();
  await expect(page).toHaveURL(/#\/role\/\d+$/, { timeout: 15000 });
  await expect(page.locator("#view-role")).toBeVisible();
  expect(page.apiCalls.length).toBe(1);
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline") || "[]").length);
  expect(n).toBe(1);
  await page.reload();
  await expect(page.locator("#sb-badge")).toHaveText("1");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline")).length)).toBe(1);
  expect(page.errors).toEqual([]);
});

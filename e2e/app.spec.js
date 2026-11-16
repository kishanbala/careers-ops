const { test, expect, seedProfile, profile } = require("./helpers");
const AxeBuilder = require("@axe-core/playwright").default;
const fs = require("node:fs");

const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
const PAGES = ["dashboard", "evaluate", "scan", "batch", "cv", "stories", "negotiate", "research", "outreach", "profile"];

for (const [w, h] of VIEWPORTS) {
  test.describe(`${w}px`, () => {
    test.use({ viewport: { width: w, height: h } });

    test("loads without script errors; every page opens; screenshot + axe report", async ({ page }, info) => {
      await page.goto("/");
      await expect(page.locator("#eval-jd")).toHaveCount(1);
      for (const id of PAGES) {
        // the nav is hidden on some widths; clicking via DOM exercises the same router handler
        await page.evaluate((i) => document.querySelector(`.nav-item[data-page="${i}"]`)?.click(), id);
        await expect(page.locator(`#page-${id}`)).toBeVisible();
      }
      await page.evaluate(() => document.querySelector('.nav-item[data-page="dashboard"]').click());
      await page.screenshot({ path: `e2e-results/shots/dashboard-${w}.png`, fullPage: true });
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

test("Evaluate & Track with mocked reply adds a pipeline row and persists", async ({ page }) => {
  await seedProfile(page);
  await page.goto("/");
  await page.evaluate(() => document.querySelector('.nav-item[data-page="evaluate"]').click());
  await page.fill("#eval-jd", "Senior Data Analyst. SQL, dashboards, stakeholder management. Düsseldorf hybrid.");
  await page.click("#eval-run-btn");
  await expect(page.locator("#eval-result-state")).toBeVisible({ timeout: 15000 });
  expect(page.apiCalls.length).toBe(1);
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline") || "[]").length);
  expect(n).toBe(1);
  await page.reload();
  await expect(page.locator("#sb-badge")).toBeAttached();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline")).length)).toBe(1);
  expect(page.errors).toEqual([]);
});

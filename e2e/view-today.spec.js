// Phase 3C: Today (#/today). Synthetic data only (tests/fixtures/views/seed-v2.json), mocked API, clock 2026-11-20T09:00Z.
// Today makes no model call, so the exact expected page.apiCalls is [] everywhere; the {raw}/refused/500 cases
// belong to the screens that run tools. Axe is scoped to #view-today.
const { test, expect } = require("./helpers");
const { SEED, seedState, mockApi, fixClock, axeCheck, noHorizontalOverflow, storageSnapshot } = require("./phase3-helpers");

test.use({ timezoneId: "UTC" });

const WIDTHS = [[390, 844], [820, 1180], [1440, 900]];
const THEMES = ["light", "dark"];
const PROFILE_ONLY = { name: "Mira Synthetic", target: "Senior analytics role" }; // no CV: first-run "today-empty"

function trackHosts(page) {
  const hosts = new Set();
  page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: urls */ } });
  return hosts;
}

for (const [w, hgt] of WIDTHS) {
  for (const theme of THEMES) {
    test(`moves: axe, no overflow, same-origin only, no API call at ${w} ${theme}`, async ({ page }) => {
      const hosts = trackHosts(page);
      await page.setViewportSize({ width: w, height: hgt });
      await fixClock(page);
      await seedState(page, { profile: true, pipeline: true, theme });
      await mockApi(page);
      await page.goto("/#/today");
      await expect(page.locator("#view-today .t-group").first()).toBeVisible();
      await axeCheck(page, "#view-today");
      await noHorizontalOverflow(page);
      expect(page.errors).toEqual([]);
      expect(page.apiCalls).toEqual([]);
      expect([...hosts]).toEqual([new URL(page.url()).host]);
    });

    test(`first job: axe, no overflow, same-origin only at ${w} ${theme}`, async ({ page }) => {
      const hosts = trackHosts(page);
      await page.setViewportSize({ width: w, height: hgt });
      await fixClock(page);
      await seedState(page, { profile: PROFILE_ONLY, theme });
      await mockApi(page);
      await page.goto("/#/today");
      await expect(page.locator('#view-today [data-action="first-job"]')).toBeVisible();
      await axeCheck(page, "#view-today");
      await noHorizontalOverflow(page);
      expect(page.errors).toEqual([]);
      expect(page.apiCalls).toEqual([]);
      expect([...hosts]).toEqual([new URL(page.url()).host]);
    });
  }
}

test("moves are built from the dates the roles have, and a closed role makes none", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: true, pipeline: true });
  await mockApi(page);
  await page.goto("/#/today");
  const groups = page.locator("#view-today .t-group");
  await expect(groups.locator(".t-group-title")).toHaveText([/^Today\s*2$/, /^Coming up\s*1$/, /^Waiting for a reply\s*1$/]);
  await expect(page.locator('#view-today [data-group="today"] .t-move')).toHaveCount(2);
  await expect(page.locator('#view-today [data-group="today"]')).toContainText("Prepare two STAR stories for the panel");
  await expect(page.locator('#view-today [data-group="today"]')).toContainText("Today, 16:00");
  await expect(page.locator('#view-today [data-group="upcoming"]')).toContainText("Sat 21 Nov, 13:00");
  await expect(page.locator('#view-today [data-group="waiting"]')).toContainText("Applied 7 days ago");
  await expect(page.locator("#view-today")).not.toContainText("Marrowgate"); // rejected: no move
  await expect(page.locator("#view-today")).not.toContainText("Pebblecrest"); // nothing dated, score 2.8
  // a move links to its role in the pipeline
  await page.locator('#view-today [data-group="upcoming"] a').click();
  expect(await page.evaluate(() => location.hash)).toBe("#/pipeline/1700000000203");
  expect(page.apiCalls).toEqual([]);
});

test("roles without any date show one clear next step, not a blank page", async ({ page }) => {
  await fixClock(page);
  const roles = SEED.storage.co_pipeline.filter((r) => r.id === 1700000000204);
  await seedState(page, { profile: true, pipeline: roles });
  await page.goto("/#/today");
  await expect(page.locator("#view-today .t-none")).toContainText("Nothing is scheduled");
  await expect(page.locator('#view-today .t-none a[href="#/pipeline"]')).toBeVisible();
});

test("first job: empty box shows a message and goes nowhere; a JD is handed to #/add?jd=1 once", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: PROFILE_ONLY });
  await mockApi(page);
  await page.goto("/#/today");
  const before = await storageSnapshot(page);
  const btn = page.locator('#view-today [data-action="first-job"]');
  await btn.click();
  await expect(page.locator("#view-today .t-error")).toHaveText("Paste a job description first.");
  expect(await page.evaluate(() => location.hash)).toBe("#/today");
  expect(await page.evaluate(() => sessionStorage.getItem("kairo:handoff-jd"))).toBeNull();
  await page.locator("#t-jd").fill("SYNTHETIC JD: Senior Analytics Engineer at Fictional Co.");
  await btn.click();
  expect(await page.evaluate(() => location.hash)).toBe("#/add?jd=1");
  expect(await page.evaluate(() => sessionStorage.getItem("kairo:handoff-jd"))).toBe("SYNTHETIC JD: Senior Analytics Engineer at Fictional Co.");
  await expect(page.locator(".view.active")).toHaveAttribute("id", "view-add");
  expect(page.apiCalls).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(before);
  expect(page.errors).toEqual([]);
});

test("first job: a JD over 50,000 characters is refused before the hand-off", async ({ page }) => {
  await seedState(page, { profile: PROFILE_ONLY });
  await page.goto("/#/today");
  await page.locator("#t-jd").evaluate((el) => { el.value = "x".repeat(50001); });
  await page.locator('#view-today [data-action="first-job"]').click();
  await expect(page.locator("#view-today .t-error")).toContainText("too long");
  expect(await page.evaluate(() => sessionStorage.getItem("kairo:handoff-jd"))).toBeNull();
  expect(await page.evaluate(() => location.hash)).toBe("#/today");
});

test("model text in a role is shown as text, never as markup", async ({ page }) => {
  await fixClock(page);
  const evil = { ...SEED.storage.co_pipeline[0], role: '<img src=x onerror="window.__xss=1">Role', company: "<b>Co</b>", nextAction: '<script>window.__xss=1</script>' };
  await seedState(page, { profile: true, pipeline: [evil] });
  await page.goto("/#/today");
  await expect(page.locator("#view-today")).toContainText('<img src=x onerror="window.__xss=1">Role');
  await expect(page.locator("#view-today img, #view-today script, #view-today b")).toHaveCount(0);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

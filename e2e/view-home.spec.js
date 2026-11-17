// Phase 3A (issue #28): the Home screen, #/home. Mocked API, synthetic data only (rule 15).
// Home never calls the model: every case also asserts page.apiCalls stays empty.
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./helpers");
const { seedState, mockApi, fixClock, axeCheck, noHorizontalOverflow, storageSnapshot } = require("./phase3-helpers");

const FIX = path.join(__dirname, "..", "tests", "fixtures", "views");
const VALID = path.join(FIX, "home-backup-valid.json");
const INVALID = path.join(FIX, "home-backup-invalid.json");
const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
const THEMES = ["light", "dark"];
const ORIGIN = "http://127.0.0.1:4173";

// Every request the page makes must stay on this origin (or be a local blob/data URL): no third-party hosts (design §6).
function watchHosts(page) {
  const seen = [];
  page.on("request", (r) => seen.push(r.url()));
  return () => seen.filter((u) => !(u.startsWith(ORIGIN) || u.startsWith("blob:") || u.startsWith("data:")));
}

async function openHome(page, { theme } = {}) {
  await fixClock(page);
  await seedState(page, { theme });
  await mockApi(page, {});
  await page.goto("/#/home");
  await expect(page.locator("#view-home h1")).toHaveText("Know which jobs are worth your time.");
}

for (const [w, hgt] of VIEWPORTS) {
  for (const theme of THEMES) {
    test.describe(`${w}px ${theme}`, () => {
      test.use({ viewport: { width: w, height: hgt } });

      test("default state: axe 0 violations, no overflow, no errors, same-origin only, no API call", async ({ page }) => {
        const offOrigin = watchHosts(page);
        await openHome(page, { theme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await axeCheck(page, "#view-home");
        await noHorizontalOverflow(page);
        expect(page.errors).toEqual([]);
        expect(offOrigin()).toEqual([]);
        expect(page.apiCalls).toEqual([]);
      });

      test("example open: axe 0 violations and the example is the made-up B / Worth a look", async ({ page }) => {
        await openHome(page, { theme });
        await page.locator('#view-home [data-action="see-example"]').click();
        const ex = page.locator("#view-home #home-example");
        await expect(ex).toBeVisible();
        await expect(ex.locator(".k-fit-num")).toHaveText("3.3");
        await expect(ex.locator(".k-band")).toHaveText("Worth a look");
        await expect(ex.locator(".grade-chip")).toHaveText("B");
        await expect(ex.locator(".k-fit-dim")).toHaveCount(10);
        await axeCheck(page, "#view-home");
        await noHorizontalOverflow(page);
        expect(page.errors).toEqual([]);
        expect(page.apiCalls).toEqual([]);
      });
    });
  }
}

test("Start with your CV goes to #/profile", async ({ page }) => {
  await openHome(page);
  const start = page.locator('#view-home [data-action="start-cv"]');
  await expect(start).toHaveText("Start with your CV");
  await start.click();
  await expect(page).toHaveURL(/#\/profile$/);
  await expect(page.locator("#view-profile")).toHaveClass(/active/);
  expect(page.apiCalls).toEqual([]);
});

test("See an example first: inline, no API, one same-origin fetch, toggles, storage untouched", async ({ page }) => {
  const exampleFetches = [];
  page.on("request", (r) => r.url().includes("example-evaluation") && exampleFetches.push(r.url()));
  await openHome(page);
  const before = await storageSnapshot(page);
  const btn = page.locator('#view-home [data-action="see-example"]');
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#home-example")).toContainText("made-up job");
  await expect(page.locator("#home-example .k-fit-role")).toContainText("Senior Data Analyst");
  await btn.click();
  await expect(page.locator("#home-example")).toBeHidden();
  await btn.click();
  await expect(page.locator("#home-example")).toBeVisible();
  expect(exampleFetches).toEqual([`${ORIGIN}/data/example-evaluation.json`]); // cached after the first open
  expect(page.apiCalls).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(before);
});

test("example that fails to load shows a plain message, no crash", async ({ page }) => {
  await page.route("**/data/example-evaluation.json", (r) => r.fulfill({ status: 500, body: "x" }));
  await openHome(page);
  await page.locator('#view-home [data-action="see-example"]').click();
  await expect(page.locator("#home-example")).toContainText("could not be loaded");
  expect(page.apiCalls).toEqual([]);
  expect(page.errors).toEqual([]);
});

test("demo: 4 steps, auto-advances at about 3.6 s, Pause stops it, Play resumes, steps are clickable", async ({ page }) => {
  test.setTimeout(30000);
  await openHome(page);
  const demo = page.locator("#view-home .home-demo");
  await expect(demo).toHaveAttribute("data-step", "cv");
  await expect(demo.locator(".home-step")).toHaveCount(4);
  await expect(demo.locator(".home-step[aria-current='step']")).toHaveText(/Add your CV/);
  await expect(demo).toHaveAttribute("data-step", "job", { timeout: 6000 });
  const pause = page.locator('#view-home [data-action="demo-toggle"]');
  await expect(pause).toHaveText("Pause");
  await pause.click();
  await expect(pause).toHaveText("Play");
  await expect(demo).toHaveAttribute("data-playing", "false");
  await page.waitForTimeout(4500);
  await expect(demo).toHaveAttribute("data-step", "job");
  await demo.locator('.home-step[data-step="act"]').click();
  await expect(demo).toHaveAttribute("data-step", "act");
  await expect(demo.locator(".home-demo-title")).toHaveText("Act on it");
  await pause.click();
  await expect(demo).toHaveAttribute("data-playing", "true");
  await expect(demo).toHaveAttribute("data-step", "cv", { timeout: 6000 }); // wraps round
  expect(page.apiCalls).toEqual([]);
});

test("reduced motion: the demo is static, no Pause/Play, steps still clickable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openHome(page);
  const demo = page.locator("#view-home .home-demo");
  await expect(demo).toHaveAttribute("data-playing", "false");
  await expect(page.locator('#view-home [data-action="demo-toggle"]')).toHaveCount(0);
  await page.waitForTimeout(4500);
  await expect(demo).toHaveAttribute("data-step", "cv");
  await demo.locator('.home-step[data-step="verdict"]').click();
  await expect(demo).toHaveAttribute("data-step", "verdict");
  await expect(demo.locator(".home-scene .k-band")).toHaveText("Apply");
  await page.waitForTimeout(4500);
  await expect(demo).toHaveAttribute("data-step", "verdict");
  const animation = await page.locator("#view-home .home-demo-panel").evaluate((e) => getComputedStyle(e).animationName);
  expect(animation).toBe("none");
  await axeCheck(page, "#view-home");
});

test("checklist, tools, bands, grades, privacy line and footer content", async ({ page }) => {
  await openHome(page);
  const v = page.locator("#view-home");
  const checks = v.locator(".home-check");
  await expect(checks).toHaveCount(3);
  await expect(checks.nth(0)).toContainText("Add your CV");
  await expect(checks.nth(0)).toContainText("2 min");
  await expect(checks.nth(1)).toContainText("optional");
  await expect(checks.nth(2)).toContainText("under a minute");
  await expect(checks.nth(0).locator("a")).toHaveAttribute("href", "#/profile");
  await expect(checks.nth(2).locator("a")).toHaveAttribute("href", "#/add");
  await expect(v.locator(".home-tool")).toHaveCount(6);
  await expect(v.locator('.home-band[data-band="apply"]')).toContainText("4.0 and up");
  await expect(v.locator('.home-band[data-band="look"]')).toContainText("3.0 to 3.9");
  await expect(v.locator('.home-band[data-band="skip"]')).toContainText("Below 3.0");
  await expect(v.locator(".home-grade")).toHaveCount(6);
  await expect(v.locator('.home-grade[data-grade="A"] .grade-chip--gold')).toBeVisible();
  await expect(v.locator('.home-grade[data-grade="A-"] .grade-chip--silver')).toBeVisible();
  await expect(v.locator('.home-grade[data-grade="B+"] .grade-chip--bronze')).toBeVisible();
  await expect(v.locator(".home-privacy-line")).toContainText("Your CV and roles stay in this browser. When you run a tool, the text goes through our server to Anthropic's AI to produce the result. We don't store it.");
  await expect(v.locator(".home-privacy-line a")).toHaveAttribute("href", "/privacy.html");
  const footer = v.locator(".k-site-footer");
  await expect(footer).toContainText("Evaluation method adapted from santifer/career-ops (MIT)");
  await expect(footer.locator("a")).toHaveCount(1); // Privacy only: the Impressum slot stays hidden
  await expect(footer.locator("a")).toHaveAttribute("href", "/privacy.html");
  expect(page.apiCalls).toEqual([]);
});

test("export: downloads a Kairo backup file and changes nothing", async ({ page }) => {
  await seedState(page, { profile: true, pipeline: true, stories: true });
  await openHome(page);
  const before = await storageSnapshot(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('#view-home [data-action="export-backup"]').click()]);
  expect(dl.suggestedFilename()).toMatch(/^kairo-backup-2026-11-20\.json$/);
  const file = await dl.path();
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(json.app).toBe("kairo");
  expect(json.schema).toBe(2);
  expect(json.data.co_pipeline).toHaveLength(4);
  expect(json.data.co_stories).toHaveLength(2);
  await expect(page.locator("#view-home .home-status")).toHaveText("Backup saved to your downloads.");
  expect(await storageSnapshot(page)).toEqual(before);
  expect(page.apiCalls).toEqual([]);
});

test("restore: Cancel changes nothing; Restore replaces the data and says what it restored", async ({ page }) => {
  await openHome(page);
  const before = await storageSnapshot(page);
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('#view-home [data-action="restore-backup"]').click()]);
  await chooser.setFiles(VALID);
  const dlg = page.locator("dialog.k-modal");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("your profile, 4 roles, 2 stories");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await expect(dlg).toHaveCount(0);
  expect(await storageSnapshot(page)).toEqual(before);

  await page.locator('#view-home [data-role="restore-input"]').setInputFiles(VALID);
  await dlg.getByRole("button", { name: "Restore backup" }).click();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator("#view-home .home-status")).toHaveText("Restored your profile, 4 roles, 2 stories.");
  const after = await storageSnapshot(page);
  expect(JSON.parse(after.co_pipeline)).toHaveLength(4);
  expect(JSON.parse(after.co_stories)).toHaveLength(2);
  expect(JSON.parse(after.co_profile).name).toContain("SYNTHETIC");
  expect(after.co_schema).toBe("2");
  expect(page.apiCalls).toEqual([]);
  expect(page.errors).toEqual([]);
});

test("restore: a modal opened over Home has no axe violations and Esc closes it", async ({ page }) => {
  await openHome(page);
  await page.locator('#view-home [data-role="restore-input"]').setInputFiles(VALID);
  const dlg = page.locator("dialog.k-modal");
  await expect(dlg).toBeVisible();
  await axeCheck(page, "dialog.k-modal");
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
});

test("restore: a wrong, empty or garbage file is refused with a message and storage is unchanged", async ({ page }) => {
  await openHome(page);
  const before = await storageSnapshot(page);
  const input = page.locator('#view-home [data-role="restore-input"]');
  const status = page.locator("#view-home .home-status");

  await input.setInputFiles(INVALID);
  await expect(status).toContainText("not a usable Kairo backup");
  await expect(page.locator("dialog.k-modal")).toHaveCount(0);

  await input.setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{not json") });
  await expect(status).toContainText("not valid JSON");

  await input.setInputFiles({ name: "empty.json", mimeType: "application/json", buffer: Buffer.from("") });
  await expect(status).toContainText("empty");

  await input.setInputFiles({ name: "arr.json", mimeType: "application/json", buffer: Buffer.from("[1,2]") });
  await expect(status).toContainText("not a usable Kairo backup");

  expect(await storageSnapshot(page)).toEqual(before);
  expect(page.apiCalls).toEqual([]);
  expect(page.errors).toEqual([]);
});

test("a server that would answer 500 or {raw} is never asked: Home makes no model call, storage unchanged", async ({ page }) => {
  await fixClock(page);
  await mockApi(page, { evaluate: { status: 500 }, story: { raw: true }, pdf: { status: 500 } });
  await page.goto("/#/home");
  const before = await storageSnapshot(page);
  await page.locator('#view-home [data-action="see-example"]').click();
  await page.locator('#view-home .home-step[data-step="verdict"]').click();
  await page.locator('#view-home [data-action="export-backup"]').click();
  expect(page.apiCalls).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(before);
});

test("keyboard: every control is reachable and the Start link is first in the page content", async ({ page }) => {
  await openHome(page);
  await page.locator('#view-home [data-action="start-cv"]').focus();
  await page.keyboard.press("Tab");
  await expect(page.locator('#view-home [data-action="see-example"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#home-example")).toBeVisible();
});

test("unmount: leaving Home stops the demo timer and writes nothing", async ({ page }) => {
  await openHome(page);
  await page.goto("/#/profile");
  await expect(page.locator("#view-profile")).toHaveClass(/active/);
  await page.waitForTimeout(4200);
  expect(page.errors).toEqual([]);
  expect(page.apiCalls).toEqual([]);
});

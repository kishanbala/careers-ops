// Phase 3D (#31): Add role (#/add, #/add/several, #/add/scan). Synthetic data only; the API is always mocked (rule 5).
// Exact page.apiCalls per action; {raw}, empty-profile and 500 cases leave storage unchanged; paused scan sends nothing.
const { test, expect, fx } = require("./helpers");
const { SEED, seedState, mockApi, fixClock, axeCheck, noHorizontalOverflow, storageSnapshot } = require("./phase3-helpers");

const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
const ROUTES = [["one", "#/add"], ["several", "#/add/several"], ["scan", "#/add/scan"]];
const JD = "SYNTHETIC JD: Senior Data Analyst at Larkspur Mobility BV. Build dashboards and own the metric layer.";
const watch = (page) => {
  const hosts = new Set();
  page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
  return hosts;
};
const open = async (page, hash = "#/add") => {
  await page.goto("/" + hash);
  await expect(page.locator("#view-add h1")).toHaveText("Add a role");
};
const run = (page) => page.getByRole("button", { name: "Evaluate and track" });
const check = (page) => page.getByRole("button", { name: "Check without saving" });
const jd = (page) => page.getByLabel("Job description", { exact: true });

for (const [w, h] of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    for (const [name, hash] of ROUTES) {
      test(`add ${name} ${w}px ${theme}: axe clean, no overflow, same-origin only, no API call`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        const hosts = watch(page);
        await fixClock(page);
        await seedState(page, { profile: true, pipeline: true, stories: true, theme });
        await open(page, hash);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.locator(`#view-add .ad-mode[aria-current="page"]`)).toBeVisible();
        await axeCheck(page, "#view-add");
        await noHorizontalOverflow(page);
        for (const b of await page.locator("#view-add button, #view-add textarea, #view-add input, #view-add .ad-mode").all()) {
          if (await b.isVisible()) expect((await b.boundingBox()).height, "touch target").toBeGreaterThanOrEqual(43.5);
        }
        expect(page.apiCalls).toEqual([]);
        expect(page.errors).toEqual([]);
        expect([...hosts]).toEqual([new URL(page.url()).host]);
      });
    }
  }
}

test("Evaluate and track: one call, role saved with the full JD, opens the role (EVAL-01)", async ({ page }) => {
  await seedState(page, { profile: true });
  await mockApi(page);
  await open(page);
  const long = JD + "\n" + "More SYNTHETIC detail. ".repeat(60);
  await jd(page).fill(long);
  await run(page).click();
  await expect(page).toHaveURL(/#\/role\/\d+$/);
  expect(page.apiCalls).toEqual(["evaluate"]);
  const roles = await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline")));
  expect(roles).toHaveLength(1);
  expect(roles[0].jd).toBe(long);
  expect(roles[0].role).toBe(fx("evaluate.json").response.data.roleTitle);
  expect(roles[0].stageHistory).toHaveLength(1);
  const sent = page.apiBodies[0];
  expect(Object.keys(sent).sort()).toEqual(["content", "cv", "mode", "profile"]);
  expect(Object.keys(sent.profile).sort()).toEqual(["location", "name", "salary", "story", "target"]);
  expect(page.errors).toEqual([]);
});

test("a JD handed over by Today fills the box once and is removed from sessionStorage", async ({ page }) => {
  await seedState(page, { profile: true });
  await page.addInitScript(() => { if (!sessionStorage.getItem("__h")) { sessionStorage.setItem("__h", "1"); sessionStorage.setItem("kairo:handoff-jd", "SYNTHETIC handed JD"); } });
  await page.goto("/#/add?jd=1");
  await expect(jd(page)).toHaveValue("SYNTHETIC handed JD");
  expect(await page.evaluate(() => sessionStorage.getItem("kairo:handoff-jd"))).toBeNull();
  await page.goto("/#/add");
  await page.reload();
  await expect(jd(page)).toHaveValue("");
});

test("Check without saving shows the fit, saves nothing, then Track this role saves it (EVAL-02, EVAL-06)", async ({ page }) => {
  await seedState(page, { profile: true, pipeline: true });
  await mockApi(page);
  await open(page);
  const before = await storageSnapshot(page);
  await jd(page).fill(JD);
  await check(page).click();
  await expect(page.locator("#view-add .k-fit")).toBeVisible();
  await expect(page.locator("#view-add .k-fit-dim")).toHaveCount(10);
  await expect(page.getByText("Result (not saved)")).toBeVisible();
  expect(await storageSnapshot(page)).toEqual(before);
  expect(page.apiCalls).toEqual(["evaluate"]);
  await axeCheck(page, "#view-add");
  await page.getByRole("button", { name: "Track this role" }).click();
  await expect(page).toHaveURL(/#\/role\/\d+$/);
  const roles = await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline")));
  expect(roles).toHaveLength(SEED.storage.co_pipeline.length + 1);
  expect(page.apiCalls).toEqual(["evaluate"]);
});

for (const [label, save] of [["Evaluate and track", true], ["Check without saving", false]]) {
  test(`${label}: {raw} reply shows an error and saves nothing`, async ({ page }) => {
    await seedState(page, { profile: true, pipeline: true });
    await mockApi(page, { evaluate: { raw: true } });
    await open(page);
    const before = await storageSnapshot(page);
    await jd(page).fill(JD);
    await (save ? run(page) : check(page)).click();
    await expect(page.locator("#view-add .k-tool-error")).toContainText("could not be read");
    expect(await storageSnapshot(page)).toEqual(before);
    expect(page.apiCalls).toEqual(["evaluate"]);
    expect(page.errors).toEqual([]);
  });

  test(`${label}: a 500 makes exactly one call, shows an error and saves nothing`, async ({ page }) => {
    await seedState(page, { profile: true, pipeline: true });
    await mockApi(page, { evaluate: { status: 500 } });
    await open(page);
    const before = await storageSnapshot(page);
    await jd(page).fill(JD);
    await (save ? run(page) : check(page)).click();
    await expect(page.locator("#view-add .k-tool-error")).toContainText("server could not finish");
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(await storageSnapshot(page)).toEqual(before);
    expect(page.apiCalls).toEqual(["evaluate"]);
  });

  test(`${label}: no CV in Profile makes no call and points to Profile`, async ({ page }) => {
    await seedState(page, { profile: { name: "Pat Placeholder (SYNTHETIC)" } });
    await mockApi(page);
    await open(page);
    const before = await storageSnapshot(page);
    await jd(page).fill(JD);
    await (save ? run(page) : check(page)).click();
    await expect(page.locator("#view-add .k-tool-error")).toContainText("Add your CV in Profile");
    await expect(page.getByRole("link", { name: "Add your CV in Profile" })).toHaveAttribute("href", "#/profile");
    expect(await storageSnapshot(page)).toEqual(before);
    expect(page.apiCalls).toEqual([]);
  });

  test(`${label}: an empty box makes no call`, async ({ page }) => {
    await seedState(page, { profile: true });
    await mockApi(page);
    await open(page);
    await (save ? run(page) : check(page)).click();
    await expect(page.locator("#view-add .k-tool-error")).toContainText("Nothing to send");
    expect(page.apiCalls).toEqual([]);
  });
}

test("a model refusal shows the model's message and saves nothing", async ({ page }) => {
  await seedState(page, { profile: true });
  await mockApi(page, { evaluate: { json: { success: true, data: { error: true, message: "SYNTHETIC refusal: this text is not a job description." } } } });
  await open(page);
  const before = await storageSnapshot(page);
  await jd(page).fill(JD);
  await run(page).click();
  await expect(page.locator("#view-add .k-tool-error")).toContainText("SYNTHETIC refusal");
  expect(await storageSnapshot(page)).toEqual(before);
});

test("model text that looks like HTML is shown as text, never as markup", async ({ page }) => {
  await seedState(page, { profile: true });
  const data = { ...fx("evaluate.json").response.data, roleTitle: '<img src=x onerror="window.__pwned=1">Role', company: "<b>Co</b>" };
  await mockApi(page, { evaluate: { json: { success: true, data, mode: "evaluate" } } });
  await open(page);
  await jd(page).fill(JD);
  await check(page).click();
  await expect(page.locator("#view-add .k-fit-role")).toContainText("<img src=x");
  expect(await page.locator("#view-add img").count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test("Several: splits on --- lines, one call per job, per-row results, Track per row (BATCH-01..03)", async ({ page }) => {
  await seedState(page, { profile: true });
  await mockApi(page);
  await open(page, "#/add/several");
  await page.getByLabel("Job descriptions").fill(`${JD} A\n---\n${JD} B\n---\n\n---\n${JD} C`);
  await expect(page.locator("#view-add .ad-count")).toHaveText("3 jobs found.");
  await page.getByRole("button", { name: "Evaluate all" }).click();
  await expect(page.locator("#view-add .ad-row--done")).toHaveCount(3);
  expect(page.apiCalls).toEqual(["evaluate", "evaluate", "evaluate"]);
  await expect(page.locator("#view-add .ad-summary")).toHaveText("3 of 3 evaluated.");
  expect(await page.evaluate(() => localStorage.getItem("co_pipeline"))).toBeNull();
  await page.locator("#view-add .ad-row").nth(1).getByRole("button", { name: /^Track/ }).click();
  await expect(page.locator("#view-add .ad-row").nth(1).getByRole("link", { name: "Open the role" })).toBeVisible();
  const roles = await page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline")));
  expect(roles).toHaveLength(1);
  expect(roles[0].jd).toBe(`${JD} B`);
  await axeCheck(page, "#view-add");
  expect(page.errors).toEqual([]);
});

test("Several: failures are shown, not dropped; Try again retries just that row", async ({ page }) => {
  await seedState(page, { profile: true });
  await mockApi(page);
  let n = 0;
  await page.route("**/api/evaluate", async (route) => {
    n++;
    if (n === 2) return route.fulfill({ status: 500, json: { error: "mocked 500" } });
    return route.fulfill({ json: fx("evaluate.json").response });
  });
  await open(page, "#/add/several");
  await page.getByLabel("Job descriptions").fill(`${JD} A\n---\n${JD} B\n---\n${JD} C`);
  await page.getByRole("button", { name: "Evaluate all" }).click();
  await expect(page.locator("#view-add .ad-row--done")).toHaveCount(2);
  await expect(page.locator("#view-add .ad-row--failed")).toHaveCount(1);
  await expect(page.locator("#view-add .ad-summary")).toHaveText("2 of 3 evaluated, 1 failed.");
  expect(n).toBe(3);
  await page.getByRole("button", { name: "Try job 2 again" }).click();
  await expect(page.locator("#view-add .ad-row--done")).toHaveCount(3);
  expect(n).toBe(4);
});

test("Several: no CV stops after zero calls and says so", async ({ page }) => {
  await seedState(page, { profile: { name: "Pat Placeholder (SYNTHETIC)" } });
  await mockApi(page);
  await open(page, "#/add/several");
  await page.getByLabel("Job descriptions").fill(`${JD} A\n---\n${JD} B`);
  await page.getByRole("button", { name: "Evaluate all" }).click();
  await expect(page.locator("#view-add .k-tool-error")).toContainText("Add your CV in Profile");
  await expect(page.locator("#view-add .ad-row--failed")).toHaveCount(1);
  await expect(page.locator("#view-add .ad-row--skipped")).toHaveCount(1);
  expect(page.apiCalls).toEqual([]);
});

test("Several: {raw} and 500 replies fail each row, call count matches, storage unchanged", async ({ page }) => {
  for (const reply of [{ raw: true }, { status: 500 }]) {
    await seedState(page, { profile: true, pipeline: true });
    await mockApi(page, { evaluate: reply });
    await open(page, "#/add/several");
    const before = await storageSnapshot(page);
    await page.getByLabel("Job descriptions").fill(`${JD} A\n---\n${JD} B`);
    await page.getByRole("button", { name: "Evaluate all" }).click();
    await expect(page.locator("#view-add .ad-row--failed")).toHaveCount(2);
    expect(page.apiCalls).toEqual(["evaluate", "evaluate"]);
    expect(await storageSnapshot(page)).toEqual(before);
    page.apiCalls.length = 0;
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.goto("/#/add");
  }
});

test("Several: at most 5 jobs per run (decision 4), and the box says what is left out", async ({ page }) => {
  await seedState(page, { profile: true });
  await mockApi(page);
  await open(page, "#/add/several");
  await page.getByLabel("Job descriptions").fill(Array.from({ length: 7 }, (_, i) => `${JD} #${i + 1}`).join("\n---\n"));
  await expect(page.locator("#view-add .ad-count")).toContainText("7 jobs found. Only the first 5 run each time; the last 2 will be left out");
  await page.getByRole("button", { name: "Evaluate all" }).click();
  await expect(page.locator("#view-add .ad-row--done")).toHaveCount(5);
  expect(page.apiCalls).toHaveLength(5);
});

test("Scan is designed in full but paused: banner, aria-disabled, no call, no change (clicks, Enter and Space)", async ({ page }) => {
  await seedState(page, { profile: true, pipeline: true, stories: true });
  await mockApi(page);
  await open(page, "#/add/scan");
  const before = await storageSnapshot(page);
  const find = page.getByRole("button", { name: "Find jobs" });
  const addPortal = page.getByRole("button", { name: "Add a portal" });
  await expect(page.locator("#view-add .paused-banner")).toHaveCount(2);
  for (const t of await page.locator("#view-add .paused-banner").all()) await expect(t).toHaveText("Being rebuilt. Back soon.");
  for (const b of [find, addPortal]) {
    await expect(b).toHaveAttribute("aria-disabled", "true");
    expect(await b.evaluate((n) => n.hasAttribute("disabled")), "stays focusable (no disabled attribute)").toBe(false);
    await b.click({ force: true }); // Playwright treats aria-disabled as disabled, so force it
    await b.focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Space");
  }
  await page.getByLabel("What are you looking for?").fill("SYNTHETIC focus");
  await page.keyboard.press("Enter");
  expect(page.apiCalls).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(before);
  expect(await page.locator("#view-add a[href^='http']").count()).toBe(0);
  expect(page.errors).toEqual([]);
});

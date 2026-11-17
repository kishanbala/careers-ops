// Phase 3C: Pipeline (#/pipeline, #/pipeline/:id). Synthetic data only (seed-v2.json), mocked API, clock 2026-11-20T09:00Z.
// No pipeline action calls the model, so page.apiCalls is [] in every case. Delete stays paused (pipeline.delete).
const { test, expect } = require("./helpers");
const { SEED, seedState, mockApi, fixClock, axeCheck, noHorizontalOverflow, storageSnapshot } = require("./phase3-helpers");

test.use({ timezoneId: "UTC" });

const WIDTHS = [[390, 844], [820, 1180], [1440, 900]];
const THEMES = ["light", "dark"];
const ID = "1700000000203";
const hash = (page) => page.evaluate(() => location.hash);
const roles = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("co_pipeline")));

function trackHosts(page) {
  const hosts = new Set();
  page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: urls */ } });
  return hosts;
}

for (const [w, hgt] of WIDTHS) {
  for (const theme of THEMES) {
    for (const [name, route, sel] of [["list", "/#/pipeline", ".p-item"], ["detail", `/#/pipeline/${ID}`, ".p-detail"]]) {
      test(`${name}: axe, no overflow, same-origin only, no API call at ${w} ${theme}`, async ({ page }) => {
        const hosts = trackHosts(page);
        await page.setViewportSize({ width: w, height: hgt });
        await fixClock(page);
        await seedState(page, { profile: true, pipeline: true, theme });
        await mockApi(page);
        await page.goto(route);
        await expect(page.locator(`#view-pipeline ${sel}`).first()).toBeVisible();
        await axeCheck(page, "#view-pipeline");
        await noHorizontalOverflow(page);
        expect(page.errors).toEqual([]);
        expect(page.apiCalls).toEqual([]);
        expect([...hosts]).toEqual([new URL(page.url()).host]);
      });
    }
  }
}

test("layout: phone is list OR detail (with a back link); tablet is list over detail; desktop is side by side", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: true, pipeline: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/pipeline");
  await expect(page.locator("#view-pipeline .p-list-pane")).toBeVisible();
  await expect(page.locator("#view-pipeline .p-detail-pane")).toBeHidden();
  await page.locator(`#view-pipeline .p-item[href="#/pipeline/${ID}"]`).click();
  await expect(page.locator("#view-pipeline .p-list-pane")).toBeHidden();
  await expect(page.locator("#view-pipeline .p-detail")).toBeVisible();
  await page.locator("#view-pipeline .p-back").click();
  expect(await hash(page)).toBe("#/pipeline");
  await expect(page.locator("#view-pipeline .p-list-pane")).toBeVisible();

  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto(`/#/pipeline/${ID}`);
  const list = await page.locator("#view-pipeline .p-list-pane").boundingBox();
  const det = await page.locator("#view-pipeline .p-detail-pane").boundingBox();
  expect(det.y).toBeGreaterThanOrEqual(list.y + list.height - 1);
  await expect(page.locator("#view-pipeline .p-back")).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 900 });
  const l2 = await page.locator("#view-pipeline .p-list-pane").boundingBox();
  const d2 = await page.locator("#view-pipeline .p-detail-pane").boundingBox();
  expect(d2.x).toBeGreaterThanOrEqual(l2.x + l2.width - 1);
  expect(Math.abs(d2.y - l2.y)).toBeLessThan(40);
  await expect(page.locator(`#view-pipeline .p-item[href="#/pipeline/${ID}"]`)).toHaveAttribute("aria-current", "true");
  // desktop: the list is never clipped or given its own scrollbar, with a role open
  const clip = await page.locator("#view-pipeline .p-list").evaluate((e) => ({ over: e.scrollHeight - e.clientHeight, ov: getComputedStyle(e).overflowY, mh: getComputedStyle(e).maxHeight }));
  expect(clip).toEqual({ over: 0, ov: "visible", mh: "none" });
  expect(await page.locator("#view-pipeline .p-item").count()).toBe(4);
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await page.locator("#view-pipeline .p-detail-pane").boundingBox();
  expect(phone.width).toBeGreaterThan(300);
  expect(page.apiCalls).toEqual([]);
});

test("detail shows the band, the weighted strip, the facts and links to the workspace", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: true, pipeline: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/#/pipeline/${ID}`);
  const d = page.locator("#view-pipeline .p-detail");
  await expect(d.locator(".p-d-title")).toHaveText("Senior Analytics Engineer");
  await expect(d.locator(".p-d-num")).toHaveText("4.2");
  await expect(d.locator('.k-band[data-band="apply"]')).toHaveText("Apply");
  await expect(d.locator(".k-strip")).toHaveAttribute("role", "img");
  await expect(d.locator(".p-fact").nth(2)).toContainText("Sat 21 Nov, 13:00");
  await expect(d.locator('a:has-text("Open workspace")')).toHaveAttribute("href", `#/role/${ID}`);
  // a role evaluated without the full JD links to the workspace to paste it; dates never recorded say so
  await page.goto("/#/pipeline/1700000000204");
  await expect(page.locator("#view-pipeline .p-note")).toContainText("Only part of the job description is saved");
  await expect(page.locator("#view-pipeline .p-fact").nth(1)).toContainText("Not recorded");
});

test("stage select saves through setStage: status, history, appliedAt; nothing else changes; no API call", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: true, pipeline: true });
  await mockApi(page);
  await page.goto("/#/pipeline/1700000000204");
  const before = (await roles(page)).find((r) => r.id === 1700000000204);
  await page.locator("#p-stage").focus();
  await page.locator("#p-stage").selectOption("applied");
  await expect(page.locator("#view-pipeline .p-status")).toHaveText("Stage set to Applied.");
  await expect(page.locator("#p-stage")).toBeFocused();
  const after = (await roles(page)).find((r) => r.id === 1700000000204);
  expect(after.status).toBe("applied");
  expect(after.stageHistory.length).toBe(before.stageHistory.length + 1);
  expect(after.stageHistory.at(-1).status).toBe("applied");
  expect(typeof after.appliedAt).toBe("string");
  expect({ ...after, status: 0, stageHistory: 0, appliedAt: 0 }).toEqual({ ...before, status: 0, stageHistory: 0, appliedAt: 0 });
  // a stage change that is not "applied" does not invent an applied date
  await page.goto("/#/pipeline/1700000000202");
  await page.locator("#p-stage").selectOption("saved");
  const other = (await roles(page)).find((r) => r.id === 1700000000202);
  expect(other.status).toBe("saved");
  expect(other.appliedAt).toBeNull();
  await page.locator("#view-pipeline button:has-text('Stage history')").click();
  await expect(page.locator("dialog.k-modal")).toContainText("Saved");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog.k-modal")).toHaveCount(0);
  expect(page.apiCalls).toEqual([]);
  expect(page.errors).toEqual([]);
});

test("next step saves through updateRole; clearing it stores null, never an empty string", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: true, pipeline: true });
  await page.goto("/#/pipeline/1700000000204");
  await page.locator("#p-next").fill("  Ask the recruiter about salary  ");
  await page.locator("#p-next-at").fill("2026-11-24T10:30");
  await page.locator("#p-interview").fill("2026-11-27T14:00");
  await page.locator('#view-pipeline [data-action="save-next"]').click();
  await expect(page.locator("#view-pipeline .p-status")).toHaveText("Saved.");
  let r = (await roles(page)).find((x) => x.id === 1700000000204);
  expect(r.nextAction).toBe("Ask the recruiter about salary");
  expect(r.nextActionAt).toBe("2026-11-24T10:30:00.000Z");
  expect(r.interviewAt).toBe("2026-11-27T14:00:00.000Z");
  await page.reload();
  await expect(page.locator("#p-next")).toHaveValue("Ask the recruiter about salary");
  await page.locator("#p-next").fill("   ");
  await page.locator("#p-next-at").fill("");
  await page.locator("#p-interview").fill("");
  await page.locator('#view-pipeline [data-action="save-next"]').click();
  r = (await roles(page)).find((x) => x.id === 1700000000204);
  expect([r.nextAction, r.nextActionAt, r.interviewAt]).toEqual([null, null, null]);
  // the saved date shows up on Today
  await page.goto("/#/pipeline");
  expect(page.apiCalls).toEqual([]);
});

test("filter narrows the list and says so when a stage is empty", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: true, pipeline: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#/pipeline");
  await expect(page.locator("#view-pipeline .p-item")).toHaveCount(4);
  await page.locator("#p-filter").selectOption("open");
  await expect(page.locator("#view-pipeline .p-item")).toHaveCount(3);
  await page.locator("#p-filter").selectOption("applied");
  await expect(page.locator("#view-pipeline .p-item")).toHaveCount(1);
  await page.locator("#p-filter").selectOption("offer received");
  await expect(page.locator("#view-pipeline .p-none")).toHaveText("No roles in this stage.");
});

test("Delete is shown paused: banner text, aria-disabled, click/Enter/Space change nothing and send nothing", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: true, pipeline: true });
  await mockApi(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/#/pipeline/${ID}`);
  const del = page.locator('#view-pipeline [data-action="delete-role"]');
  await expect(del).toBeVisible();
  await expect(del).toHaveAttribute("aria-disabled", "true");
  await expect(page.locator("#view-pipeline .paused-banner")).toHaveText("Being rebuilt. Back soon.");
  const describedby = await del.getAttribute("aria-describedby");
  expect(describedby).toBe(await page.locator("#view-pipeline .paused-banner").getAttribute("id"));
  const before = await storageSnapshot(page);
  await del.click({ force: true });
  await del.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(await hash(page)).toBe(`#/pipeline/${ID}`);
  expect(page.apiCalls).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(before);
  expect((await roles(page)).length).toBe(SEED.storage.co_pipeline.length);
});

test("unknown id says so and links back; empty pipeline offers Add role; model text stays text", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { profile: true, pipeline: true });
  await page.goto("/#/pipeline/999");
  await expect(page.locator("#view-pipeline .p-placeholder")).toContainText("Role not found");
  await expect(page.locator('#view-pipeline .p-placeholder a[href="#/pipeline"]')).toBeVisible();

  const evil = { ...SEED.storage.co_pipeline[0], role: '<img src=x onerror="window.__xss=1">Role', company: "<b>Co</b>", nextAction: "<i>x</i>" };
  const p2 = await page.context().newPage();
  await p2.addInitScript((r) => { localStorage.setItem("co_profile", JSON.stringify({ name: "M" })); localStorage.setItem("co_pipeline", JSON.stringify([r])); localStorage.setItem("co_schema", "2"); }, evil);
  await p2.goto("/#/pipeline/" + evil.id);
  await expect(p2.locator("#view-pipeline")).toContainText('<img src=x onerror="window.__xss=1">Role');
  await expect(p2.locator("#view-pipeline img, #view-pipeline b, #view-pipeline i")).toHaveCount(0);
  expect(await p2.evaluate(() => window.__xss)).toBeUndefined();
  await p2.close();

  const p3 = await page.context().newPage();
  await p3.addInitScript(() => {localStorage.setItem("co_profile", JSON.stringify({ name: "M" })); localStorage.removeItem("co_pipeline"); });
  await p3.goto("/#/pipeline");
  await expect(p3.locator("#view-pipeline .p-empty")).toContainText("No roles yet");
  await expect(p3.locator('#view-pipeline .p-empty a[href="#/add"]')).toBeVisible();
  await p3.close();
});

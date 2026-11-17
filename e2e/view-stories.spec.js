// Phase 3D (#31): Story bank (#/stories). Synthetic data only; the API is always mocked (rule 5).
const { test, expect, fx } = require("./helpers");
const { SEED, seedState, mockApi, fixClock, axeCheck, noHorizontalOverflow, storageSnapshot } = require("./phase3-helpers");

const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
const ROLE = SEED.storage.co_pipeline[0]; // "Senior Analytics Engineer", has a linked story in the seed
const watch = (page) => {
  const hosts = new Set();
  page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
  return hosts;
};
const open = async (page, hash = "#/stories") => {
  await page.goto("/" + hash);
  await expect(page.locator("#view-stories h1")).toHaveText("Story bank");
};
const question = (page) => page.getByLabel("Interview question");
const gen = (page) => page.getByRole("button", { name: "Generate STAR+R story" });
const stories = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("co_stories") || "[]"));

for (const [w, h] of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    test(`stories ${w}px ${theme}: axe clean (list and open story), no overflow, same-origin only, no API call`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const hosts = watch(page);
      await fixClock(page);
      await seedState(page, { profile: true, pipeline: true, stories: true, theme });
      await open(page);
      await expect(page.locator("#view-stories .st-card")).toHaveCount(SEED.storage.co_stories.length);
      await axeCheck(page, "#view-stories");
      await noHorizontalOverflow(page);
      for (const b of await page.locator("#view-stories button, #view-stories textarea").all()) {
        if (await b.isVisible()) expect((await b.boundingBox()).height, "touch target").toBeGreaterThanOrEqual(43.5);
      }
      await page.locator("#view-stories .st-card").first().click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await axeCheck(page, "dialog.k-modal");
      expect(page.apiCalls).toEqual([]);
      expect(page.errors).toEqual([]);
      expect([...hosts]).toEqual([new URL(page.url()).host]);
    });
  }
}

test("empty bank: one line on its purpose and one action (first run)", async ({ page }) => {
  await seedState(page, { profile: true });
  await open(page);
  await expect(page.locator("#view-stories").getByText("No stories yet")).toBeVisible();
  await page.getByRole("button", { name: "Write your first story" }).click();
  await expect(question(page)).toBeFocused();
  await axeCheck(page, "#view-stories");
});

test("open a story in the modal: all parts, linked role, Esc closes and focus returns (STORY-03)", async ({ page }) => {
  await seedState(page, { profile: true, pipeline: true, stories: true });
  await open(page);
  const card = page.locator("#view-stories .st-card").first();
  await card.click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByRole("heading", { name: /convince stakeholders/ })).toBeVisible();
  for (const label of ["Situation", "Task", "Action", "Result", "Reflection"]) await expect(dlg.getByRole("heading", { name: label })).toBeVisible();
  await expect(dlg.getByRole("link", { name: /Senior Analytics Engineer at Brightquill/ })).toHaveAttribute("href", `#/role/${ROLE.id}`);
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(card).toBeFocused();
});

test("story text that looks like HTML is shown as text, never as markup", async ({ page }) => {
  const evil = { id: 5, question: '<img src=x onerror="window.__pwned=1">Q', fullStory: "<script>window.__pwned=1</script>text", situation: "<b>bold</b>", tags: ["<i>t</i>"], roleIds: [] };
  await seedState(page, { profile: true, stories: [evil] });
  await open(page);
  await expect(page.locator("#view-stories .st-card-q")).toHaveText('<img src=x onerror="window.__pwned=1">Q');
  await page.locator("#view-stories .st-card").click();
  await expect(page.getByRole("dialog")).toContainText("<script>window.__pwned=1</script>text");
  expect(await page.locator("#view-stories img, dialog img, dialog script, dialog b, dialog i").count()).toBe(0);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test("delete asks first, then removes the story (STORY-04); Keep it changes nothing", async ({ page }) => {
  await seedState(page, { profile: true, pipeline: true, stories: true });
  await open(page);
  await page.locator("#view-stories .st-card").first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: "Delete story" }).click();
  await expect(dlg.getByText("Delete this story? This cannot be undone.")).toBeVisible();
  const before = await storageSnapshot(page);
  await dlg.getByRole("button", { name: "Keep it" }).click();
  expect(await storageSnapshot(page)).toEqual(before);
  await dlg.getByRole("button", { name: "Delete story" }).click();
  await dlg.locator('[data-action="confirm-delete"]').click();
  await expect(dlg).toHaveCount(0);
  const left = await stories(page);
  expect(left).toHaveLength(SEED.storage.co_stories.length - 1);
  expect(left.some((s) => s.id === SEED.storage.co_stories[0].id)).toBe(false);
  await expect(page.locator("#view-stories .st-card")).toHaveCount(left.length);
  expect(page.apiCalls).toEqual([]);
});

test("generate: one story call, saved with no role link, form cleared, list updated (STORY-01)", async ({ page }) => {
  await seedState(page, { profile: true });
  await mockApi(page);
  await open(page);
  await question(page).fill("Tell me about a time you changed a metric definition.");
  await page.getByLabel("Context (optional)").fill("Use the SYNTHETIC semantic layer work.");
  await gen(page).click();
  await expect(page.locator("#view-stories .st-saved")).toContainText("Story saved");
  expect(page.apiCalls).toEqual(["story"]);
  expect(page.apiBodies[0].content).toBe("Tell me about a time you changed a metric definition.\n\nContext: Use the SYNTHETIC semantic layer work.");
  expect(Object.keys(page.apiBodies[0]).sort()).toEqual(["content", "cv", "mode", "profile"]);
  const saved = await stories(page);
  expect(saved).toHaveLength(1);
  expect(saved[0].question).toBe(fx("story.json").response.data.question);
  expect(saved[0].roleIds).toEqual([]);
  await expect(question(page)).toHaveValue("");
  await expect(page.locator("#view-stories .st-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Read it" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(page.errors).toEqual([]);
});

test("from a role: ?role=<id>&q=<text> pre-fills the question and links the new story to that role", async ({ page }) => {
  await seedState(page, { profile: true, pipeline: true, stories: true });
  await mockApi(page);
  const q = "Describe a conflict with a stakeholder.";
  await open(page, `#/stories?role=${ROLE.id}&q=${encodeURIComponent(q)}`);
  await expect(question(page)).toHaveValue(q);
  await expect(page.locator("#view-stories .st-link-note")).toContainText("linked to Senior Analytics Engineer at Brightquill");
  await gen(page).click();
  await expect(page.locator("#view-stories .st-saved")).toBeVisible();
  const list = await stories(page);
  expect(list).toHaveLength(SEED.storage.co_stories.length + 1);
  expect(list[0].roleIds).toEqual([ROLE.id]);
  await expect(page.locator("#view-stories .st-link-note")).toBeHidden();
});

test("an unknown role in the link is ignored (no link, no note)", async ({ page }) => {
  await seedState(page, { profile: true, pipeline: true });
  await open(page, "#/stories?role=999&q=Hello");
  await expect(question(page)).toHaveValue("Hello");
  await expect(page.locator("#view-stories .st-link-note")).toBeHidden();
});

test("generate: {raw} shows an error and saves no blank card (BUG-01)", async ({ page }) => {
  await seedState(page, { profile: true, stories: true });
  await mockApi(page, { story: { raw: true } });
  await open(page);
  const before = await storageSnapshot(page);
  await question(page).fill("Tell me about a failure.");
  await gen(page).click();
  await expect(page.locator("#view-stories .k-tool-error")).toContainText("could not be read");
  expect(await storageSnapshot(page)).toEqual(before);
  expect(page.apiCalls).toEqual(["story"]);
  await expect(question(page)).toHaveValue("Tell me about a failure.");
});

test("generate: a 500 makes exactly one call, shows an error, saves nothing", async ({ page }) => {
  await seedState(page, { profile: true, stories: true });
  await mockApi(page, { story: { status: 500 } });
  await open(page);
  const before = await storageSnapshot(page);
  await question(page).fill("Tell me about a failure.");
  await gen(page).click();
  await expect(page.locator("#view-stories .k-tool-error")).toContainText("server could not finish");
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(await storageSnapshot(page)).toEqual(before);
  expect(page.apiCalls).toEqual(["story"]);
});

test("generate: no CV makes no call and points to Profile (BUG-05)", async ({ page }) => {
  await seedState(page, { profile: { name: "Pat Placeholder (SYNTHETIC)" } });
  await mockApi(page);
  await open(page);
  const before = await storageSnapshot(page);
  await question(page).fill("Tell me about a failure.");
  await gen(page).click();
  await expect(page.getByRole("link", { name: "Add your CV in Profile" })).toHaveAttribute("href", "#/profile");
  expect(await storageSnapshot(page)).toEqual(before);
  expect(page.apiCalls).toEqual([]);
});

test("generate: an empty question makes no call", async ({ page }) => {
  await seedState(page, { profile: true });
  await mockApi(page);
  await open(page);
  await gen(page).click();
  await expect(page.locator("#view-stories .k-tool-error")).toContainText("Nothing to send");
  expect(page.apiCalls).toEqual([]);
});

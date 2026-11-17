// Phase 3B (#29): role workspace #/role/:id/:tab. Mocked API (tests/fixtures/api), synthetic data only (rule 15).
const fs = require("node:fs");
const path = require("node:path");
const { test, expect, fx } = require("./helpers");
const { SEED, seedState, mockApi, fixClock, axeCheck, noHorizontalOverflow, storageSnapshot } = require("./phase3-helpers");

const EDGE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "views", "role-edge-cases.json"), "utf8"));
const ROLE = SEED.storage.co_pipeline[0]; // complete JD, full evaluation, one linked story
const CUT = SEED.storage.co_pipeline.find((r) => r.jdComplete === false);
const TABS = ["fit", "cv", "research", "outreach", "interview", "negotiate"];
const TOOLS = [
  { tab: "cv", mode: "pdf", action: "run-cv", result: "Your tailored CV" },
  { tab: "research", mode: "research", action: "run-research", result: "Brightquill Labs GmbH" },
  { tab: "outreach", mode: "contacto", action: "run-outreach", result: "Your messages" },
  { tab: "negotiate", mode: "negotiate", action: "run-negotiate", result: "Your negotiation script" },
];
const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
const view = (page) => page.locator("#view-role");
const open = async (page, id, tab = "fit") => {
  await page.goto(`/#/role/${id}${tab === "fit" ? "" : "/" + tab}`);
  await expect(view(page).locator(".role-view")).toBeVisible();
};
const run = (page, action) => page.click(`#view-role [data-action="${action}"]`);
const errorBox = (page) => view(page).locator(".k-tool-error");

async function setup(page, { profile = true, pipeline = true, stories = true, theme, api = {} } = {}) {
  await fixClock(page);
  await seedState(page, { profile, pipeline, stories, theme });
  await mockApi(page, api);
}

// ---------- every tab, every width, both themes ----------
for (const [w, h] of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    test(`all tabs and tool results: axe, no overflow, exact API calls at ${w}px ${theme}`, async ({ page }) => {
      test.setTimeout(90000);
      await page.setViewportSize({ width: w, height: h });
      await setup(page, { theme });
      const hosts = new Set();
      page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
      for (const tab of TABS) {
        await open(page, ROLE.id, tab);
        await expect(view(page).locator(`.role-tab[data-tab="${tab}"]`)).toHaveAttribute("aria-current", "page");
        await axeCheck(page, "#view-role");
        await noHorizontalOverflow(page);
      }
      expect(page.apiCalls).toEqual([]);
      for (const t of TOOLS) {
        await open(page, ROLE.id, t.tab);
        await run(page, t.action);
        await expect(view(page).locator(".role-result")).toContainText(t.result);
        await axeCheck(page, "#view-role");
        await noHorizontalOverflow(page);
      }
      expect(page.apiCalls).toEqual(TOOLS.map((t) => t.mode));
      expect(page.errors).toEqual([]);
      expect([...hosts]).toEqual(["127.0.0.1:4173"]);
    });
  }
}

// ---------- header, routing, not found ----------
test("header shows role, company, grade medal, score and band; tabs are links with aria-current", async ({ page }) => {
  await setup(page);
  await open(page, ROLE.id);
  await expect(view(page).locator("h1")).toHaveText(ROLE.role);
  await expect(view(page).locator(".role-sub")).toContainText(ROLE.company);
  await expect(view(page).locator(".role-head .grade-chip")).toHaveText("A-");
  await expect(view(page).locator(".role-head .grade-chip")).toHaveClass(/grade-chip--silver/);
  await expect(view(page).locator(".role-head-num")).toHaveText("4.2");
  await expect(view(page).locator(".role-head .k-band")).toHaveText("Apply");
  await view(page).locator('.role-tab[data-tab="research"]').click();
  await expect(page).toHaveURL(new RegExp(`#/role/${ROLE.id}/research$`));
  await expect(view(page).locator("#role-research-company")).toHaveValue(ROLE.company);
  await expect(view(page).locator('.role-tab[data-tab="research"]')).toBeFocused();
  expect(page.apiCalls).toEqual([]);
  expect(page.errors).toEqual([]);
});

test("unknown role id shows Role not found with a way back to the pipeline", async ({ page }) => {
  await setup(page);
  await page.goto("/#/role/424242/cv");
  await expect(view(page)).toContainText("Role not found");
  await expect(view(page).locator('a[href="#/pipeline"]')).toBeVisible();
  await axeCheck(page, "#view-role");
  expect(page.apiCalls).toEqual([]);
});

// ---------- Fit and Interview ----------
test("Fit: all 10 dimensions, strip, gaps, blocks A-E, STAR starters, red flags and keywords from fullData", async ({ page }) => {
  await setup(page);
  await open(page, ROLE.id);
  const v = view(page);
  await expect(v.locator(".k-fit-dim")).toHaveCount(10);
  await expect(v.locator(".k-strip[role=img]")).toHaveCount(1);
  await expect(v.locator(".k-fit-gap")).toHaveCount(ROLE.fullData.gaps.length);
  for (const t of ["A · Role summary", "B · CV match", "C · Level strategy", "D · Pay", "E · Why you"]) await expect(v.getByRole("heading", { name: t })).toBeVisible();
  await expect(v.locator(".role-qa-q").first()).toHaveText(ROLE.fullData.starStories[0].question);
  await expect(v.getByRole("heading", { name: "Red-flag questions to ask" })).toBeVisible();
  await expect(v.locator(".role-chip")).toHaveCount(new Set(ROLE.fullData.keywords).size);
  expect(page.apiCalls).toEqual([]);
});

test("Fit: a role saved without fullData shows its score and says the details are missing", async ({ page }) => {
  await setup(page, { pipeline: [EDGE.noFullData] });
  await open(page, EDGE.noFullData.id);
  await expect(view(page).locator(".k-fit-num")).toHaveText("3.1");
  await expect(view(page).locator(".role-note")).toContainText("saved without its full evaluation");
  await axeCheck(page, "#view-role");
  expect(page.errors).toEqual([]);
});

test("Interview: starters link to the Story bank with role and question; linked stories are listed", async ({ page }) => {
  await setup(page);
  await open(page, ROLE.id, "interview");
  const v = view(page);
  const q = ROLE.fullData.starStories[0].question;
  const link = v.locator(".role-qa-item").first().getByRole("link", { name: "Write this story" });
  const href = await link.getAttribute("href");
  const params = new URLSearchParams(href.split("?")[1]);
  expect(href.startsWith("#/stories?")).toBe(true);
  expect(params.get("role")).toBe(String(ROLE.id));
  expect(params.get("q")).toBe(q);
  const story = SEED.storage.co_stories.find((s) => (s.roleIds || []).includes(ROLE.id));
  await expect(v.locator(".role-story-q")).toHaveText([story.question]);
  await v.locator(".role-story-q").click();
  await expect(v.locator(".role-story-part").first()).toContainText("Situation");
  await expect(v.getByRole("heading", { name: "Questions to ask them" })).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/#\/stories\?role=/);
  expect(page.apiCalls).toEqual([]);
});

// ---------- tools: payloads ----------
test("every tool sends the pre-filled JD/company once, with the minimal payload", async ({ page }) => {
  await setup(page);
  for (const t of TOOLS) {
    await open(page, ROLE.id, t.tab);
    await run(page, t.action);
    await expect(view(page).locator(".role-result")).toContainText(t.result);
  }
  expect(page.apiCalls).toEqual(["pdf", "research", "contacto", "negotiate"]);
  const [pdf, research, contacto, negotiate] = page.apiBodies;
  expect(pdf.content).toBe(ROLE.jd);
  expect(Object.keys(pdf).sort()).toEqual(["content", "cv", "mode", "profile"]);
  expect(Object.keys(pdf.profile).sort()).toEqual(["location", "name", "salary", "story", "target"]);
  expect(research).toEqual({ mode: "research", content: `Research: ${ROLE.company}` });
  expect(contacto.content).toBe(ROLE.jd);
  expect(negotiate.content).toBe([
    "Scenario: Counter initial offer", "Their offer: ", `Target: ${SEED.storage.co_profile.salary}`, "Competing offer: ",
    `Context: Role: ${ROLE.role} at ${ROLE.company}, ${ROLE.location}.`,
  ].join("\n"));
  expect(page.errors).toEqual([]);
});

test("Negotiate: scenario and fields go into the script request (NEG-01...06)", async ({ page }) => {
  await setup(page);
  await open(page, ROLE.id, "negotiate");
  await expect(view(page).locator("#role-neg-scenario option")).toHaveCount(5);
  await page.selectOption("#role-neg-scenario", "Equity vs cash tradeoff");
  await page.fill("#role-neg-offer", "EUR 70,000");
  await page.fill("#role-neg-competing", "EUR 80,000 elsewhere");
  await run(page, "run-negotiate");
  await expect(view(page).locator(".role-result")).toContainText("Email draft");
  expect(page.apiBodies[0].content).toContain("Scenario: Equity vs cash tradeoff\nTheir offer: EUR 70,000\n");
  expect(page.apiBodies[0].content).toContain("Competing offer: EUR 80,000 elsewhere\n");
});

test("Outreach: 200/300 counter and Copy note copies the raw note (OUT-02/03)", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page);
  await open(page, ROLE.id, "outreach");
  await page.fill("#role-outreach-target", "the data platform hiring manager");
  await run(page, "run-outreach");
  const note = fx("contacto.json").response.data.connectionNote;
  await expect(view(page).locator(".role-counter")).toHaveAttribute("data-fit", "premium");
  await expect(view(page).locator(".role-counter-num")).toHaveText(`${[...note].length} / 300`);
  await view(page).getByRole("button", { name: "Copy connection note" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(note);
  expect(page.apiBodies[0].content).toBe(`${ROLE.jd}\n\nReaching out to: the data platform hiring manager`);
});

test("Tailored CV: contact, education, languages and skills (object shape); copy sections; Download PDF window", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await setup(page, { api: { pdf: "pdf-skills-object.json" } });
  await open(page, ROLE.id, "cv");
  await run(page, "run-cv");
  const doc = view(page).locator(".role-cv-doc");
  await expect(doc.locator(".role-cv-name")).toHaveText("Mira Testwell");
  await expect(doc.locator('.role-cv-contact [data-kind="email"]')).toHaveText("mira.testwell@example.invalid");
  await expect(doc.locator('.role-cv-contact [data-kind="phone"]')).toHaveCount(0);
  await expect(doc).toContainText("MSc Applied Statistics");
  await expect(doc).toContainText("Dutch (B2)");
  await expect(doc).toContainText("SQL · dbt · Snowflake");
  await expect(doc).not.toContainText("[object Object]");
  await view(page).getByRole("button", { name: "Copy Skills" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("SQL, dbt, Snowflake");
  const [popup] = await Promise.all([page.waitForEvent("popup"), view(page).locator('[data-action="cv-download"]').click()]);
  await expect(popup.locator(".role-cv-name")).toHaveText("Mira Testwell");
  await popup.close();
  expect(page.apiCalls).toEqual(["pdf"]);
  expect(page.errors).toEqual([]);
});

test("results stay in memory across tab switches and are never written to storage", async ({ page }) => {
  await setup(page);
  await open(page, ROLE.id, "research");
  const before = await storageSnapshot(page);
  await run(page, "run-research");
  await expect(view(page).locator(".role-verdict-card")).toBeVisible();
  await view(page).locator('.role-tab[data-tab="fit"]').click();
  await view(page).locator('.role-tab[data-tab="research"]').click();
  await expect(view(page).locator(".role-verdict-card")).toBeVisible();
  expect(page.apiCalls).toEqual(["research"]);
  expect(await storageSnapshot(page)).toEqual(before);
});

// ---------- tools: failure cases (spec §9) ----------
for (const t of TOOLS) {
  test(`${t.tab}: {raw} reply shows an error, 1 call, storage unchanged`, async ({ page }) => {
    await setup(page, { api: { [t.mode]: { raw: true } } });
    await open(page, ROLE.id, t.tab);
    const before = await storageSnapshot(page);
    await run(page, t.action);
    await expect(errorBox(page)).toContainText("could not be read");
    await expect(errorBox(page).getByRole("button", { name: "Try again" })).toBeVisible();
    expect(page.apiCalls).toEqual([t.mode]);
    expect(await storageSnapshot(page)).toEqual(before);
    expect(page.errors).toEqual([]);
  });

  test(`${t.tab}: truncated {raw} reply says it was cut off`, async ({ page }) => {
    await setup(page, { api: { [t.mode]: { raw: true, truncated: true } } });
    await open(page, ROLE.id, t.tab);
    await run(page, t.action);
    await expect(errorBox(page)).toContainText("cut off");
    expect(page.apiCalls).toEqual([t.mode]);
  });

  test(`${t.tab}: HTTP 500 shows an error after exactly 1 call, storage unchanged`, async ({ page }) => {
    await setup(page, { api: { [t.mode]: { status: 500 } } });
    await open(page, ROLE.id, t.tab);
    const before = await storageSnapshot(page);
    await run(page, t.action);
    await expect(errorBox(page)).toContainText("server could not finish");
    expect(page.apiCalls).toEqual([t.mode]);
    expect(await storageSnapshot(page)).toEqual(before);
    expect(page.errors).toEqual([]);
  });

  test(`${t.tab}: a refusal shows the model's message as text, storage unchanged`, async ({ page }) => {
    const message = "SYNTHETIC refusal <img src=x onerror=\"window.__pwned=1\">";
    await setup(page, { api: { [t.mode]: { json: { success: true, data: { error: "missing_candidate_data", message } } } } });
    await open(page, ROLE.id, t.tab);
    const before = await storageSnapshot(page);
    await run(page, t.action);
    await expect(errorBox(page)).toHaveText(message);
    expect(await view(page).locator(".k-tool-error img").count()).toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    expect(page.apiCalls).toEqual([t.mode]);
    expect(await storageSnapshot(page)).toEqual(before);
  });
}

for (const t of TOOLS.filter((x) => x.mode !== "research")) {
  test(`${t.tab}: empty profile (no CV) sends nothing and links to Profile`, async ({ page }) => {
    await setup(page, { profile: { ...SEED.storage.co_profile, cv: "" } });
    await open(page, ROLE.id, t.tab);
    const before = await storageSnapshot(page);
    await run(page, t.action);
    await expect(errorBox(page)).toContainText("Add your CV in Profile");
    await expect(errorBox(page).locator('a[href="#/profile"]')).toBeVisible();
    expect(page.apiCalls).toEqual([]);
    expect(await storageSnapshot(page)).toEqual(before);
  });
}

test("research: an empty company name sends nothing", async ({ page }) => {
  await setup(page);
  await open(page, ROLE.id, "research");
  await page.fill("#role-research-company", "   ");
  await run(page, "run-research");
  await expect(errorBox(page)).toContainText("Nothing to send yet");
  expect(page.apiCalls).toEqual([]);
});

// ---------- paused actions (spec §7) ----------
test("paused: archetype choice and Full preview show the banner, are aria-disabled and send nothing", async ({ page }) => {
  await setup(page);
  await open(page, ROLE.id, "cv");
  const before = await storageSnapshot(page);
  const arch = view(page).locator("#role-cv-archetype");
  await expect(arch).toHaveAttribute("aria-disabled", "true");
  await expect(view(page).locator("#paused-cv-archetype")).toHaveText("Being rebuilt. Back soon.");
  await expect(arch).toHaveAttribute("aria-describedby", /paused-cv-archetype/);
  await arch.click({ force: true });
  await arch.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  expect(page.apiCalls).toEqual([]);

  await run(page, "run-cv");
  await expect(view(page).locator(".role-cv-doc")).toBeVisible();
  const full = view(page).locator('[data-action="cv-full-preview"]');
  await expect(full).toHaveAttribute("aria-disabled", "true");
  await expect(view(page).locator("#paused-cv-fullPreview")).toHaveText("Being rebuilt. Back soon.");
  let popups = 0;
  page.on("popup", () => popups++);
  await full.click({ force: true });
  await full.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await page.waitForTimeout(200);
  expect(popups).toBe(0);
  expect(page.apiCalls).toEqual(["pdf"]);
  expect(await storageSnapshot(page)).toEqual(before);
});

// ---------- one-time full JD box (schema v2 jdComplete === false) ----------
test("a role with a cut JD asks once for the full JD; saving stores it and every tool uses it", async ({ page }) => {
  await setup(page);
  await open(page, CUT.id, "outreach");
  const box = view(page).locator(".role-jd-box");
  await expect(box).toBeVisible();
  await axeCheck(page, "#view-role");
  const before = await storageSnapshot(page);
  await box.getByRole("button", { name: "Save full job description" }).click();
  await expect(box.locator(".role-inline-msg")).toHaveText("Paste the job description first.");
  expect(await storageSnapshot(page)).toEqual(before);
  const full = `${CUT.jd}\n\nSYNTHETIC rest of the job description, now complete.`;
  await page.fill("#role-full-jd", full);
  await box.getByRole("button", { name: "Save full job description" }).click();
  await expect(view(page).locator(".role-jd-box")).toHaveCount(0);
  const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem("co_pipeline")).find((r) => r.id === id), CUT.id);
  expect(saved.jd).toBe(full);
  expect(saved.jdComplete).toBe(true);
  await expect(view(page).locator("#role-outreach-jd")).toHaveValue(full);
  await page.reload();
  await expect(view(page).locator(".role-view")).toBeVisible();
  await expect(view(page).locator(".role-jd-box")).toHaveCount(0);
  expect(page.apiCalls).toEqual([]);
});

test("roles with a complete JD never show the JD box", async ({ page }) => {
  await setup(page);
  for (const tab of TABS) {
    await open(page, ROLE.id, tab);
    await expect(view(page).locator(".role-jd-box")).toHaveCount(0);
  }
});

// ---------- escaping ----------
test("hostile model text in a saved role and in tool replies renders as text only", async ({ page }) => {
  const evil = '<img src=x onerror="window.__pwned=1">';
  await setup(page, {
    pipeline: [EDGE.hostile],
    api: {
      pdf: { json: { success: true, data: { name: evil, summary: evil, linkedin: "javascript:window.__pwned=1", experience: [{ role: evil, company: "<script>window.__pwned=1</script>", bullets: [evil] }], skills: { a: [evil] }, languages: [{ lang: evil, level: "C2" }], education: [{ degree: evil, institution: "x" }] } } },
      research: { json: { success: true, data: { company: evil, overview: evil, verdict: evil, aiScore: evil } } },
      contacto: { json: { success: true, data: { connectionNote: evil, inMailBody: evil, tips: [evil] } } },
      negotiate: { json: { success: true, data: { opening: evil, emailSubject: evil, emailBody: evil, tips: [evil] } } },
    },
  });
  for (const tab of TABS) {
    await open(page, EDGE.hostile.id, tab);
    const t = TOOLS.find((x) => x.tab === tab);
    if (t) {
      await run(page, t.action);
      await expect(view(page).locator(".role-result")).toContainText(evil);
    }
    expect(await view(page).locator("img, script, b, a[href^='javascript']").count()).toBe(0);
  }
  await open(page, EDGE.hostile.id);
  await expect(view(page).locator("h1")).toHaveText(EDGE.hostile.role);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(page.errors).toEqual([]);
});

// Phase 3D (#31): Profile & CV screen (#/profile). Synthetic data only (rule 15). No model call exists on this screen,
// so every test also asserts page.apiCalls is empty.
const { test, expect } = require("./helpers");
const { SEED, seedState, fixClock, axeCheck, noHorizontalOverflow, storageSnapshot } = require("./phase3-helpers");

const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
// The app origin is whatever baseURL points at (CI: 127.0.0.1:4173).
const watch = (page) => {
  const hosts = new Set();
  page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
  return hosts;
};
const open = async (page) => {
  await page.goto("/#/profile");
  await expect(page.locator("#view-profile h1")).toHaveText("Profile & CV");
};

// A tiny valid PDF whose only text is a synthetic line, built here so no binary fixture is committed.
function syntheticPdf(line) {
  const stream = `BT /F1 14 Tf 20 100 Td (${line}) Tj ET`;
  const objs = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`,
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
  ];
  let out = "%PDF-1.4\n";
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<</Root 1 0 R/Size ${objs.length + 1}>>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

for (const [w, h] of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    test(`profile ${w}px ${theme}: axe clean, no overflow, same-origin only, no API call`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const hosts = watch(page);
      await fixClock(page);
      await seedState(page, { profile: true, pipeline: true, stories: true, theme });
      await open(page);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await axeCheck(page, "#view-profile");
      await noHorizontalOverflow(page);
      for (const b of await page.locator("#view-profile button, #view-profile input:not([hidden]), #view-profile textarea").all()) {
        if (!(await b.isVisible())) continue;
        const box = await b.boundingBox();
        expect(box.height, "touch target height").toBeGreaterThanOrEqual(43.5);
      }
      expect(page.apiCalls).toEqual([]);
      expect(page.errors).toEqual([]);
      expect([...hosts]).toEqual([new URL(page.url()).host]);
    });
  }
}

test("fields show the saved profile; edit and save persists (PROF-01, PROF-04, PROF-05) and keeps other stored fields", async ({ page }) => {
  await seedState(page, { profile: { ...SEED.storage.co_profile, extraKey: "kept" } });
  await open(page);
  await expect(page.getByLabel("Name")).toHaveValue(SEED.storage.co_profile.name);
  await expect(page.getByLabel("Target role")).toHaveValue("Analytics Engineer");
  await expect(page.getByLabel("CV text")).toHaveValue(SEED.storage.co_profile.cv);
  await page.getByLabel("Name").fill("Mira Testwell (SYNTHETIC) edited");
  await page.getByLabel("Apply line (minimum score)").fill("3.5");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("#view-profile .pf-save-status")).toContainText("Profile saved");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("co_profile")));
  expect(saved.name).toBe("Mira Testwell (SYNTHETIC) edited");
  expect(saved.minscore).toBe("3.5");
  expect(saved.cv).toBe(SEED.storage.co_profile.cv);
  expect(saved.extraKey).toBe("kept");
  await page.reload();
  await expect(page.getByLabel("Name")).toHaveValue("Mira Testwell (SYNTHETIC) edited");
  await expect(page.getByLabel("Apply line (minimum score)")).toHaveValue("3.5");
  expect(page.apiCalls).toEqual([]);
  expect(page.errors).toEqual([]);
});

test("a bad apply line shows an error and saves nothing", async ({ page }) => {
  await seedState(page, { profile: true });
  await open(page);
  const before = await storageSnapshot(page);
  for (const bad of ["9", "abc", "0.5"]) {
    await page.getByLabel("Apply line (minimum score)").fill(bad);
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.locator("#view-profile .pf-error")).toBeVisible();
    await expect(page.locator("#view-profile .pf-error")).toContainText("from 1.0 to 5.0");
    await expect(page.getByLabel("Apply line (minimum score)")).toHaveAttribute("aria-invalid", "true");
    expect(await storageSnapshot(page)).toEqual(before);
  }
  await page.getByLabel("Apply line (minimum score)").fill("");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.locator("#view-profile .pf-error")).toBeHidden();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("co_profile")))).minscore).toBe("");
});

test("an empty profile opens empty, saves a first profile, and offers the next step (first run)", async ({ page }) => {
  await open(page);
  await expect(page.getByLabel("CV text")).toHaveValue("");
  expect(await page.evaluate(() => localStorage.getItem("co_profile"))).toBeNull();
  await page.getByLabel("Name").fill("Pat Placeholder (SYNTHETIC)");
  await page.getByLabel("CV text").fill("SYNTHETIC CV line one.\nSYNTHETIC CV line two.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("link", { name: "Add your first role" })).toHaveAttribute("href", "#/add");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("co_profile")));
  expect(saved.cv).toBe("SYNTHETIC CV line one.\nSYNTHETIC CV line two.");
  expect(page.apiCalls).toEqual([]);
});

test("the CV counter warns above 50,000 characters", async ({ page }) => {
  await open(page);
  await page.getByLabel("CV text").fill("x".repeat(50001));
  await expect(page.locator("#view-profile .pf-count")).toContainText("Over the 50,000 limit");
  await page.getByLabel("CV text").fill("short");
  await expect(page.locator("#view-profile .pf-count")).toHaveText("5 of 50,000 characters");
});

test("PDF upload fills the CV text, saves nothing until Save (PROF-02), and a non-PDF is refused", async ({ page }) => {
  await seedState(page, { profile: { name: "Pat Placeholder (SYNTHETIC)" } });
  await open(page);
  const before = await storageSnapshot(page);
  await page.locator("#view-profile .pf-file").setInputFiles({ name: "cv.pdf", mimeType: "application/pdf", buffer: syntheticPdf("SYNTHETIC upload test line") });
  await expect(page.getByLabel("CV text")).toHaveValue(/SYNTHETIC upload test line/, { timeout: 15000 });
  await expect(page.locator("#view-profile .pf-card .pf-status").first()).toContainText("CV text read from the PDF");
  expect(await storageSnapshot(page)).toEqual(before);
  await page.getByRole("button", { name: "Save profile" }).click();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem("co_profile")))).cv).toContain("SYNTHETIC upload test line");
  await page.locator("#view-profile .pf-file").setInputFiles({ name: "cv.txt", mimeType: "text/plain", buffer: Buffer.from("not a pdf") });
  await expect(page.locator("#view-profile .pf-status--error")).toContainText("not a PDF");
  expect(page.apiCalls).toEqual([]);
  expect(page.errors).toEqual([]);
});

test("a PDF without readable text shows an error and leaves the CV untouched", async ({ page }) => {
  await seedState(page, { profile: { cv: "SYNTHETIC existing CV" } });
  await open(page);
  await page.locator("#view-profile .pf-file").setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 this is not a real pdf") });
  await expect(page.locator("#view-profile .pf-status--error")).toContainText("Could not read text");
  await expect(page.getByLabel("CV text")).toHaveValue("SYNTHETIC existing CV");
});

test("Light | Dark switches the theme and saves it in co_theme (design §5)", async ({ page }) => {
  await seedState(page, { profile: true, theme: "light" });
  await open(page);
  const seg = page.getByRole("radiogroup", { name: "Theme" });
  await expect(seg.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  await seg.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("co_theme"))).toBe('"dark"');
  await expect(seg.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
});

test("storage meter shows usage and warns at 80% (build-plan §3a)", async ({ page }) => {
  await seedState(page, { profile: true, pipeline: true, stories: true });
  await open(page);
  const meter = page.getByRole("meter", { name: "Browser storage used" });
  await expect(meter).toBeVisible();
  await expect(page.locator("#view-profile .pf-warn")).toHaveCount(0);
  await page.evaluate(() => localStorage.setItem("co_ballast", "x".repeat(2_000_000)));
  await page.reload();
  await expect(page.locator("#view-profile .pf-warn")).toContainText("% full");
  expect(Number(await meter.getAttribute("aria-valuenow"))).toBeGreaterThanOrEqual(80);
  await axeCheck(page, "#view-profile");
});

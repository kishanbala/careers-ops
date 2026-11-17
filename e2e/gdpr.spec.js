const { test, expect } = require("./helpers");

test("page load makes only same-origin requests; PDF.js and fonts are local", async ({ page }) => {
  const hosts = new Set();
  page.on("request", (r) => hosts.add(new URL(r.url()).host));
  const fonts = [];
  page.on("response", (r) => r.url().includes("/fonts/") && fonts.push(r.status()));
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  expect([...hosts]).toEqual(["127.0.0.1:4173"]);
  expect(await page.evaluate(() => typeof pdfjsLib)).toBe("object");
  expect(await page.evaluate(() => pdfjsLib.GlobalWorkerOptions.workerSrc)).toContain("/vendor/pdfjs/");
  expect(fonts.length).toBeGreaterThan(0);
  expect(fonts.every((s) => s === 200)).toBe(true);
});

test("privacy notice opens and names Vercel and Anthropic", async ({ page }) => {
  await page.goto("/privacy.html");
  await expect(page.locator("body")).toContainText("Vercel");
  await expect(page.locator("body")).toContainText("Anthropic");
});

// Phase 4A (#39): the global "Privacy notice" link moved into the site footer (siteFooter), mounted once on every screen.
test("Privacy link is visible and works at phone, tablet and desktop widths", async ({ page }) => {
  for (const [w, h] of [[390, 844], [820, 1180], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.locator(".view.active")).toHaveCount(1);
    await expect(page.locator(".k-site-footer")).toHaveCount(1);
    const link = page.locator(".k-site-footer").getByRole("link", { name: "Privacy" });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/privacy.html");
    await page.screenshot({ path: `e2e-results/shots/privacy-link-${w}.png` });
  }
  await page.locator(".k-site-footer").getByRole("link", { name: "Privacy" }).click();
  await expect(page).toHaveURL(/\/privacy\.html$/);
  await expect(page.locator("body")).toContainText("Anthropic");
});

test("the site footer (attribution, Privacy, hidden Impressum slot) is on every screen, once", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("co_profile", JSON.stringify({ name: "SYNTHETIC", cv: "SYNTHETIC CV" })));
  for (const hash of ["#/home", "#/today", "#/pipeline", "#/add", "#/add/several", "#/add/scan", "#/stories", "#/profile", "#/role/999"]) {
    await page.goto("/" + hash);
    await expect(page.locator(".view.active")).toHaveCount(1);
    const footer = page.locator(".k-site-footer");
    await expect(footer, hash).toHaveCount(1);
    await expect(footer).toContainText("Evaluation method adapted from santifer/career-ops (MIT)");
    await expect(footer.locator("a")).toHaveCount(1); // Privacy only: the Impressum slot stays hidden while IMPRESSUM_URL is null
    await expect(page.getByRole("link", { name: "Privacy notice" })).toHaveCount(0); // the old global link is gone
  }
  expect(page.errors).toEqual([]);
});

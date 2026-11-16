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

test("Privacy link is visible and works at phone, tablet and desktop widths", async ({ page }) => {
  for (const [w, h] of [[390, 844], [820, 1180], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    const link = page.getByRole("link", { name: "Privacy notice" });
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await page.screenshot({ path: `e2e-results/shots/privacy-link-${w}.png` });
  }
});

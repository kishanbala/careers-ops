// Phase 2A: theme behaviour. Colours/fonts/contrast and theme state only; no layout or routes (those are 2B's).
// index.html is owned by 2B, so the boot script and the toggle are exercised through the module APIs:
//  - theme-boot.js is injected as an init script (same code a <script src> would run before first paint);
//  - the toggle is mounted into a throwaway element via the real theme.js module.
const fs = require("node:fs");
const path = require("node:path");
const AxeBuilder = require("@axe-core/playwright").default;
const { test, expect, profile, fx } = require("./helpers");

const BOOT = fs.readFileSync(path.join(__dirname, "..", "public", "js", "theme-boot.js"), "utf8");
const evalData = fx("evaluate.json").response.data;
const PIPELINE = [
  { id: 1700000000001, role: evalData.roleTitle, company: evalData.company, score: evalData.finalScore, grade: "A", match: evalData.matchPercent, archetype: evalData.archetype, location: evalData.jobLocation, status: "applied", date: "2026-11-10T12:00:00.000Z", fullData: evalData, jd: "SYNTHETIC JD" },
  { id: 1700000000002, role: "Fictional Role B", company: "Fictional Co B", score: 4.2, grade: "A-", match: 90, archetype: "x", location: "Remote", status: "interviewing", date: "2026-11-05T12:00:00.000Z", jd: "SYNTHETIC JD" },
  { id: 1700000000003, role: "Fictional Role C", company: "Fictional Co C", score: 3.8, grade: "B+", match: 70, archetype: "x", location: "Remote", status: "saved", date: "2026-11-01T12:00:00.000Z", jd: "SYNTHETIC JD" },
  { id: 1700000000004, role: "Fictional Role D", company: "Fictional Co D", score: 2.1, grade: "D", match: 40, archetype: "x", location: "Remote", status: "rejected", date: "2026-10-28T12:00:00.000Z", jd: "SYNTHETIC JD" },
];

// An init script can run before <html> exists; a real <script> in <head> cannot. Wait for the element, same code.
const WRAPPED_BOOT = `(function(){var run=function(){${BOOT}};if(document.documentElement){run();}else{new MutationObserver(function(_,o){if(document.documentElement){o.disconnect();run();}}).observe(document,{childList:true});}})();`;
const boot = (page) => page.addInitScript(WRAPPED_BOOT);
const seedTheme = (page, value) => page.addInitScript((v) => localStorage.setItem("co_theme", v), JSON.stringify(value));
const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme);
const token = (page, name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);

async function mountToggle(page) {
  await page.evaluate(async () => {
    const m = await import("/js/theme.js");
    m.initTheme();
    const slot = document.createElement("div");
    slot.id = "test-toggle-slot";
    slot.style.cssText = "position:fixed;top:0;right:0;z-index:99999";
    document.body.prepend(slot);
    window.__unmount = m.mountThemeToggle(slot);
  });
  return page.locator("#test-toggle-slot .theme-toggle");
}

test.describe("boot: no flash, saved choice and OS preference", () => {
  test("data-theme is set before first paint (at DOMContentLoaded, before any rendering) from the OS", async ({ browser }) => {
    for (const scheme of ["light", "dark"]) {
      const ctx = await browser.newContext({ colorScheme: scheme });
      const page = await ctx.newPage();
      await boot(page);
      await page.addInitScript(() => {
        document.addEventListener("DOMContentLoaded", () => { window.__themeAtDcl = document.documentElement.dataset.theme; });
        // first style/layout-capable moment: the first animation frame callback runs before the first paint
        requestAnimationFrame(() => { window.__firstSeen = document.documentElement.dataset.theme; });
      });
      await page.goto("/");
      expect(await page.evaluate(() => window.__firstSeen)).toBe(scheme);
      expect(await page.evaluate(() => window.__themeAtDcl)).toBe(scheme);
      await ctx.close();
    }
  });

  test("saved co_theme wins over the OS preference", async ({ browser }) => {
    for (const [saved, os] of [["dark", "light"], ["light", "dark"]]) {
      const ctx = await browser.newContext({ colorScheme: os });
      const page = await ctx.newPage();
      await seedTheme(page, saved);
      await boot(page);
      await page.goto("/");
      expect(await theme(page)).toBe(saved);
      await ctx.close();
    }
  });

  test("garbage in co_theme is ignored", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("co_theme", "{not json"));
    await boot(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await theme(page)).toBe("dark");
  });

  test("theme-boot.js is a same-origin classic script and the page makes no third-party request", async ({ page }) => {
    const hosts = new Set();
    page.on("request", (r) => { const u = new URL(r.url()); if (u.protocol.startsWith("http")) hosts.add(u.host); });
    const res = await page.request.get("/js/theme-boot.js");
    expect(res.status()).toBe(200);
    expect(await res.text()).not.toMatch(/^\s*(import|export)\s/m);
    await boot(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect([...hosts]).toEqual(["127.0.0.1:4173"]);
    expect(page.errors).toEqual([]);
  });
});

test.describe("tokens and fonts in the browser", () => {
  test("light and dark resolve the design §4 values; legacy aliases follow", async ({ page }) => {
    await seedTheme(page, "light");
    await boot(page);
    await page.goto("/");
    expect(await token(page, "--bg")).toBe("#ECEEF0");
    expect(await token(page, "--primary")).toBe("#B08D57");
    expect(await token(page, "--text-primary")).toBe("#1E2227");
    expect(await token(page, "--tap-min")).toBe("44px");
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    expect(await token(page, "--bg")).toBe("#111316");
    expect(await token(page, "--primary")).toBe("#C9A66B");
    expect(await token(page, "--text-primary")).toBe("#E8EAED");
    const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bodyBg).toBe("rgb(17, 19, 22)");
  });

  test("without data-theme (no JS) the OS preference still picks dark tokens", async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: "dark", javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto("http://127.0.0.1:4173/");
    expect(await token(page, "--bg")).toBe("#111316");
    await ctx.close();
  });

  test("self-hosted fonts load from this origin", async ({ page }) => {
    await boot(page);
    await page.goto("/");
    await page.evaluate(async () => { await Promise.all(["500 16px 'Familjen Grotesk'", "400 16px Figtree", "500 16px 'IBM Plex Mono'"].map((f) => document.fonts.load(f))); });
    const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
    for (const fam of ["Familjen Grotesk", "Figtree", "IBM Plex Mono"]) expect(loaded).toContain(fam);
  });
});

test.describe("toggle", () => {
  test("shows the destination, labels accordingly, is at least 44px, and persists", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await boot(page);
    await page.goto("/");
    const btn = await mountToggle(page);
    await expect(btn).toHaveAttribute("aria-label", "Switch to dark mode");
    await expect(btn).toHaveAttribute("title", "Switch to dark mode");
    await expect(btn).toContainText("Dark");
    const box = await btn.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);

    await btn.click();
    expect(await theme(page)).toBe("dark");
    await expect(btn).toHaveAttribute("aria-label", "Switch to light mode");
    await expect(btn).toContainText("Light");
    expect(await page.evaluate(() => localStorage.getItem("co_theme"))).toBe('"dark"');

    // persistence across reload, even though the OS says light
    await page.reload();
    expect(await theme(page)).toBe("dark");
    const btn2 = await mountToggle(page);
    await expect(btn2).toHaveAttribute("aria-label", "Switch to light mode");
    await btn2.click();
    expect(await theme(page)).toBe("light");
    expect(await page.evaluate(() => localStorage.getItem("co_theme"))).toBe('"light"');
  });

  test("keyboard: Enter toggles; fires kairo:themechange; animation flag is transient", async ({ page }) => {
    await boot(page);
    await page.goto("/");
    const btn = await mountToggle(page);
    await page.evaluate(() => { window.__ev = []; window.addEventListener("kairo:themechange", (e) => window.__ev.push(e.detail.theme)); });
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-theme-anim"))).toBe(false);
    await btn.focus();
    await page.keyboard.press("Enter");
    expect(await page.evaluate(() => window.__ev)).toEqual([await theme(page)]);
    expect(await page.evaluate(() => document.documentElement.hasAttribute("data-theme-anim"))).toBe(true);
    await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-theme-anim")), { timeout: 2000 }).toBe(false);
  });

  test("OS changes are followed until the user chooses", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await boot(page);
    await page.goto("/");
    await page.evaluate(async () => { (await import("/js/theme.js")).initTheme(); });
    expect(await theme(page)).toBe("light");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => theme(page)).toBe("dark");
    expect(await page.evaluate(() => localStorage.getItem("co_theme"))).toBeNull();
    await page.evaluate(async () => (await import("/js/theme.js")).setTheme("light"));
    await page.emulateMedia({ colorScheme: "dark" });
    await page.emulateMedia({ colorScheme: "light" });
    await page.emulateMedia({ colorScheme: "dark" });
    expect(await theme(page)).toBe("light");
  });

  test("segmented control: radiogroup with the active option checked", async ({ page }) => {
    await boot(page);
    await page.goto("/");
    await page.evaluate(async () => {
      const m = await import("/js/theme.js");
      const slot = document.createElement("div");
      slot.id = "seg-slot";
      slot.style.cssText = "position:fixed;top:0;right:0;z-index:99999";
      document.body.prepend(slot);
      m.mountThemeSegmented(slot);
    });
    const group = page.locator("#seg-slot [role=radiogroup]");
    await expect(group).toHaveCount(1);
    await expect(page.locator("#seg-slot [role=radio][aria-checked=true]")).toHaveText("Light");
    await page.locator("#seg-slot [data-theme-opt=dark]").click();
    await expect(page.locator("#seg-slot [role=radio][aria-checked=true]")).toHaveText("Dark");
    expect(await theme(page)).toBe("dark");
  });
});

test.describe("medal chips render", () => {
  test("gold, silver, bronze use gradients; steel is flat", async ({ page }) => {
    await boot(page);
    await page.goto("/");
    const bgs = await page.evaluate(async () => {
      const { gradeChip } = await import("/js/render/grade-chip.js");
      const host = document.createElement("div");
      host.innerHTML = ["A", "A-", "B+", "B", "D"].map((g) => gradeChip(g)).join("");
      document.body.appendChild(host);
      return [...host.children].map((c) => getComputedStyle(c).backgroundImage.startsWith("linear-gradient"));
    });
    expect(bgs).toEqual([true, true, true, false, false]);
  });
});

// AA contrast on the legacy dashboard (populated), both themes. Only colour-contrast is asserted here.
for (const mode of ["light", "dark"]) {
  test(`axe colour-contrast on the legacy dashboard, ${mode} theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(([p, pl]) => {
      localStorage.setItem("co_profile", JSON.stringify(p));
      localStorage.setItem("co_pipeline", JSON.stringify(pl));
    }, [profile.profile || profile, PIPELINE]);
    await seedTheme(page, mode);
    await boot(page);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(await theme(page)).toBe(mode);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const res = await new AxeBuilder({ page }).withRules(["color-contrast"]).analyze();
    fs.mkdirSync("e2e-results/axe", { recursive: true });
    fs.writeFileSync(`e2e-results/axe/theme-${mode}.json`, JSON.stringify(res.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => ({ target: n.target, msg: n.any[0] && n.any[0].message })) })), null, 1));
    expect(res.violations.flatMap((v) => v.nodes.map((n) => `${n.target.join(" ")}: ${n.any[0] && n.any[0].message}`))).toEqual([]);
    expect(page.errors).toEqual([]);
  });
}

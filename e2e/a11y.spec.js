// Phase 4B (#40): accessibility regression specs. Full-page axe (WCAG 2.1 A/AA + best-practice) on every view and
// state at 390/820/1440 in light and dark, plus the keyboard, landmark, focus, motion and tap-target checks axe cannot do.
// Synthetic data only (rule 15); the API is always mocked (rule 5). See docs/a11y-audit.md.
const AxeBuilder = require("@axe-core/playwright").default;
const { test, expect } = require("./helpers");
const { seedState, mockApi, fixClock } = require("./phase3-helpers");
const { STATES, VIEWPORTS, THEMES, openState, ROLE } = require("./a11y-states");

test.use({ timezoneId: "UTC" });

// ---------- axe on the whole page, not one view ----------
for (const st of STATES) {
  for (const [w, h] of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`axe (whole page): ${st.name} at ${w}px ${theme}`, async ({ page }) => {
        await openState(page, st, { w, h, theme });
        const res = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
        const v = res.violations.map((x) => ({ id: x.id, targets: x.nodes.map((n) => n.target.join(" ")) }));
        expect(v, "axe violations").toEqual([]);
        expect(page.errors).toEqual([]);
      });
    }
  }
}

const phone = { w: 390, h: 844, theme: "light" };
const ALL = { profile: true, pipeline: true, stories: true };
const stateOf = (name) => STATES.find((s) => s.name === name);

// ---------- BUG-40: active bottom-nav label contrast ----------
function ratio(a, b) {
  const lum = ([r, g, bl]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(bl); };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
for (const theme of THEMES) {
  test(`BUG-40: the active bottom-nav label has at least 4.5:1 contrast (${theme})`, async ({ page }) => {
    await openState(page, stateOf("today-moves"), { ...phone, theme });
    const c = await page.evaluate(() => {
      const tab = document.querySelector('.shell-bottom-nav .shell-tab[aria-current="page"]');
      const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
      return { fg: rgb(getComputedStyle(tab).color), bg: rgb(getComputedStyle(document.querySelector(".shell-bottom-nav")).backgroundColor), size: getComputedStyle(tab).fontSize };
    });
    expect(ratio(c.fg, c.bg)).toBeGreaterThanOrEqual(4.5);
  });
}

// ---------- landmarks and headings ----------
for (const st of STATES.filter((s) => !s.prepare || s.name === "home-example")) {
  test(`landmarks and headings: ${st.name}`, async ({ page }) => {
    await openState(page, st, { w: 1440, h: 900, theme: "light" });
    const info = await page.evaluate(() => ({
      main: document.querySelectorAll("main").length,
      banner: document.querySelectorAll("body > .app-shell > header, header.shell-header").length,
      navs: [...document.querySelectorAll("nav")].map((n) => n.getAttribute("aria-label")),
      h1: [...document.querySelectorAll("h1")].filter((e) => e.offsetParent !== null).length,
      lang: document.documentElement.lang,
      footerInMain: !!document.querySelector("main footer.k-site-footer"),
    }));
    expect(info.main).toBe(1);
    expect(info.banner).toBe(1);
    expect(info.navs.every(Boolean)).toBe(true);
    expect(new Set(info.navs).size).toBe(info.navs.length);
    expect(info.h1, "one visible h1").toBe(1);
    expect(info.lang).toBe("en");
    expect(info.footerInMain).toBe(true);
  });
}

test("pipeline detail on a phone still has one visible h1 (the list one is hidden)", async ({ page }) => {
  await openState(page, stateOf("pipeline-detail"), { ...phone });
  await expect(page.locator("#view-pipeline h1:visible")).toHaveCount(1);
  await expect(page.locator("#view-pipeline h1:visible")).toContainText("Pipeline:");
});

// ---------- keyboard: skip link, focus after navigation, no traps ----------
test("skip link is the first tab stop, shows on focus and moves focus to main without changing the route", async ({ page }) => {
  await openState(page, stateOf("today-moves"), { w: 1440, h: 900, theme: "light" });
  const link = page.locator(".skip-link");
  const before = await page.evaluate(() => location.hash);
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  const box = await link.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.height).toBeGreaterThanOrEqual(43.5);
  await page.keyboard.press("Enter");
  await expect(page.locator("#app-main")).toBeFocused();
  expect(await page.evaluate(() => location.hash)).toBe(before);
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.querySelector("#app-main").contains(document.activeElement))).toBe(true);
});

test("skip link is off-screen until focused", async ({ page }) => {
  await openState(page, stateOf("today-moves"), { w: 1440, h: 900, theme: "light" });
  const box = await page.locator(".skip-link").boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(0);
});

test("after a route change, focus moves to the new screen's heading", async ({ page }) => {
  await openState(page, stateOf("today-moves"), { w: 1440, h: 900, theme: "light" });
  await page.locator('.shell-nav [data-dest="stories"]').click();
  await expect(page.locator("#view-stories h1")).toBeFocused();
  await page.locator('.shell-nav [data-dest="profile"]').click();
  await expect(page.locator("#view-profile h1")).toBeFocused();
});

test("first load does not steal focus from the skip link", async ({ page }) => {
  await openState(page, stateOf("today-moves"), { w: 1440, h: 900, theme: "light" });
  expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement === document.documentElement)).toBe(true);
});

test("Esc closes the story dialog, focus returns to the card, Tab never leaves the dialog", async ({ page }) => {
  await openState(page, stateOf("stories-list"), { w: 820, h: 1180, theme: "light" });
  const card = page.locator("#view-stories .st-card").first();
  await card.focus();
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    // Native modal: focus cycles inside the dialog or leaves to the browser UI (body), never to the page behind.
    expect(await page.evaluate(() => { const a = document.activeElement; return !!a.closest("dialog") || a === document.body; }), `tab ${i} never reaches the page behind`).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  await expect(card).toBeFocused();
});

test("phone menu: Esc closes it and aria-expanded follows", async ({ page }) => {
  await openState(page, stateOf("today-moves"), { ...phone });
  const btn = page.locator(".shell-menu-btn");
  await btn.click();
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
});

// Every tab stop shows a visible focus indicator (outline, or a box-shadow ring).
for (const name of ["today-moves", "pipeline-detail", "role-fit", "add-one", "profile", "stories-list", "home-example"]) {
  test(`focus is visible on every tab stop: ${name}`, async ({ page }) => {
    await openState(page, stateOf(name), { w: 1440, h: 900, theme: "light" });
    const bad = [];
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press("Tab");
      const r = await page.evaluate(() => {
        const e = document.activeElement;
        if (!e || e === document.body) return null;
        const s = getComputedStyle(e);
        const host = e.closest(".t-move"); // Today: the whole move row shows the ring (focus-within)
        const hs = host ? getComputedStyle(host) : null;
        const ring = (hs && hs.outlineStyle !== "none" && parseFloat(hs.outlineWidth) > 0) || (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
        const border = e.matches("input, textarea, select") && s.borderColor;
        return { tag: e.tagName.toLowerCase() + (e.className ? "." + String(e.className).split(" ")[0] : ""), ring: !!ring, border: !!border };
      });
      if (r && !r.ring) bad.push(r.tag);
    }
    expect(bad, "tab stops without a focus ring").toEqual([]);
  });
}

// ---------- reduced motion ----------
test("prefers-reduced-motion: transitions and animations are cut to ~0", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openState(page, stateOf("today-moves"), { w: 1440, h: 900, theme: "light" });
  const worst = await page.evaluate(() => {
    let max = 0;
    for (const e of document.querySelectorAll("body *")) {
      const s = getComputedStyle(e);
      for (const d of [...s.transitionDuration.split(","), ...s.animationDuration.split(",")]) {
        const ms = d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000;
        if (ms > max) max = ms;
      }
    }
    return max;
  });
  expect(worst).toBeLessThanOrEqual(1);
});

// ---------- tap targets (>= 44px, with 0.5px rounding) on phone ----------
const TAP_STATES = ["today-moves", "pipeline-list", "pipeline-detail", "role-fit", "add-one", "profile", "stories-list", "home-empty"];
for (const name of TAP_STATES) {
  test(`tap targets are at least 44px high on a phone: ${name}`, async ({ page }) => {
    await openState(page, stateOf(name), { ...phone });
    const small = await page.evaluate(() => {
      const out = [];
      const sel = 'button, [role="button"], input:not([type=hidden]):not([type=file]), select, textarea, summary, nav a, .btn, .k-site-footer a, #app-main a.btn';
      for (const e of document.querySelectorAll(sel)) {
        if (e.closest("dialog:not([open])")) continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.height < 43.5) out.push(`${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]} ${Math.round(r.height)}px`);
      }
      return out;
    });
    expect(small).toEqual([]);
  });
}

// ---------- screen-reader names ----------
for (const st of STATES) {
  test(`every button, link, input and select has an accessible name: ${st.name}`, async ({ page }) => {
    await openState(page, st, { w: 390, h: 844, theme: "light" });
    const res = await new AxeBuilder({ page }).withRules(["button-name", "link-name", "label", "select-name", "aria-input-field-name", "aria-dialog-name", "image-alt"]).analyze();
    expect(res.violations.map((v) => v.id)).toEqual([]);
  });
}

// BUG-60: under reduced motion Home showed the text "null" (a null child handed to replaceChildren).
for (const theme of THEMES) {
  test(`BUG-60: Home under reduced motion has no stray "null" text and no errors (${theme})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openState(page, stateOf("home-empty"), { w: 390, h: 844, theme });
    await expect(page.locator("#view-home .home-demo-panel")).toBeVisible();
    const text = await page.locator("#view-home").innerText();
    expect(text).not.toMatch(/\bnull\b|\bundefined\b/);
    expect(await page.locator("#view-home .home-demo-toggle").count()).toBe(0);
    expect(page.errors).toEqual([]);
  });
}

test("status and error messages are announced (live regions / alerts)", async ({ page }) => {
  await openState(page, stateOf("role-tool-error"), { w: 820, h: 1180, theme: "light" });
  const err = page.locator("#view-role .k-tool-error");
  const role = await err.evaluate((e) => e.getAttribute("role") || e.closest("[role]")?.getAttribute("role") || e.closest("[aria-live]")?.getAttribute("aria-live"));
  expect(["alert", "status", "polite", "assertive"]).toContain(role);
});

test("text zoom: 200% font size causes no horizontal overflow on a phone", async ({ page }) => {
  await fixClock(page);
  await seedState(page, { ...ALL, theme: "light" });
  await mockApi(page, {});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/#/role/${ROLE.id}`);
  await expect(page.locator(".role-view")).toBeVisible();
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over).toBeLessThanOrEqual(0);
});

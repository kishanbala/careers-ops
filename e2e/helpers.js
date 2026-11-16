const fs = require("node:fs");
const path = require("node:path");
const { test: base, expect } = require("@playwright/test");

const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "api", n), "utf8"));
const profile = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "synthetic-profile.json"), "utf8"));

// Offline + mocked: external hosts (fonts, PDF.js CDN) are blocked, /api/evaluate is served from fixtures. No real API calls (rule 5).
const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && !/Failed to load resource|ERR_FAILED/.test(m.text()) && errors.push(m.text()));
    page.errors = errors;
    page.apiCalls = [];
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await page.route("**/api/evaluate", async (route) => {
      const body = route.request().postDataJSON() || {};
      page.apiCalls.push(body.mode);
      const name = { evaluate: "evaluate.json", quick: "evaluate.json", story: "story.json", pdf: "pdf.json" }[body.mode] || "evaluate.json";
      await route.fulfill({ json: fx(name).response });
    });
    await use(page);
  },
});

const seedProfile = (page) =>
  page.addInitScript((p) => localStorage.setItem("co_profile", JSON.stringify(p.profile || p)), profile);

module.exports = { test, expect, profile, seedProfile, fx };

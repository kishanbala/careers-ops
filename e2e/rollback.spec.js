// Rollback proof (build-plan §3a, Phase 2 spec §5): schema v2 data loaded into the v1 build must keep working,
// and whatever the v1 build writes must load cleanly in the v2 build again.
// CI checks out the last v1 build into v1-build/ and sets V1_BUILD_DIR (spec §7). Skips when unset.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { test, expect } = require("./helpers");

const DIR = process.env.V1_BUILD_DIR ? path.resolve(process.env.V1_BUILD_DIR) : "";
const ROOT = DIR && fs.existsSync(path.join(DIR, "public", "index.html")) ? path.join(DIR, "public") : DIR;
const PORT = Number(process.env.V1_PORT) || 4183;
const V1 = `http://127.0.0.1:${PORT}`;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const fixture = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "tests", "fixtures", "storage", n), "utf8")).storage;
const V2 = fixture("v2-basic.json");
const asStrings = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, JSON.stringify(v)]));
const seedRaw = (page, raw) =>
  page.addInitScript((s) => {
    if (sessionStorage.getItem("__seeded")) return;
    sessionStorage.setItem("__seeded", "1");
    for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
  }, raw);
const dump = (page) => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
const nav = (page, id) => page.evaluate((i) => document.querySelector(`.nav-item[data-page="${i}"]`).click(), id);

test.describe("v2 data in the v1 build", () => {
  test.skip(!ROOT, "V1_BUILD_DIR not set (CI sets it)");
  test.use({ viewport: { width: 1440, height: 900 } });
  let server;

  test.beforeAll(async () => {
    server = http.createServer((req, res) => {
      const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      const file = path.normalize(path.join(ROOT, p === "/" ? "index.html" : p));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end("not found"); return; }
      res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  });
  test.afterAll(async () => { await new Promise((r) => server.close(r)); });

  test("dashboard and stories render v2 roles and stories", async ({ page }) => {
    await seedRaw(page, asStrings(V2));
    await page.goto(V1 + "/");
    await expect(page.locator("#pipeline-table-wrap tbody tr")).toHaveCount(V2.co_pipeline.length);
    await expect(page.locator("#sb-badge")).toHaveText(String(V2.co_pipeline.length));
    await expect(page.locator("#stat-total")).toHaveText(String(V2.co_pipeline.length));
    await expect(page.locator("#pipeline-table-wrap tbody tr").first()).toContainText(V2.co_pipeline[0].role);
    await page.locator("#pipeline-table-wrap tbody tr").first().click();
    await expect(page.locator("#pipeline-modal")).toHaveClass(/open/);
    await page.click("#pipeline-modal-close");
    await nav(page, "stories");
    await expect(page.locator("#stories-list .story-card")).toHaveCount(V2.co_stories.length);
    await page.locator("#stories-list .story-card").first().click();
    await expect(page.locator("#story-modal-content")).toContainText("SYNTHETIC situation.");
    expect(page.errors).toEqual([]);
  });

  test("status change keeps every v2 field", async ({ page }) => {
    const raw = asStrings(V2);
    await seedRaw(page, raw);
    await page.goto(V1 + "/");
    await page.locator('.status-sel[data-idx="0"]').selectOption("Interviewing");
    const after = await dump(page);
    const roles = JSON.parse(after.co_pipeline);
    expect(roles[0].status).toBe("interviewing");
    expect({ ...roles[0], status: V2.co_pipeline[0].status }).toEqual(V2.co_pipeline[0]);
    expect(roles.slice(1)).toEqual(V2.co_pipeline.slice(1));
    for (const k of ["co_schema", "co_backup_v1", "co_profile", "co_stories", "co_theme"]) expect(after[k], k).toBe(raw[k]);
    await page.reload();
    await expect(page.locator('.status-sel[data-idx="0"]')).toHaveValue("Interviewing");
    expect(page.errors).toEqual([]);
  });

  test("Evaluate & Track works; the v2 build then normalises the v1 row and keeps the rest", async ({ page, browser, baseURL }) => {
    await seedRaw(page, asStrings(V2));
    await page.goto(V1 + "/");
    await nav(page, "evaluate");
    await page.fill("#eval-jd", "SYNTHETIC JD - Senior Data Analyst, fictional company. SQL, dbt.");
    await page.click("#eval-run-btn");
    await expect(page.locator("#eval-result-state")).toBeVisible({ timeout: 15000 });
    expect(page.apiCalls).toEqual(["evaluate"]);
    const afterV1 = await dump(page);
    const v1roles = JSON.parse(afterV1.co_pipeline);
    expect(v1roles.length).toBe(V2.co_pipeline.length + 1);
    expect(v1roles[0].stageHistory).toBeUndefined(); // v1-shaped row added after co_schema = 2
    expect(v1roles.slice(1)).toEqual(V2.co_pipeline);
    expect(page.errors).toEqual([]);

    // Roll forward again: the v2 build normalises the new row only.
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p2 = await ctx.newPage();
    const errors = [];
    p2.on("pageerror", (e) => errors.push(String(e)));
    await p2.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    await seedRaw(p2, afterV1);
    await p2.goto(new URL("/", baseURL).href);
    await expect(p2.locator("#sb-badge")).toHaveText(String(V2.co_pipeline.length + 1));
    const afterV2 = await dump(p2);
    const roles = JSON.parse(afterV2.co_pipeline);
    expect(roles[0].stageHistory).toEqual([]);
    expect(roles[0].appliedAt).toBeNull();
    expect(roles.slice(1)).toEqual(V2.co_pipeline);
    expect(afterV2.co_backup_v1).toBe(afterV1.co_backup_v1);
    expect(afterV2.co_schema).toBe("2");
    expect(errors).toEqual([]);
    await ctx.close();
  });
});

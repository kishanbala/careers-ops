// Phase 4C (#41): GDPR proof. Records ALL network requests on the first load of every top-level route
// and fails on any host other than the app's own origin. The log is stored under e2e-results/network-log/
// (uploaded by CI in the existing "e2e-screenshots-and-axe" artifact).
const fs = require("node:fs");
const path = require("node:path");
const { test, expect, seedProfile } = require("./helpers");

const ROUTES = ["#/", "#/home", "#/today", "#/pipeline", "#/stories", "#/profile", "#/add", "#/add/several", "#/add/scan", "#/role/999"];
const OUT = path.join(__dirname, "..", "e2e-results", "network-log");

for (const hash of ROUTES) {
  test(`first load of ${hash} makes same-origin requests only`, async ({ page, baseURL }) => {
    const origin = new URL(baseURL).origin;
    const log = [];
    // context-level listener also sees worker, iframe and service-worker traffic
    page.context().on("request", (r) => log.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
    await seedProfile(page); // synthetic profile only (rule 15)
    await page.goto("/" + hash);
    await expect(page.locator(".view.active")).toHaveCount(1);
    await page.waitForLoadState("networkidle");

    fs.mkdirSync(OUT, { recursive: true });
    const slug = hash.replace(/^#\/?/, "").replace(/\//g, "-") || "root";
    fs.writeFileSync(path.join(OUT, `${slug}.json`), JSON.stringify({ route: hash, requests: log }, null, 2));

    expect(log.length).toBeGreaterThan(0);
    const foreign = log.filter((r) => !/^(data|blob):/.test(r.url) && new URL(r.url).origin !== origin);
    expect(foreign, `non-same-origin requests on ${hash}`).toEqual([]);
  });
}

// Phase 4C (#41): GDPR proof. Records ALL network requests on the first load of every top-level route, in three
// states (no profile, profile only, profile + seeded pipeline), and fails on any host other than the app's own origin.
// Logs are stored under e2e-results/network-log/ (uploaded by CI in the existing "e2e-screenshots-and-axe" artifact).
// They hold URL, method and resource type only. Synthetic data only (rule 15).
const fs = require("node:fs");
const path = require("node:path");
const { test, expect, seedProfile } = require("./helpers");
const { SEED, seedState } = require("./phase3-helpers");

const OUT = path.join(__dirname, "..", "e2e-results", "network-log");
const ID = SEED.storage.co_pipeline[0].id;

const BASIC = ["#/", "#/home", "#/today", "#/pipeline", "#/stories", "#/profile", "#/add", "#/add/several", "#/add/scan"];
const STATES = [
  { name: "no-profile", routes: BASIC, seed: async () => {} },
  { name: "profile", routes: [...BASIC, "#/role/999"], seed: (page) => seedProfile(page) },
  {
    name: "pipeline",
    routes: [...BASIC, `#/role/${ID}`, `#/role/${ID}/cv`, `#/role/${ID}/interview`, `#/pipeline/${ID}`],
    seed: (page) => seedState(page, { profile: true, pipeline: true, stories: true }),
  },
];

for (const st of STATES) {
  for (const hash of st.routes) {
    test(`[${st.name}] first load of ${hash} makes same-origin requests only`, async ({ page, baseURL }) => {
      const origin = new URL(baseURL).origin;
      const log = [];
      // context-level listener also sees worker, iframe and service-worker traffic
      page.context().on("request", (r) => log.push({ url: r.url(), method: r.method(), type: r.resourceType() }));
      await st.seed(page);
      await page.goto("/" + hash);
      await expect(page.locator(".view.active")).toHaveCount(1);
      await page.waitForLoadState("networkidle");

      fs.mkdirSync(OUT, { recursive: true });
      const slug = hash.replace(/^#\/?/, "").replace(/\//g, "-") || "root";
      fs.writeFileSync(path.join(OUT, `${st.name}-${slug}.json`), JSON.stringify({ state: st.name, route: hash, requests: log }, null, 2));

      expect(log.length).toBeGreaterThan(0);
      const foreign = log.filter((r) => !/^(data|blob):/.test(r.url) && new URL(r.url).origin !== origin);
      expect(foreign, `non-same-origin requests on ${hash}`).toEqual([]);
    });
  }
}

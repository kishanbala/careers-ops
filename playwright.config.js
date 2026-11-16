const { defineConfig } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "e2e",
  outputDir: "e2e-results",
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173", trace: "off" },
  webServer: { command: "node scripts/static-server.mjs", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI },
});

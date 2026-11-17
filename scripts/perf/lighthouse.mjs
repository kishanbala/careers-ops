// Phase 4C (#41): reproducible Lighthouse (mobile) run for Home against the local static server.
// Usage: npm run perf:lighthouse   (CHROME_PATH overrides the browser; default /opt/pw-browsers/chromium if present)
// Writes perf-results/lighthouse-home.json (summary) and exits 1 if any category is below 90.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";

const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = Number(process.env.PERF_PORT) || 4181;
const THRESHOLD = 90;
const chromePath = process.env.CHROME_PATH || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

const server = spawn(process.execPath, [path.join(repo, "scripts", "static-server.mjs")], { env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const chrome = await launch({ chromePath, chromeFlags: ["--headless", "--no-sandbox", "--disable-gpu"] });
let failed = false;
try {
  const url = `http://127.0.0.1:${PORT}/#/home`;
  // Default config = mobile emulation + simulated slow 4G / 4x CPU throttling.
  const { lhr } = await lighthouse(url, { port: chrome.port, output: "json", logLevel: "error", onlyCategories: ["performance", "accessibility", "best-practices"] });
  const scores = Object.fromEntries(Object.entries(lhr.categories).map(([k, c]) => [k, Math.round(c.score * 100)]));
  const a = lhr.audits;
  const metrics = {
    fcpMs: Math.round(a["first-contentful-paint"].numericValue),
    lcpMs: Math.round(a["largest-contentful-paint"].numericValue),
    tbtMs: Math.round(a["total-blocking-time"].numericValue),
    cls: Number(a["cumulative-layout-shift"].numericValue.toFixed(4)),
    speedIndexMs: Math.round(a["speed-index"].numericValue),
  };
  const flagged = Object.values(a).filter((x) => x.score !== null && x.score < 0.9 && x.scoreDisplayMode !== "informative" && x.scoreDisplayMode !== "notApplicable").map((x) => ({ id: x.id, score: x.score, title: x.title }));
  fs.mkdirSync(path.join(repo, "perf-results"), { recursive: true });
  if (process.env.PERF_FULL) fs.writeFileSync(path.join(repo, "perf-results", "full.json"), JSON.stringify(lhr));
  const out = { url, lighthouse: lhr.lighthouseVersion, formFactor: lhr.configSettings.formFactor, scores, metrics, flagged };
  fs.writeFileSync(path.join(repo, "perf-results", "lighthouse-home.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  failed = Object.values(scores).some((s) => s < THRESHOLD);
} finally {
  await chrome.kill();
  server.kill();
}
process.exit(failed ? 1 : 0);

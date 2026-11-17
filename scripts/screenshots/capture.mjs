// Regenerates the README screenshots and the first-run GIF in docs/img/.
// Usage: node scripts/screenshots/capture.mjs [--out docs/img]
// Synthetic data only (rule 15): tests/fixtures/synthetic-profile.json and tests/fixtures/views/seed-v2.json.
// Offline and mocked (rule 5): every non-local request is blocked and /api/evaluate is answered from tests/fixtures/api/.
// Needs: @playwright/test with a chromium (PLAYWRIGHT_BROWSERS_PATH), python3 with Pillow, ffmpeg.
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, "..", "..");
const pub = path.join(repo, "public");
const argOut = process.argv.indexOf("--out");
const out = path.resolve(argOut > -1 ? process.argv[argOut + 1] : path.join(repo, "docs", "img"));
const json = (...p) => JSON.parse(fs.readFileSync(path.join(repo, ...p), "utf8"));
const SEED = json("tests", "fixtures", "views", "seed-v2.json");
const PROFILE = json("tests", "fixtures", "synthetic-profile.json");
const profile = PROFILE.profile || PROFILE;
const fixture = (n) => json("tests", "fixtures", "api", n).response;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kairo-shots-"));

const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.normalize(path.join(pub, p === "/" ? "index.html" : p));
  if (!file.startsWith(pub) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();

async function newPage({ width, height, theme, seed }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce", colorScheme: theme });
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
  await page.route("**/api/evaluate", (route) => {
    const mode = (route.request().postDataJSON() || {}).mode;
    route.fulfill({ json: fixture({ story: "story.json", pdf: "pdf.json" }[mode] || "evaluate.json") });
  });
  await page.clock.setFixedTime(new Date(SEED.clock));
  const storage = seed ? { ...SEED.storage, co_theme: theme } : { co_theme: theme };
  await page.addInitScript((data) => {
    if (sessionStorage.getItem("__shots")) return;
    sessionStorage.setItem("__shots", "1");
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, JSON.stringify(v));
  }, storage);
  return { ctx, page };
}

const SCREENS = [
  { name: "home", hash: "#/home", seed: false, ready: "#view-home h1" },
  { name: "today", hash: "#/today", seed: true, ready: "#view-today h1" },
  { name: "role", hash: `#/role/${SEED.storage.co_pipeline[0].id}`, seed: true, ready: "#view-role h1" },
];
const SIZES = [["desktop", 1280, 800], ["phone", 390, 844]];

fs.mkdirSync(out, { recursive: true });
for (const s of SCREENS) for (const [size, w, h] of SIZES) for (const theme of ["light", "dark"]) {
  const { ctx, page } = await newPage({ width: w, height: h, theme, seed: s.seed });
  await page.goto(base + "/" + s.hash);
  await page.locator(s.ready).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(tmp, `${s.name}-${size}-${theme}.png`) });
  await ctx.close();
}

// First-run flow for the GIF: Home -> Profile (synthetic CV) -> Add role (synthetic JD) -> role workspace -> Today.
{
  const { ctx, page } = await newPage({ width: 1100, height: 700, theme: "light", seed: false });
  const frames = [];
  const shot = async (hold) => {
    await page.waitForTimeout(350);
    const f = path.join(tmp, `frame-${String(frames.length).padStart(2, "0")}.png`);
    await page.screenshot({ path: f });
    frames.push({ f, hold });
  };
  await page.goto(base + "/#/home");
  await page.locator("#view-home h1").waitFor();
  await shot(2.2);
  await page.getByRole("link", { name: "Start with your CV" }).click();
  await page.locator("#view-profile h1").waitFor();
  await page.getByLabel("Name").fill(profile.name || "Mira Testwell (SYNTHETIC)");
  await page.getByLabel("Target role").fill(profile.target || "Analytics Engineer");
  await page.getByLabel("CV text").fill(profile.cv);
  await shot(2.2);
  await page.getByRole("button", { name: "Save profile" }).click();
  await page.locator("#view-profile .pf-save-status").waitFor();
  await shot(1.5);
  await page.goto(base + "/#/add");
  await page.locator("#view-add h1").waitFor();
  await page.getByLabel("Job description", { exact: true }).fill(SEED.storage.co_pipeline[1].jd);
  await shot(2.2);
  await page.getByRole("button", { name: "Evaluate and track" }).click();
  await page.waitForURL(/#\/role\/\d+/);
  await page.locator("#view-role .k-fit").first().waitFor();
  await shot(3);
  await page.goto(base + "/#/today");
  await page.locator("#view-today h1").waitFor();
  await shot(3);
  await ctx.close();
  const list = frames.map((x) => `file '${x.f}'\nduration ${x.hold}`).join("\n") + `\nfile '${frames.at(-1).f}'\n`;
  fs.writeFileSync(path.join(tmp, "frames.txt"), list);
}
await browser.close();
server.close();

// Optimise: PNG -> WebP (each under 300 KB), frames -> GIF (under 2 MB).
execFileSync("python3", ["-I", path.join(here, "optimise.py"), tmp, out], { stdio: "inherit" });
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(tmp, "frames.txt"),
  "-vf", "scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=none",
  path.join(out, "first-run.gif")], { stdio: "inherit" });
fs.rmSync(tmp, { recursive: true, force: true });
for (const f of fs.readdirSync(out).sort()) console.log(f, Math.round(fs.statSync(path.join(out, f)).size / 1024) + " KB");

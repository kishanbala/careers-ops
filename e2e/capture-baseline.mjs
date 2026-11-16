// Capture split.spec.js baselines from another build, in the same browser/environment as the comparison.
// Usage: node e2e/capture-baseline.mjs <public-dir-of-pre-split-build> <out-dir>
// Serves <public-dir> on 127.0.0.1:4174 and runs e2e/split.spec.js in capture mode (UPDATE_BASELINE=1) against it.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const [dirArg, outArg] = process.argv.slice(2);
if (!dirArg || !outArg) { console.error("usage: node e2e/capture-baseline.mjs <public-dir> <out-dir>"); process.exit(2); }
const root = path.resolve(dirArg);
const out = path.resolve(outArg);
const PORT = 4174;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = path.normalize(path.join(root, p === "/" ? "index.html" : p));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end("not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  fs.rmSync(out, { recursive: true, force: true });
  // async spawn: a sync child would block this process's event loop, so the server above could not answer
  const child = spawn("npx", ["playwright", "test", "e2e/split.spec.js", "--trace", "off"], {
    stdio: "inherit",
    env: { ...process.env, UPDATE_BASELINE: "1", BASELINE_DIR: out, SPLIT_BASE_URL: `http://127.0.0.1:${PORT}` },
  });
  child.on("exit", (status) => {
    server.close();
    const n = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.endsWith(".png")).length : 0;
    console.log(`captured ${n} baseline PNGs from ${root} into ${out}`);
    process.exit(status === 0 && n > 0 ? 0 : 1);
  });
});

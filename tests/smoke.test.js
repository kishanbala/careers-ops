// scripts/smoke.mjs: the production smoke test, run here against a local static server (never the real site).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SMOKE = path.join(ROOT, "scripts", "smoke.mjs");
const STATIC = path.join(ROOT, "scripts", "static-server.mjs");

const freePort = () =>
  new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

// Starts scripts/static-server.mjs on a free port. Only this child is stopped afterwards.
async function startStatic() {
  const port = await freePort();
  const child = spawn(process.execPath, [STATIC], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(url + "/");
      return { url, stop: () => child.kill() };
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  child.kill();
  throw new Error("static server did not start");
}

// Forwards to the static server and, for "/", injects `extra` into <head>. Used for the negative cases.
async function startInjectingProxy(upstream, extra) {
  const server = http.createServer(async (req, res) => {
    const up = await fetch(new URL(req.url, upstream));
    let body = Buffer.from(await up.arrayBuffer());
    if (req.url === "/") body = Buffer.from(body.toString("utf8").replace("</head>", `${extra}</head>`));
    res.writeHead(up.status, { "content-type": up.headers.get("content-type") || "application/octet-stream" });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, stop: () => server.close() };
}

test("smoke passes against the local static server, with no /api/ requests", async () => {
  const { runSmoke } = await import(SMOKE);
  const srv = await startStatic();
  try {
    const r = await runSmoke(srv.url);
    assert.deepEqual(r.failed.map((c) => c.name + " " + c.detail), []);
    assert.equal(r.ok, true);
    assert.ok(r.checks.length > 20, "expected the pages and the asset crawl to produce checks");
    assert.ok(r.requests.some((u) => u.endsWith("/js/main.js")), "module graph is crawled");
    assert.ok(r.requests.some((u) => u.endsWith("/vendor/pdfjs/pdf.worker.min.js")), "pdf.js worker is checked");
    assert.equal(r.requests.some((u) => new URL(u).pathname.startsWith("/api/")), false);
  } finally {
    srv.stop();
  }
});

test("smoke fails on a third-party host in a page and never requests it", async () => {
  const { runSmoke } = await import(SMOKE);
  const srv = await startStatic();
  const proxy = await startInjectingProxy(srv.url, '<script src="https://cdn.example.invalid/x.js"></script>');
  try {
    const r = await runSmoke(proxy.url);
    assert.equal(r.ok, false);
    assert.ok(r.failed.some((c) => c.name.includes("third-party") && c.detail.includes("cdn.example.invalid")));
    assert.equal(r.requests.some((u) => u.includes("cdn.example.invalid")), false, "the third-party host must not be fetched");
  } finally {
    proxy.stop();
    srv.stop();
  }
});

test("smoke fails on a 404 asset referenced by a page", async () => {
  const { runSmoke } = await import(SMOKE);
  const srv = await startStatic();
  const proxy = await startInjectingProxy(srv.url, '<link rel="stylesheet" href="/css/missing-smoke.css">');
  try {
    const r = await runSmoke(proxy.url);
    assert.equal(r.ok, false);
    assert.ok(r.failed.some((c) => c.name === "/css/missing-smoke.css returns 200" && c.detail === "status 404"));
  } finally {
    proxy.stop();
    srv.stop();
  }
});

test("smoke CLI exits non-zero on a failing site", async () => {
  const srv = await startStatic();
  const proxy = await startInjectingProxy(srv.url, '<img src="https://img.example.invalid/a.png">');
  try {
    const code = await new Promise((resolve) => {
      const child = spawn(process.execPath, [SMOKE, proxy.url], { stdio: "ignore" });
      child.on("exit", resolve);
    });
    assert.equal(code, 1);
  } finally {
    proxy.stop();
    srv.stop();
  }
});

test("smoke reads resource attributes only, not links", async () => {
  const { htmlRefs } = await import(SMOKE);
  const refs = htmlRefs(
    '<a href="https://github.com/x">x</a><link rel="icon" href="data:,"><link rel="preload" href="/fonts/a.woff2" as="font"><script src="/js/a.js"></script><img src=\'/img/b.png\'>',
  );
  assert.deepEqual(refs, ["data:,", "/fonts/a.woff2", "/js/a.js", "/img/b.png"]);
});

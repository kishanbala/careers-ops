// scripts/smoke.mjs: the production smoke test, run here against a local static server (never the real site).
// Every detection the script claims has a negative test: a copy of the site is served through a small proxy that
// injects one defect, and the smoke run must fail on exactly that. A "third party" is a second local server on another
// port (another origin); each test also checks that it was never contacted.
const { test, before, after } = require("node:test");
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

// scripts/static-server.mjs on a free port, started once for this file. Only this child is stopped afterwards.
let child;
let upstream;
before(async () => {
  const port = await freePort();
  child = spawn(process.execPath, [STATIC], { env: { ...process.env, PORT: String(port) }, stdio: "ignore" });
  upstream = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(upstream + "/");
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error("static server did not start");
});
after(() => child && child.kill());

const listen = (server) => new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
const close = (server) => new Promise((r) => { server.close(r); server.closeAllConnections?.(); });

// The "third party": any request to it is recorded. It must stay at zero.
async function startThirdParty() {
  const hits = [];
  const server = await listen(http.createServer((req, res) => { hits.push(req.url); res.writeHead(200, { "content-type": "text/plain" }).end("x"); }));
  const { port } = server.address();
  return { url: `http://127.0.0.1:${port}`, host: `127.0.0.1:${port}`, hits, stop: () => close(server) };
}

// A copy of the site. `rewrite(url)` changes which upstream URL is read; `mutate(pathname, up)` may return
// { status, type, body, headers } to replace parts of the response. Everything it serves is logged.
async function startSite({ rewrite = (u) => u, mutate = () => undefined } = {}) {
  const log = [];
  const server = await listen(
    http.createServer(async (req, res) => {
      const pathname = new URL(req.url, "http://x").pathname;
      log.push({ method: req.method, path: pathname });
      const r = await fetch(new URL(rewrite(req.url), upstream));
      const up = { status: r.status, type: r.headers.get("content-type") || "application/octet-stream", body: Buffer.from(await r.arrayBuffer()) };
      const o = mutate(pathname, up) || {};
      res.writeHead(o.status ?? up.status, { "content-type": o.type ?? up.type, ...(o.headers || {}) });
      res.end(o.body ?? up.body);
    }),
  );
  return { url: `http://127.0.0.1:${server.address().port}`, log, stop: () => close(server) };
}

const onPath = (p, fn) => (pathname, up) => (pathname === p ? fn(up) : undefined);
const edit = (p, fn) => onPath(p, (up) => ({ body: fn(up.body.toString("utf8")) }));
const inHead = (add) => (s) => s.replace("</head>", `${add}</head>`);
const inBody = (add) => (s) => s.replace(/<body[^>]*>/, (m) => m + add);
const append = (add) => (s) => s + "\n" + add;
const prepend = (add) => (s) => add + "\n" + s;

async function runWith(site) {
  const { runSmoke } = await import(SMOKE);
  return runSmoke(site.url);
}
const failure = (r, name) => r.failed.find((c) => c.name === name);

// ---- positive: a clean site passes, GET only, nothing under /api/, the derived assets are all requested ----

test("smoke passes against the local static server: GET only, no /api/, every derived asset requested", async () => {
  const site = await startSite();
  try {
    const r = await runWith(site);
    assert.deepEqual(r.failed.map((c) => `${c.name} ${c.detail}`), []);
    assert.equal(r.ok, true);
    assert.ok(r.checks.length > 100, "expected the pages and the asset crawl to produce many checks");
    const asked = new Set(site.log.map((e) => e.path));
    for (const p of [
      "/", "/privacy.html", "/js/main.js", "/js/router.js", "/js/views/home.js", "/fonts/fonts.css", "/fonts/print.css",
      "/fonts/source-sans-pro-latin-400-normal.woff2", "/fonts/source-sans-pro-latin-700-normal.woff2", "/fonts/figtree-latin-400-normal.woff2",
      "/css/tokens.css", "/css/views/home.css", "/vendor/pdfjs/pdf.min.js", "/vendor/pdfjs/pdf.worker.min.js",
    ]) assert.ok(asked.has(p), `${p} should be requested`);
    assert.deepEqual([...new Set(site.log.map((e) => e.method))], ["GET"], "read-only: GET requests only");
    assert.equal(site.log.some((e) => e.path.startsWith("/api/")), false);
    assert.equal(r.requests.some((u) => new URL(u).pathname.startsWith("/api/")), false);
  } finally {
    await site.stop();
  }
});

test("smoke CLI exits 0 on a clean site and 1 on a failing one", async () => {
  const run = (url) =>
    new Promise((resolve) => {
      const c = spawn(process.execPath, [SMOKE, url], { stdio: "ignore" });
      c.on("exit", resolve);
    });
  const clean = await startSite();
  const bad = await startSite({ mutate: edit("/", inHead('<img src="http://cdn.example.invalid/a.png">')) });
  try {
    assert.equal(await run(clean.url), 0);
    assert.equal(await run(bad.url), 1);
  } finally {
    await clean.stop();
    await bad.stop();
  }
});

// ---- negative: a third-party load in every place the script reads ----

const THIRD_PARTY_CASES = [
  // HTML pages: "/" and the privacy page both get every kind of reference
  ["script src in /", "/", (tp) => edit("/", inHead(`<script src="${tp}/x.js"></script>`))],
  ["script src in /privacy.html", "/privacy.html", (tp) => edit("/privacy.html", inHead(`<script src="${tp}/x.js"></script>`))],
  ["link stylesheet in /privacy.html", "/privacy.html", (tp) => edit("/privacy.html", inHead(`<link rel="stylesheet" href="${tp}/x.css">`))],
  ["link with unquoted rel and href", "/", (tp) => edit("/", inHead(`<link rel=stylesheet href=${tp}/x.css>`))],
  ["link with swapped, upper-case, single-quoted attributes", "/", (tp) => edit("/", inHead(`<LINK HREF='${tp}/x.css' REL='StyleSheet'>`))],
  ["link rel with several tokens (shortcut icon)", "/", (tp) => edit("/", inHead(`<link rel="shortcut icon" href="${tp}/f.ico">`))],
  ["link rel=preload", "/privacy.html", (tp) => edit("/privacy.html", inHead(`<link rel="preload" href="${tp}/f.woff2" as="font" crossorigin>`))],
  ["link rel=preconnect", "/", (tp) => edit("/", inHead(`<link rel="preconnect" href="${tp}">`))],
  ["img src", "/", (tp) => edit("/", inBody(`<img src="${tp}/a.png" alt="">`))],
  ["img srcset, second candidate, after a data URL with a comma", "/privacy.html", (tp) => edit("/privacy.html", inBody(`<img src="data:," alt="" srcset="data:image/gif;base64,R0lG 1x, ${tp}/b.png 2x">`))],
  ["picture source srcset", "/", (tp) => edit("/", inBody(`<picture><source srcset="${tp}/a.webp 1x"><img src="data:," alt=""></picture>`))],
  ["iframe src", "/privacy.html", (tp) => edit("/privacy.html", inBody(`<iframe src="${tp}/f.html"></iframe>`))],
  ["meta refresh", "/", (tp) => edit("/", inHead(`<meta http-equiv="refresh" content="0; url=${tp}/">`))],
  ["base href", "/", (tp) => edit("/", inHead(`<base href="${tp}/">`))],
  ["entity-obfuscated script src", "/", (tp) => edit("/", inHead(`<script src="${tp.replace("http:", "http&#58;")}/x.js"></script>`))],
  ["inline <style> @import in /", "/", (tp) => edit("/", inHead(`<style>@import "${tp}/a.css";</style>`))],
  ["inline <style> @import url() in /privacy.html", "/privacy.html", (tp) => edit("/privacy.html", inHead(`<style>@import url(${tp}/a.css);</style>`))],
  ["inline <style> url() in /privacy.html", "/privacy.html", (tp) => edit("/privacy.html", inHead(`<style>body{background:url('${tp}/a.png')}</style>`))],
  ["style attribute url() in /", "/", (tp) => edit("/", inBody(`<div style="color:red;background:url(${tp}/a.png)"></div>`))],
  ["style attribute url() in /privacy.html", "/privacy.html", (tp) => edit("/privacy.html", inBody(`<p style='background-image:url("${tp}/a.png")'></p>`))],
  ["inline script fetch literal", "/", (tp) => edit("/", inHead(`<script>fetch("${tp}/collect")</script>`))],
  // CSS files
  ["CSS file @import", "/css/base.css", (tp) => edit("/css/base.css", prepend(`@import url("${tp}/a.css");`))],
  ["CSS file url()", "/css/pages.css", (tp) => edit("/css/pages.css", append(`.x{background:url(${tp}/a.png)}`))],
  ["CSS escaped url()", "/css/ui.css", (tp) => edit("/css/ui.css", append(`.x{background:url(\\68ttp${tp.slice(4)}/a.png)}`))],
  ["CSS image-set string", "/css/shell.css", (tp) => edit("/css/shell.css", append(`.x{background:image-set("${tp}/a.png" 1x)}`))],
  ["@font-face src in fonts.css", "/fonts/fonts.css", (tp) => edit("/fonts/fonts.css", append(`@font-face{font-family:X;src:url(${tp}/f.woff2) format('woff2')}`))],
  ["@font-face src in print.css", "/fonts/print.css", (tp) => edit("/fonts/print.css", append(`@font-face{font-family:X;src:url('${tp}/f.woff2')}`))],
  // JavaScript modules
  ["static import specifier (side effect)", "/js/main.js", (tp) => edit("/js/main.js", prepend(`import "${tp}/a";`))],
  ["static import specifier (from)", "/js/theme.js", (tp) => edit("/js/theme.js", prepend(`import { z } from '${tp}/a';`))],
  ["export * from", "/js/features.js", (tp) => edit("/js/features.js", append(`export * from "${tp}/a";`))],
  ["dynamic import literal", "/js/router.js", (tp) => edit("/js/router.js", append(`import("${tp}/a");`))],
  ["fetch literal", "/js/api.js", (tp) => edit("/js/api.js", append(`fetch('${tp}/collect');`))],
  ["fetch template literal", "/js/shell.js", (tp) => edit("/js/shell.js", append("fetch(`" + tp + "/collect`);"))],
  ["sendBeacon literal", "/js/store.js", (tp) => edit("/js/store.js", append(`navigator.sendBeacon("${tp}/b");`))],
  [".src assignment", "/js/pdf.js", (tp) => edit("/js/pdf.js", append(`document.createElement("script").src = "${tp}/lib";`))],
  ["absolute asset URL literal", "/js/views/home.js", (tp) => edit("/js/views/home.js", append(`const LIB = "${tp}/lib.css";`))],
  ["protocol-relative asset literal", "/js/views/today.js", (tp) => edit("/js/views/today.js", append(`const LIB = "//${tp.slice(7)}/lib.js";`))],
];

for (const [name, where, build] of THIRD_PARTY_CASES) {
  test(`third party: ${name}`, async () => {
    const tp = await startThirdParty();
    const site = await startSite({ mutate: build(tp.url) });
    try {
      const r = await runWith(site);
      assert.equal(r.ok, false);
      const c = failure(r, `no third-party request on load (${where})`);
      assert.ok(c, `expected a third-party failure for ${where}; got ${JSON.stringify(r.failed.map((f) => f.name))}`);
      assert.ok(c.detail.includes(tp.host), c.detail);
      assert.deepEqual(tp.hits, [], "the third-party host must never be contacted");
      assert.equal(r.requests.some((u) => u.startsWith(tp.url)), false);
    } finally {
      await site.stop();
      await tp.stop();
    }
  });
}

// ---- negative: redirects are checked before they are followed ----

const REDIRECT_CASES = [
  ["page redirects off-site", (tp) => onPath("/", () => ({ status: 302, headers: { location: `${tp}/` } }))],
  ["page redirects off-site (privacy)", (tp) => onPath("/privacy.html", () => ({ status: 301, headers: { location: `${tp}/p` } }))],
  ["asset redirects off-site", (tp) => onPath("/css/base.css", () => ({ status: 301, headers: { location: `${tp}/x.css` } }))],
  ["font redirects off-site", (tp) => onPath("/fonts/print.css", () => ({ status: 307, headers: { location: `${tp}/x.css` } }))],
  ["protocol-relative Location", (tp) => onPath("/js/main.js", () => ({ status: 302, headers: { location: `//${tp.slice(7)}/x.js` } }))],
];

for (const [name, build] of REDIRECT_CASES) {
  test(`redirect: ${name}`, async () => {
    const tp = await startThirdParty();
    const site = await startSite({ mutate: build(tp.url) });
    try {
      const r = await runWith(site);
      assert.equal(r.ok, false);
      assert.ok(r.failed.some((c) => c.name.endsWith("can be fetched") && c.detail === `redirected off-site to ${tp.url}`), JSON.stringify(r.failed));
      assert.deepEqual(tp.hits, [], "an off-site redirect target must never be requested");
    } finally {
      await site.stop();
      await tp.stop();
    }
  });
}

test("redirect: a same-origin redirect is followed and the final page is checked", async () => {
  const site = await startSite({
    rewrite: (u) => (u === "/privacy-moved.html" ? "/privacy.html" : u),
    mutate: onPath("/privacy.html", () => ({ status: 302, headers: { location: "/privacy-moved.html" } })),
  });
  try {
    const r = await runWith(site);
    assert.equal(r.ok, true, JSON.stringify(r.failed));
    assert.ok(r.requests.some((u) => u.endsWith("/privacy-moved.html")));
  } finally {
    await site.stop();
  }
});

test("redirect: a same-origin redirect into /api/ is refused and never requested", async () => {
  const site = await startSite({ mutate: onPath("/css/ui.css", () => ({ status: 302, headers: { location: "/api/evaluate" } })) });
  try {
    const r = await runWith(site);
    assert.equal(r.ok, false);
    assert.ok(r.failed.some((c) => c.name === "/css/ui.css can be fetched" && c.detail.includes("refused to request /api/evaluate")), JSON.stringify(r.failed));
    assert.equal(site.log.some((e) => e.path.startsWith("/api/")), false);
  } finally {
    await site.stop();
  }
});

test("redirect: a redirect loop fails", async () => {
  const site = await startSite({ mutate: onPath("/css/ui.css", () => ({ status: 302, headers: { location: "/css/ui.css" } })) });
  try {
    const r = await runWith(site);
    assert.ok(r.failed.some((c) => c.name === "/css/ui.css can be fetched" && c.detail.includes("redirects")), JSON.stringify(r.failed));
  } finally {
    await site.stop();
  }
});

// ---- negative: status, content type, charset, empty body, expected text, /api/ ----

const TYPE_CASES = [
  ["CSS served as text/plain", "/css/base.css", "has type text/css", () => onPath("/css/base.css", () => ({ type: "text/plain" }))],
  ["module served as text/html", "/js/main.js", "has type text/javascript", () => onPath("/js/main.js", () => ({ type: "text/html; charset=utf-8" }))],
  ["font served as octet-stream", "/fonts/figtree-latin-400-normal.woff2", "has type font/woff2", () => onPath("/fonts/figtree-latin-400-normal.woff2", () => ({ type: "application/octet-stream" }))],
  ["print.css served as text/plain", "/fonts/print.css", "has type text/css", () => onPath("/fonts/print.css", () => ({ type: "text/plain" }))],
  ["Source Sans font served as text/plain", "/fonts/source-sans-pro-latin-600-normal.woff2", "has type font/woff2", () => onPath("/fonts/source-sans-pro-latin-600-normal.woff2", () => ({ type: "text/plain" }))],
  ["pdf.js worker served as text/plain", "/vendor/pdfjs/pdf.worker.min.js", "has type text/javascript", () => onPath("/vendor/pdfjs/pdf.worker.min.js", () => ({ type: "text/plain" }))],
  ["page served as text/plain", "/privacy.html", "is text/html", () => onPath("/privacy.html", () => ({ type: "text/plain; charset=utf-8" }))],
  ["home served as text/plain", "/", "is text/html", () => onPath("/", () => ({ type: "text/plain; charset=utf-8" }))],
  ["privacy page without charset", "/privacy.html", "declares charset utf-8", () => onPath("/privacy.html", () => ({ type: "text/html" }))],
  ["home without charset", "/", "declares charset utf-8", () => onPath("/", () => ({ type: "text/html" }))],
  ["empty asset", "/fonts/figtree-latin-600-normal.woff2", "is not empty", () => onPath("/fonts/figtree-latin-600-normal.woff2", () => ({ body: Buffer.alloc(0) }))],
  ["empty vendor file", "/vendor/pdfjs/pdf.min.js", "is not empty", () => onPath("/vendor/pdfjs/pdf.min.js", () => ({ body: Buffer.alloc(0) }))],
  ["asset 404", "/css/tokens.css", "returns 200", () => onPath("/css/tokens.css", () => ({ status: 404, body: "no" }))],
  ["asset 500", "/js/store.js", "returns 200", () => onPath("/js/store.js", () => ({ status: 500, body: "no" }))],
  ["page 404", "/privacy.html", "returns 200", () => onPath("/privacy.html", () => ({ status: 404, body: "Privacy" }))],
  ["page text missing", "/privacy.html", 'contains "Privacy"', () => edit("/privacy.html", (s) => s.replaceAll("Privacy", "Pr1vacy"))],
  ["home text missing", "/", 'contains "<title>Kairo</title>"', () => edit("/", (s) => s.replace("<title>Kairo</title>", "<title>Other</title>"))],
];

for (const [name, where, suffix, build] of TYPE_CASES) {
  test(`response: ${name}`, async () => {
    const site = await startSite({ mutate: build() });
    try {
      const r = await runWith(site);
      assert.equal(r.ok, false);
      assert.ok(failure(r, `${where} ${suffix}`), `expected "${where} ${suffix}"; got ${JSON.stringify(r.failed.map((f) => f.name))}`);
    } finally {
      await site.stop();
    }
  });
}

test("response: an extension with no expected type fails instead of passing", async () => {
  const site = await startSite({ mutate: edit("/", inBody('<img src="/img/mystery.bin" alt="">')) });
  try {
    const r = await runWith(site);
    assert.equal(r.ok, false);
    assert.ok(r.failed.some((c) => c.name === "/img/mystery.bin has a known content type"), JSON.stringify(r.failed));
  } finally {
    await site.stop();
  }
});

test("api: a page that loads an /api/ path fails and the path is never requested", async () => {
  const site = await startSite({ mutate: edit("/privacy.html", inHead('<script src="/api/evaluate"></script>')) });
  try {
    const r = await runWith(site);
    assert.equal(r.ok, false);
    assert.ok(failure(r, "no page-load request to /api/ (/privacy.html)"), JSON.stringify(r.failed));
    assert.equal(site.log.some((e) => e.path.startsWith("/api/")), false);
  } finally {
    await site.stop();
  }
});

test("api: a click-time /api/ call inside a module is ignored, not requested", async () => {
  const site = await startSite({ mutate: edit("/js/api.js", append("fetch('/api/other');")) });
  try {
    const r = await runWith(site);
    assert.equal(r.ok, true, JSON.stringify(r.failed));
    assert.equal(site.log.some((e) => e.path.startsWith("/api/")), false);
  } finally {
    await site.stop();
  }
});

// ---- negative: the crawl must find the assets on its own ----

test("discovery: dropping the module script from the page fails the crawl", async () => {
  const site = await startSite({ mutate: edit("/", (s) => s.replace('<script type="module" src="/js/main.js"></script>', "")) });
  try {
    const r = await runWith(site);
    assert.ok(failure(r, "/js/main.js was found by the crawl"), JSON.stringify(r.failed));
  } finally {
    await site.stop();
  }
});

test("discovery: print.css is found through the module that builds the print window", async () => {
  const site = await startSite({ mutate: edit("/js/ui/role/cv-tab.js", (s) => s.replaceAll("/fonts/print.css", "/fonts/other.txt")) });
  try {
    const r = await runWith(site);
    assert.ok(failure(r, "/fonts/print.css was found by the crawl"), JSON.stringify(r.failed));
  } finally {
    await site.stop();
  }
});

test("discovery: a font that only print.css references is found through print.css", async () => {
  const site = await startSite({ mutate: edit("/fonts/print.css", (s) => s.replaceAll("source-sans-pro-latin-400-normal.woff2", "gone.woff2")) });
  try {
    const r = await runWith(site);
    assert.ok(failure(r, "/fonts/source-sans-pro-latin-400-normal.woff2 was found by the crawl"), JSON.stringify(r.failed));
  } finally {
    await site.stop();
  }
});

// ---- the extractors themselves ----

test("htmlRefs reads every resource attribute and ignores links, comments and script text", async () => {
  const { htmlRefs, htmlBase } = await import(SMOKE);
  const refs = htmlRefs(
    [
      '<a href="https://github.com/x">x</a>',
      '<link rel="canonical" href="https://www.kairoapp.eu/">',
      '<link rel="icon" href="data:,">',
      "<link rel=preload href=/fonts/a.woff2 as=font>",
      '<LINK HREF="/css/z.css" REL="Stylesheet">',
      '<script src="/js/a.js"></script>',
      "<script>var s = '<a href=/js/not-a-tag>';</script>",
      "<img src='/img/b.png' srcset=\"/img/b1.png 1x, /img/b2.png 2x\">",
      '<p style="background:url(/img/c.png)"></p>',
      "<style>@import '/css/d.css'; a{background:url(/img/e.png)}</style>",
      '<!-- <script src="https://commented.example/x.js"></script> -->',
      '<base href="/sub/">',
    ].join("\n"),
  );
  assert.deepEqual(
    [...refs].sort(),
    ["data:,", "/fonts/a.woff2", "/css/z.css", "/js/a.js", "/img/b.png", "/img/b1.png", "/img/b2.png", "/img/c.png", "/css/d.css", "/img/e.png"].sort(),
  );
  assert.equal(htmlBase('<!-- <base href="/no/"> --><base href="/sub/">'), "/sub/");
});

test("srcsetUrls, cssRefs and jsRefs", async () => {
  const { srcsetUrls, cssRefs, jsRefs, assetRefs } = await import(SMOKE);
  assert.deepEqual(srcsetUrls("a.png 1x, b.png 2x"), ["a.png", "b.png"]);
  assert.deepEqual(srcsetUrls("a.png 1x,b.png 2x"), ["a.png", "b.png"]);
  assert.deepEqual(srcsetUrls("a.png,b.png 2x"), ["a.png,b.png"]);
  assert.deepEqual(srcsetUrls("a.png, b.png"), ["a.png", "b.png"]);
  assert.deepEqual(cssRefs('/* url(/no.png) */ @import "/a.css"; @IMPORT url(b.css); x{background:URL( "c.png" ) , url(d.png)}'), ["/a.css", "b.css", "c.png", "d.png"]);
  const js = jsRefs(
    [
      'import a from "./a.js"; import "./b.js"; export * from "/c.js";',
      'const m = await import("./d.js"); fetch("https://x.example/e"); fetch(`/f`);',
      'link.href = `${location.origin}/fonts/print.css`; import { q } from "bare-package";',
      'const t = `./views/${route}.js`;',
    ].join("\n"),
  );
  assert.deepEqual([...new Set(js)].sort(), ["./a.js", "./b.js", "./d.js", "/c.js", "/f", "/fonts/print.css", "https://x.example/e"].sort());
  assert.deepEqual(assetRefs("css", "a{b:url(/x.png)}"), ["/x.png"]);
});

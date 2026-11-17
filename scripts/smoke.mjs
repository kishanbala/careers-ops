#!/usr/bin/env node
// Read-only smoke test for a deployed Kairo site (docs/RELEASE.md, step C).
// Usage: node scripts/smoke.mjs [baseUrl]   (default https://www.kairoapp.eu, or SMOKE_BASE_URL)
//
// Only GET requests to the site's own pages and assets. It never requests /api/* (no model call, no API spend),
// and it never requests a third-party host: a third-party reference in a page is reported, not fetched.
// Exits 1 if any check fails. tests/smoke.test.js runs it against scripts/static-server.mjs.
import { fileURLToPath } from "node:url";

export const DEFAULT_BASE_URL = "https://www.kairoapp.eu";
const MAX_ASSETS = 300;
const PAGES = [
  { path: "/", text: "<title>Kairo</title>" },
  { path: "/privacy.html", text: "Privacy" },
];
// Views are loaded with import(`./views/${route}.js`), which the crawler cannot see, so they are listed here.
const VIEW_MODULES = ["home", "today", "pipeline", "role", "profile", "add", "stories"].map((n) => `/js/views/${n}.js`);
const EXPECTED_TYPE = {
  css: ["text/css"],
  js: ["text/javascript", "application/javascript"],
  mjs: ["text/javascript", "application/javascript"],
  woff2: ["font/woff2"],
  png: ["image/png"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
  json: ["application/json"],
  pdf: ["application/pdf"],
};
const LOAD_REL = /stylesheet|preload|modulepreload|icon/i;

const mediaType = (res) => (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
const extOf = (pathname) => (pathname.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || "";

// Resource references in an HTML page: src/href on the tags that make the browser load something.
export function htmlRefs(html) {
  const refs = [];
  for (const [tag] of html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*>/gi)) {
    const name = tag.match(/^<(\w+)/)[1].toLowerCase();
    if (name === "link") {
      const rel = (tag.match(/\brel\s*=\s*["']([^"']*)["']/i) || [])[1] || "";
      if (!LOAD_REL.test(rel)) continue;
    }
    for (const m of tag.matchAll(/\b(src|href)\s*=\s*(["'])(.*?)\2/gi)) refs.push(m[3]);
  }
  return refs;
}

// References inside a stylesheet (url(), @import) or a module (static and dynamic import, literal asset paths).
export function assetRefs(kind, text) {
  const refs = [];
  if (kind === "css") {
    for (const m of text.matchAll(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/gi)) refs.push(m[2]);
    for (const m of text.matchAll(/@import\s+(?:url\(\s*)?(['"])([^'"]+)\1/gi)) refs.push(m[2]);
  } else {
    for (const m of text.matchAll(/\bfrom\s*["']([^"']+)["']|\bimport\s*\(?\s*["']([^"']+)["']/g)) refs.push(m[1] || m[2]);
    for (const m of text.matchAll(/["'`]((?:\.{1,2})?\/[^"'`\s]+\.(?:m?js|css|woff2|png|webp|svg|json|pdf))["'`]/g)) refs.push(m[1]);
  }
  // Bare package names are not fetched by the browser without an import map, so only paths and absolute URLs count.
  return refs.filter((r) => /^(\.{0,2}\/|https?:\/\/)/i.test(r) && !r.includes("${"));
}

export async function runSmoke(baseUrl = DEFAULT_BASE_URL, { fetchImpl = globalThis.fetch } = {}) {
  const base = new URL(baseUrl);
  const checks = [];
  const requests = [];
  const seen = new Set();
  const queue = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail: ok ? "" : detail });

  const fetchOwn = async (url) => {
    if (url.origin !== base.origin) throw new Error(`refused to request another origin: ${url.origin}`);
    if (url.pathname.startsWith("/api/")) throw new Error(`refused to request ${url.pathname} (smoke makes no API calls)`);
    requests.push(url.href);
    const res = await fetchImpl(url, { redirect: "follow", cache: "no-store", headers: { "user-agent": "kairo-smoke-check" } });
    const body = new Uint8Array(await res.arrayBuffer());
    if (res.redirected && new URL(res.url).origin !== base.origin) throw new Error(`redirected off-site to ${new URL(res.url).origin}`);
    return { res, body, text: () => new TextDecoder().decode(body) };
  };

  const handleRef = (raw, from, label) => {
    if (/^(data|blob):/i.test(raw)) return; // inline data (the empty favicon), never a request
    let url;
    try { url = new URL(raw, from); } catch { check(`${label}: valid reference`, false, `bad URL ${raw}`); return; }
    if (url.origin !== base.origin) {
      check(`no third-party request on load (${label})`, false, `${url.origin}${url.pathname} is loaded by ${from.pathname}`);
      return;
    }
    if (!seen.has(url.href)) { seen.add(url.href); queue.push(url); }
  };

  // Pages: status, type, expected text; the page's own references are queued or reported.
  for (const p of PAGES) {
    try {
      const url = new URL(p.path, base);
      const { res, text } = await fetchOwn(url);
      check(`${p.path} returns 200`, res.status === 200, `status ${res.status}`);
      check(`${p.path} is text/html`, mediaType(res) === "text/html", `content-type ${res.headers.get("content-type")}`);
      check(`${p.path} contains ${JSON.stringify(p.text)}`, text().includes(p.text), "expected text missing");
      if (p.path === "/") {
        check("HTML declares charset utf-8", /charset=utf-8/i.test(res.headers.get("content-type") || ""), `content-type ${res.headers.get("content-type")}`);
        for (const raw of htmlRefs(text())) handleRef(raw, new URL(res.url || url.href), p.path);
      }
    } catch (e) {
      check(`${p.path} can be fetched`, false, e.message);
    }
  }
  for (const v of VIEW_MODULES) handleRef(v, base, "view module");

  // Assets: crawl same-origin references; every one must be 200 with the expected type and a non-empty body.
  while (queue.length) {
    if (requests.length > MAX_ASSETS) { check("asset crawl within limit", false, `more than ${MAX_ASSETS} requests`); break; }
    const url = queue.shift();
    const ext = extOf(url.pathname);
    try {
      const { res, body, text } = await fetchOwn(url);
      check(`${url.pathname} returns 200`, res.status === 200, `status ${res.status}`);
      if (EXPECTED_TYPE[ext]) {
        check(`${url.pathname} has type ${EXPECTED_TYPE[ext][0]}`, EXPECTED_TYPE[ext].includes(mediaType(res)), `content-type ${res.headers.get("content-type")}`);
      }
      check(`${url.pathname} is not empty`, body.byteLength > 0, "empty body");
      // First-party code only: vendor libraries (pdf.js) are checked for status and type, not scanned.
      const firstParty = !url.pathname.startsWith("/vendor/");
      if (firstParty && (ext === "css" || ext === "js" || ext === "mjs")) {
        for (const raw of assetRefs(ext === "css" ? "css" : "js", text())) handleRef(raw, url, url.pathname);
      }
    } catch (e) {
      check(`${url.pathname} can be fetched`, false, e.message);
    }
  }

  check("no request to /api/ paths", !requests.some((u) => new URL(u).pathname.startsWith("/api/")), "an /api/ request was made");
  check("at least one asset was checked", requests.length > PAGES.length, "only the pages were fetched");
  const failed = checks.filter((c) => !c.ok);
  return { ok: failed.length === 0, checks, failed, requests };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const base = process.argv[2] || process.env.SMOKE_BASE_URL || DEFAULT_BASE_URL;
  console.log(`smoke: ${base}`);
  let result;
  try {
    result = await runSmoke(base);
  } catch (e) {
    console.error(`FAIL smoke could not run: ${e.message}`);
    process.exit(1);
  }
  for (const c of result.failed) console.log(`FAIL ${c.name}${c.detail ? ` - ${c.detail}` : ""}`);
  console.log(`${result.checks.length - result.failed.length}/${result.checks.length} checks passed, ${result.requests.length} GET requests, no /api/ calls`);
  process.exit(result.ok ? 0 : 1);
}

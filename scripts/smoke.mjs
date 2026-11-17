#!/usr/bin/env node
// Read-only smoke test for a deployed Kairo site (docs/RELEASE.md, step c).
// Usage: node scripts/smoke.mjs [baseUrl]   (default https://www.kairoapp.eu, or SMOKE_BASE_URL)
//
// Only GET requests to the site's own pages and assets. It never requests /api/* (no model call, no API spend),
// and it never requests another origin: a third-party reference is reported, not fetched. Redirects are followed by
// hand, one hop at a time, and the Location host is checked BEFORE the next request, so an off-site redirect is a
// failure and the other host is never contacted.
//
// What it reads for references (text based, no browser, no dependencies):
//   HTML   every checked page: script/link/img/srcset/source/video/audio/track/embed/iframe/object/input/svg image
//          and use, meta refresh, base href, inline <style> and inline <script> bodies, and style="" attributes.
//   CSS    @import, url(), image-set() strings, in .css files, inline <style> and style="" attributes.
//   JS     first-party modules and inline scripts: static import/export-from specifiers, import("..."), literal
//          arguments of fetch/importScripts/sendBeacon/Worker/WebSocket/EventSource/XHR open, .src assignments, and
//          literal asset paths and URLs (so "${location.origin}/fonts/print.css" is found).
// Limits: links to other sites (<a href>, .href assignments) are navigation, not loads, and are ignored. Vendor
// libraries under /vendor/ are fetched and type-checked but not scanned (minified code is full of URL strings).
// URLs built at run time are invisible to a text scan; e2e/network-log.spec.js watches a real browser for those.
// Exits 1 if any check fails. tests/smoke.test.js runs it against scripts/static-server.mjs.
import { fileURLToPath } from "node:url";

export const DEFAULT_BASE_URL = "https://www.kairoapp.eu";
const MAX_REQUESTS = 300;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 15000;
const PAGES = [
  { path: "/", text: "<title>Kairo</title>" },
  { path: "/privacy.html", text: "Privacy" },
];
// Views are loaded with import(`./views/${route}.js`), which a text scan cannot resolve, so they are listed here.
const VIEW_MODULES = ["home", "today", "pipeline", "role", "profile", "add", "stories"].map((n) => `/js/views/${n}.js`);
// The crawl must find these on its own. If the extractor ever stops finding one, that is a failure, not a pass.
const MUST_DISCOVER = [
  "/js/main.js",
  "/fonts/fonts.css",
  "/fonts/print.css",
  "/fonts/source-sans-pro-latin-400-normal.woff2",
  "/fonts/figtree-latin-400-normal.woff2",
  "/vendor/pdfjs/pdf.min.js",
  "/vendor/pdfjs/pdf.worker.min.js",
];
// Strict: the media type (before any ";") must be one of these. An extension that is not listed is a failure.
const EXPECTED_TYPE = {
  html: ["text/html"],
  css: ["text/css"],
  js: ["text/javascript", "application/javascript"],
  mjs: ["text/javascript", "application/javascript"],
  woff2: ["font/woff2"],
  woff: ["font/woff"],
  png: ["image/png"],
  jpg: ["image/jpeg"],
  jpeg: ["image/jpeg"],
  gif: ["image/gif"],
  webp: ["image/webp"],
  svg: ["image/svg+xml"],
  ico: ["image/x-icon", "image/vnd.microsoft.icon"],
  json: ["application/json"],
  pdf: ["application/pdf"],
};
const LOAD_REL = new Set([
  "stylesheet", "preload", "modulepreload", "prefetch", "prerender", "icon", "apple-touch-icon",
  "apple-touch-icon-precomposed", "apple-touch-startup-image", "mask-icon", "manifest", "dns-prefetch", "preconnect",
]);
const LOAD_ATTRS = {
  script: ["src"], img: ["src", "srcset"], source: ["src", "srcset"], video: ["src", "poster"], audio: ["src"],
  track: ["src"], embed: ["src"], iframe: ["src"], frame: ["src"], object: ["data"], input: ["src"],
  image: ["href", "xlink:href"], use: ["href", "xlink:href"], feimage: ["href", "xlink:href"],
};
const FILE_EXT = "m?js|css|woff2?|png|jpe?g|gif|webp|svg|ico|json|pdf";

const mediaType = (res) => (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
const extOf = (pathname) => (pathname.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || (pathname.endsWith("/") ? "html" : "");

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", colon: ":", sol: "/", period: "." };
const decodeEntities = (s) =>
  s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));?/gi, (m, hex, dec, name) => {
    if (hex || dec) { try { return String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)); } catch { return m; } }
    return ENTITIES[name.toLowerCase()] ?? m;
  });

// Attributes of one tag. First occurrence of a name wins (HTML spec). Handles "double", 'single' and unquoted values.
function parseAttrs(str) {
  const attrs = new Map();
  for (const m of str.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    const name = m[1].toLowerCase();
    if (!attrs.has(name)) attrs.set(name, decodeEntities(m[2] ?? m[3] ?? m[4] ?? ""));
  }
  return attrs;
}

// srcset: "a.png 1x, b.png 2x" (also "a.png,b.png 2x" and commas inside a URL, as the HTML spec reads it).
export function srcsetUrls(value) {
  const urls = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) i++;
    let start = i;
    while (i < value.length && !/\s/.test(value[i])) i++;
    let url = value.slice(start, i);
    if (url.endsWith(",")) url = url.replace(/,+$/, "");
    else while (i < value.length && value[i] !== ",") i++; // skip the descriptor
    if (url) urls.push(url);
  }
  return urls;
}

const unescapeCss = (s) => s.replace(/\\([0-9a-f]{1,6})\s?/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; } });

// References inside CSS text: @import, url(), image-set() strings.
export function cssRefs(css) {
  const text = unescapeCss(css.replace(/\/\*[\s\S]*?\*\//g, ""));
  const refs = [];
  for (const m of text.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]*)"|'([^']*)'|([^\s"')]+))/gi)) refs.push(m[1] ?? m[2] ?? m[3]);
  for (const m of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s"')]*))\s*\)/gi)) refs.push(m[1] ?? m[2] ?? m[3]);
  for (const m of text.matchAll(/image-set\(([^)]*)\)/gi)) for (const s of m[1].matchAll(/"([^"]*)"|'([^']*)'/g)) refs.push(s[1] ?? s[2]);
  return [...new Set(refs.map((r) => r.trim()).filter(Boolean))];
}

// References inside JavaScript text (first-party modules and inline scripts).
export function jsRefs(js) {
  const refs = [];
  const add = (re, group = 2) => { for (const m of js.matchAll(re)) refs.push(m[group]); };
  add(/\bfrom\s*(["'`])([^"'`]+)\1/g); // import x from "a"; export * from "a"
  add(/\bimport\s*(["'`])([^"'`]+)\1/g); // import "a"
  add(/\bimport\s*\(\s*(["'`])([^"'`]+)\1/g); // import("a")
  add(/\b(?:fetch|importScripts|sendBeacon|Worker|SharedWorker|WebSocket|EventSource)\s*\(\s*(["'`])([^"'`]+)\1/g);
  add(/\.open\(\s*["'][A-Za-z]+["']\s*,\s*(["'`])([^"'`]+)\1/g); // XMLHttpRequest
  add(/\.(?:src|srcset|poster)\s*=\s*(["'`])([^"'`]+)\1/g);
  add(/setAttribute\(\s*["'](?:src|srcset|data|poster)["']\s*,\s*(["'`])([^"'`]+)\1/g);
  // Literal asset paths ("/fonts/a.css", `${location.origin}/fonts/print.css`, "//host/a.js") and absolute asset URLs.
  add(new RegExp(`["'\`}]((?:\\.{1,2})?\\/[\\w.\\-/:]+\\.(?:${FILE_EXT}))(?:[?#][^"'\`\\s]*)?["'\`]`, "g"), 1);
  add(new RegExp(`["'\`](https?:\\/\\/[^"'\`\\s]+?\\.(?:${FILE_EXT}))(?:[?#][^"'\`\\s]*)?["'\`]`, "g"), 1);
  // Bare package names are not fetched by the browser without an import map, so only paths and URLs count.
  return refs.filter((r) => /^(\.{0,2}\/|https?:\/\/)/i.test(r) && !r.includes("${"));
}

// Resource references in an HTML page. Strings, in document order (duplicates removed).
export function htmlRefs(html) {
  const refs = [];
  const style = (v) => { if (v) refs.push(...cssRefs(v)); };
  const tag = (name, attrs) => {
    if (name === "link") {
      const rel = (attrs.get("rel") || "").toLowerCase().split(/\s+/);
      if (rel.some((r) => LOAD_REL.has(r))) {
        refs.push(attrs.get("href") ?? "");
        refs.push(...srcsetUrls(attrs.get("imagesrcset") ?? ""));
      }
    } else if (name === "meta") {
      if ((attrs.get("http-equiv") || "").toLowerCase() === "refresh") {
        const u = (attrs.get("content") || "").match(/url\s*=\s*["']?([^"';]+)/i);
        if (u) refs.push(u[1]);
      }
    } else if (name === "base") {
      // reported by htmlBase()
    } else {
      for (const a of LOAD_ATTRS[name] || []) {
        const v = attrs.get(a);
        if (v == null) continue;
        if (a === "srcset") refs.push(...srcsetUrls(v)); else refs.push(v);
      }
    }
    style(attrs.get("style"));
  };
  let rest = html.replace(/<!--[\s\S]*?-->/g, "");
  // <script> and <style> bodies are raw text: take them out first so "<a href=" inside a script is not read as a tag.
  rest = rest.replace(/<(script|style)\b((?:"[^"]*"|'[^']*'|[^>"'])*)>([\s\S]*?)<\/\1\s*>/gi, (m, name, attrStr, body) => {
    const attrs = parseAttrs(attrStr);
    name = name.toLowerCase();
    if (name === "script") { tag("script", attrs); refs.push(...jsRefs(body)); } else { style(attrs.get("style")); refs.push(...cssRefs(body)); }
    return "";
  });
  for (const m of rest.matchAll(/<([a-zA-Z][^\s/>]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g)) tag(m[1].toLowerCase(), parseAttrs(m[2]));
  return [...new Set(refs.map((r) => r.trim()))].filter(Boolean);
}

// <base href>, if the page has one: relative references resolve against it.
export function htmlBase(html) {
  for (const m of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<base\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/gi)) {
    const href = parseAttrs(m[1]).get("href");
    if (href) return href;
  }
  return "";
}

// Kept for callers that pick the extractor by kind.
export function assetRefs(kind, text) {
  return kind === "css" ? cssRefs(text) : jsRefs(text);
}

export async function runSmoke(baseUrl = DEFAULT_BASE_URL, { fetchImpl = globalThis.fetch } = {}) {
  const base = new URL(baseUrl);
  const checks = [];
  const requests = [];
  const seen = new Set();
  const discovered = new Set();
  const queue = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), detail: ok ? "" : detail });

  // One GET, redirects followed by hand. Every URL (the first and every Location) is checked before it is requested.
  const fetchOwn = async (start) => {
    let url = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (url.origin !== base.origin) throw new Error(`refused to request another origin: ${url.origin}`);
      if (url.pathname.startsWith("/api/")) throw new Error(`refused to request ${url.pathname} (smoke makes no API calls)`);
      requests.push(url.href);
      const res = await fetchImpl(url, {
        method: "GET", redirect: "manual", cache: "no-store", headers: { "user-agent": "kairo-smoke-check" }, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = new Uint8Array(await res.arrayBuffer());
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location) {
        const next = new URL(location, url);
        if (next.origin !== base.origin) throw new Error(`redirected off-site to ${next.origin}`);
        url = next;
        continue;
      }
      return { res, url, body, text: () => new TextDecoder().decode(body) };
    }
    throw new Error(`more than ${MAX_REDIRECTS} redirects`);
  };

  // A reference found in `from`: another origin is reported and never requested; same-origin is queued once.
  // `fromCode`: the reference is in a JS module, where "/api/evaluate" is the app's own click-time call, not a page load.
  const handleRef = (raw, from, label, fromCode = false) => {
    if (/^(data|blob):|^about:blank$|^javascript:/i.test(raw) || raw.startsWith("#")) return; // inline, never a request
    let url;
    try { url = new URL(raw, from); } catch { check(`${label}: valid reference`, false, `bad URL ${raw}`); return; }
    if (url.origin !== base.origin) {
      check(`no third-party request on load (${label})`, false, `${url.origin}${url.pathname} is loaded by ${label}`);
      return;
    }
    url.hash = "";
    if (url.pathname.startsWith("/api/")) {
      if (!fromCode) check(`no page-load request to /api/ (${label})`, false, `${label} references ${url.pathname}; smoke never calls /api/`);
      return;
    }
    discovered.add(url.pathname);
    if (!seen.has(url.href)) { seen.add(url.href); queue.push(url); }
  };

  const checkType = (url, res, label) => {
    const ext = extOf(url.pathname);
    const want = EXPECTED_TYPE[ext];
    if (!want) { check(`${label} has a known content type`, false, `no expected type for .${ext || "(none)"}; content-type ${res.headers.get("content-type")}`); return; }
    check(`${label} has type ${want[0]}`, want.includes(mediaType(res)), `content-type ${res.headers.get("content-type")}`);
  };

  // Pages: status, type, charset, expected text; every reference on the page is queued or reported.
  for (const p of PAGES) {
    try {
      const { res, url, text } = await fetchOwn(new URL(p.path, base));
      const html = text();
      check(`${p.path} returns 200`, res.status === 200, `status ${res.status}`);
      check(`${p.path} is text/html`, mediaType(res) === "text/html", `content-type ${res.headers.get("content-type")}`);
      check(`${p.path} declares charset utf-8`, /charset=utf-8/i.test(res.headers.get("content-type") || ""), `content-type ${res.headers.get("content-type")}`);
      check(`${p.path} contains ${JSON.stringify(p.text)}`, html.includes(p.text), "expected text missing");
      let from = url;
      const baseHref = htmlBase(html);
      if (baseHref) {
        handleRef(baseHref, url, `${p.path} <base>`);
        try { from = new URL(baseHref, url); } catch { /* reported above */ }
      }
      for (const raw of htmlRefs(html)) handleRef(raw, from, p.path);
    } catch (e) {
      check(`${p.path} can be fetched`, false, e.message);
    }
  }
  for (const v of VIEW_MODULES) handleRef(v, base, "view module list");

  // Assets: crawl same-origin references; every one must be 200 with the expected type and a non-empty body.
  while (queue.length) {
    if (requests.length > MAX_REQUESTS) { check("crawl within request limit", false, `more than ${MAX_REQUESTS} requests`); break; }
    const wanted = queue.shift();
    try {
      const { res, url, body, text } = await fetchOwn(wanted);
      check(`${wanted.pathname} returns 200`, res.status === 200, `status ${res.status}`);
      checkType(url, res, wanted.pathname);
      check(`${wanted.pathname} is not empty`, body.byteLength > 0, "empty body");
      // First-party code only: vendor libraries (pdf.js) are checked for status and type, not scanned.
      const ext = extOf(url.pathname);
      if (!url.pathname.startsWith("/vendor/") && res.status === 200) {
        if (ext === "css") for (const raw of cssRefs(text())) handleRef(raw, url, wanted.pathname);
        else if (ext === "js" || ext === "mjs") for (const raw of jsRefs(text())) handleRef(raw, url, wanted.pathname, true);
      }
    } catch (e) {
      check(`${wanted.pathname} can be fetched`, false, e.message);
    }
  }

  for (const p of MUST_DISCOVER) check(`${p} was found by the crawl`, discovered.has(p), "no page or module referenced it");
  check("no request to /api/ paths", !requests.some((u) => new URL(u).pathname.startsWith("/api/")), "an /api/ request was made");
  check("no request to another origin", !requests.some((u) => new URL(u).origin !== base.origin), "another origin was requested");
  check("assets were checked", requests.length > PAGES.length, "only the pages were fetched");
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

// GDPR: no third-party hosts on page load (build-plan rule 8).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("index.html loads no third-party fonts, scripts or styles", () => {
  const html = read("public/index.html");
  for (const host of ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com", "cdn.jsdelivr.net", "unpkg.com"]) {
    assert.ok(!html.includes(host), `third-party host found: ${host}`);
  }
});

test("self-hosted assets exist and the privacy notice names both processors", () => {
  for (const f of ["vendor/pdfjs/pdf.min.js", "vendor/pdfjs/pdf.worker.min.js", "fonts/fonts.css", "fonts/print.css"]) {
    assert.ok(fs.existsSync(path.join(__dirname, "..", "public", f)), f);
  }
  const p = read("public/privacy.html");
  assert.match(p, /Vercel/);
  assert.match(p, /Anthropic/);
});

test("every font file referenced by the CSS exists", () => {
  for (const css of ["fonts.css", "print.css"]) {
    for (const m of read(`public/fonts/${css}`).matchAll(/url\(\/fonts\/([^)]+)\)/g)) {
      assert.ok(fs.existsSync(path.join(__dirname, "..", "public", "fonts", m[1])), m[1]);
    }
  }
});

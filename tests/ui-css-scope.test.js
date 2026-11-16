// Phase 3 spec §2 (issue #27): CSS loading and scoping lint, so screens cannot restyle legacy pages or each other.
// - every selector in css/views/<x>.css starts with #view-<x>
// - every selector in css/ui.css uses a .k- class
// - only canonical tokens from tokens.css (no legacy aliases), no colour literals
// - index.html links ui.css and the 7 view files statically, right after shell.css
// - the ui/ kit and the views never use innerHTML (spec §5: h() or esc())
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "public");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const SCREENS = ["home", "role", "today", "pipeline", "profile", "add", "stories"];
const LEGACY_ALIASES = ["page-bg", "text-primary", "text-secondary", "nav-bg", "text-on-dark", "text-on-dark-muted", "accent", "accent-dark",
  "btn-primary-bg", "btn-primary-text", "neutral-num", "strong", "review", "weak", "gauge-a", "gauge-b", "gauge-c"];

// Returns every style-rule selector list, skipping @keyframes bodies and descending into @media/@supports/@container.
function selectors(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  let i = 0;
  function block(depth) {
    let start = i;
    while (i < src.length) {
      const c = src[i];
      if (c === "{") {
        const head = src.slice(start, i).trim();
        i++;
        if (/^@(keyframes|-webkit-keyframes|font-face|page)\b/.test(head)) skip();
        else if (head.startsWith("@")) block(depth + 1);
        else { out.push(head); skip(); }
        start = i;
      } else if (c === "}") { i++; if (depth > 0) return; start = i; } else if (c === ";" && src.slice(start, i).trim().startsWith("@")) { i++; start = i; } else i++;
    }
  }
  function skip() { let d = 1; while (i < src.length && d > 0) { if (src[i] === "{") d++; else if (src[i] === "}") d--; i++; } }
  block(0);
  // split selector lists on top-level commas only (not inside :is(...) / :not(...))
  return out.flatMap((s) => { const parts = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { parts.push(cur.trim()); cur = ""; } else cur += ch; } parts.push(cur.trim()); return parts.filter(Boolean); });
}

function tokenProblems(file, css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set([...read("css/tokens.css").matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const problems = [];
  for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b(?![\w-])/g)) {
    // a hex literal is only allowed as part of an id selector (#view-x), which never matches this pattern
    problems.push(`${file}: colour literal ${m[0]}`);
  }
  for (const m of src.matchAll(/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g)) problems.push(`${file}: colour function ${m[0]}`);
  for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
    if (!defined.has(m[1])) problems.push(`${file}: undefined token ${m[1]}`);
    else if (LEGACY_ALIASES.includes(m[1].slice(2))) problems.push(`${file}: legacy alias ${m[1]} (use the canonical token)`);
  }
  for (const m of src.matchAll(/(?<![\w-])(--[a-z0-9-]+)\s*:/g)) problems.push(`${file}: defines token ${m[1]} (tokens live in tokens.css)`);
  return problems;
}

test("the selector parser handles lists, @media and @keyframes", () => {
  const s = selectors("/* c */ .a, .b:is(.c, .d) { x: 1 } @media (min-width: 1px) { #view-x .e { y: 2 } } @keyframes k { 50% { opacity: 0 } } .f::backdrop { z: 3 }");
  assert.deepEqual(s, [".a", ".b:is(.c, .d)", "#view-x .e", ".f::backdrop"]);
});

test("index.html links ui.css then the 7 view files statically, right after shell.css", () => {
  const links = [...read("index.html").matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  const at = links.indexOf("/css/shell.css");
  assert.ok(at >= 0);
  assert.deepEqual(links.slice(at + 1), ["/css/ui.css", ...SCREENS.map((s) => `/css/views/${s}.css`)]);
  for (const l of links.slice(at + 1)) assert.ok(fs.existsSync(path.join(ROOT, l)), l);
  assert.doesNotMatch(read("index.html"), /<style[\s>]/);
});

test("every selector in css/views/<screen>.css starts with #view-<screen>", () => {
  const bad = [];
  for (const s of SCREENS) {
    const f = `css/views/${s}.css`;
    for (const sel of selectors(read(f))) if (!new RegExp(`^#view-${s}(?![\\w-])`).test(sel)) bad.push(`${f}: ${sel}`);
  }
  assert.deepEqual(bad, []);
});

test("no other files under css/views/", () => {
  const files = fs.readdirSync(path.join(ROOT, "css", "views")).sort();
  assert.deepEqual(files, SCREENS.map((s) => `${s}.css`).sort());
});

test("every selector in css/ui.css uses a .k- class", () => {
  const sels = selectors(read("css/ui.css"));
  assert.ok(sels.length > 0);
  assert.deepEqual(sels.filter((s) => !/\.k-[a-z]/.test(s)), []);
});

test("ui.css and view files: canonical tokens only, no colour literals, no new tokens", () => {
  const problems = ["css/ui.css", ...SCREENS.map((s) => `css/views/${s}.css`)].flatMap((f) => tokenProblems(f, read(f)));
  assert.deepEqual(problems, []);
});

test("the lint catches what it must", () => {
  assert.deepEqual(tokenProblems("x", ".k-a { color: #fff; background: rgb(0,0,0); border-color: var(--accent); --own: 1px; }").length, 4);
  assert.deepEqual(selectors(".view-x, #view-xy .a, #view-x .b { c: 1 }").filter((s) => !/^#view-x(?![\w-])/.test(s)), [".view-x", "#view-xy .a"]);
});

test("the ui kit and views never use innerHTML / outerHTML / insertAdjacentHTML", () => {
  const dirs = ["js/ui", "js/views"];
  const bad = [];
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith(".js") && /\.(innerHTML|outerHTML)\s*=|insertAdjacentHTML\s*\(/.test(read(p))) bad.push(p);
  });
  dirs.forEach(walk);
  assert.deepEqual(bad, []);
});

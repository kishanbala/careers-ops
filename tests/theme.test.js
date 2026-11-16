// Phase 2A: tokens (both themes, exact design §4 hex, legacy aliases, no dangling var()), theme-boot and theme.js.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..", "public");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const tokens = read("css/tokens.css");

// Extract the declarations of the first rule whose selector contains `sel`.
function block(css, selRe) {
  const m = css.match(new RegExp(`(?:^|\\n)\\s*${selRe}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `rule not found: ${selRe}`);
  return Object.fromEntries([...m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((x) => [x[1], x[2].trim()]));
}
const light = block(tokens, ':root,\\s*\\[data-theme="light"\\]');
const dark = block(tokens, '\\[data-theme="dark"\\]');
const osDark = block(tokens, ':root:not\\(\\[data-theme\\]\\)');
const shared = block(tokens, ":root");

test("both themes define the same canonical token set (and the OS-dark fallback matches dark)", () => {
  const keys = (o) => Object.keys(o).filter((k) => !k.startsWith("--shadow")).sort();
  assert.deepEqual(keys(dark), keys(light));
  assert.deepEqual(keys(osDark), keys(dark));
  for (const k of Object.keys(dark)) assert.equal(osDark[k], dark[k], `OS-dark fallback differs for ${k}`);
});

const hex = (v) => v.toUpperCase();
test("design §4 hex values are exact in light", () => {
  const exp = { "--bg": "#ECEEF0", "--surface": "#FFFFFF", "--surface-sub": "#F6F7F8", "--border": "#D5D9DE", "--text": "#1E2227", "--muted": "#545B64",
    "--primary": "#B08D57", "--primary-border": "#8F6F3C", "--on-primary": "#1E2227", "--ink": "#2B3036", "--on-ink": "#FFFFFF", "--ink-muted": "#C3C8CF",
    "--chip-bg": "#E4E7EA", "--chip-text": "#1E2227", "--strip-strong": "#A6834E", "--strip-mid": "#9AA1AA", "--strip-track": "#E4E7EA",
    "--apply-text": "#7A5C2E", "--apply-border": "#B08D57" };
  for (const [k, v] of Object.entries(exp)) assert.equal(hex(light[k]), v, k);
  assert.equal(light["--primary-sheen"], "linear-gradient(180deg, #D4B47A 0%, #B08D57 50%, #9A7743 100%)");
  assert.equal(light["--ink-sheen"], "linear-gradient(135deg, #3A4048 0%, #2B3036 50%, #1E2227 100%)");
});

test("design §4 hex values are exact in dark", () => {
  const exp = { "--bg": "#111316", "--surface": "#1A1D21", "--surface-sub": "#15181B", "--border": "#2C3137", "--text": "#E8EAED", "--muted": "#A2A9B2",
    "--primary": "#C9A66B", "--on-primary": "#111316", "--ink": "#2A2F35", "--on-ink": "#F4F5F7", "--ink-muted": "#B4BAC2",
    "--chip-bg": "#262B31", "--chip-text": "#D9DDE2", "--strip-strong": "#C9A66B", "--strip-mid": "#5C646E", "--strip-track": "#24282E",
    "--apply-text": "#D9BC85", "--apply-border": "#C9A66B" };
  for (const [k, v] of Object.entries(exp)) assert.equal(hex(dark[k]), v, k);
  assert.equal(dark["--primary-sheen"], "linear-gradient(180deg, #E3C68E 0%, #C9A66B 50%, #A88548 100%)");
  assert.equal(dark["--ink-sheen"], "linear-gradient(135deg, #3A4047 0%, #262A30 50%, #1D2025 100%)");
});

test("medals, fonts, radii and sizes", () => {
  assert.equal(shared["--medal-gold"], "linear-gradient(135deg, #F3D98A 0%, #C9A227 50%, #A8841A 100%)");
  assert.equal(shared["--medal-silver"], "linear-gradient(135deg, #F4F5F7 0%, #B9BEC6 50%, #9AA0A9 100%)");
  assert.equal(shared["--medal-bronze"], "linear-gradient(135deg, #E2A777 0%, #A8693A 50%, #A96432 100%)");
  assert.match(shared["--font-display"], /^'Familjen Grotesk'/);
  assert.match(shared["--font-body"], /^'Figtree'/);
  assert.match(shared["--font-mono"], /^'IBM Plex Mono'/);
  assert.equal(shared["--radius-card"], "22px");
  assert.equal(shared["--radius-pill"], "999px");
  assert.equal(shared["--tap-min"], "44px");
  assert.equal(shared["--theme-dur"], "220ms");
});

test("legacy aliases stay resolvable", () => {
  const exp = { "--page-bg": "--bg", "--text-primary": "--text", "--text-secondary": "--muted", "--nav-bg": "--ink", "--text-on-dark": "--on-ink",
    "--text-on-dark-muted": "--ink-muted", "--accent": "--primary", "--accent-dark": "--primary-border", "--btn-primary-bg": "--primary",
    "--btn-primary-text": "--on-primary", "--neutral-num": "--text" };
  for (const [k, v] of Object.entries(exp)) assert.equal(shared[k], `var(${v})`, k);
  for (const k of ["--strong", "--review", "--weak", "--gauge-a", "--gauge-b", "--gauge-c"]) assert.ok(light[k] && dark[k], k);
  for (const k of ["--radius", "--radius-lg", "--nav-width", "--top-nav-h"]) assert.ok(shared[k], k);
  assert.ok(light["--shadow-sm"] && light["--shadow-md"] && dark["--shadow-sm"] && dark["--shadow-md"]);
});

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? (e.name === "vendor" ? [] : walk(p)) : [p];
  });
}

test("every var(--x) in css/js/index.html resolves to a defined token", () => {
  const defined = new Set();
  const defFiles = ["css/tokens.css", "css/shell.css"].filter((f) => fs.existsSync(path.join(ROOT, f)));
  for (const f of defFiles) for (const m of read(f).matchAll(/(--[a-z0-9-]+)\s*:/g)) defined.add(m[1]);
  const files = walk(path.join(ROOT, "css")).concat(walk(path.join(ROOT, "js")), [path.join(ROOT, "index.html")]);
  const missing = [];
  for (const f of files) {
    if (!/\.(css|js|html)$/.test(f)) continue;
    for (const m of fs.readFileSync(f, "utf8").matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      if (!defined.has(m[1])) missing.push(`${path.relative(ROOT, f)}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("self-hosted fonts exist, are woff2, and have licence texts; no remote URLs in fonts.css", () => {
  const css = read("fonts/fonts.css");
  assert.doesNotMatch(css, /https?:\/\//);
  const families = new Set([...css.matchAll(/font-family:'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual([...families].sort(), ["Familjen Grotesk", "Figtree", "IBM Plex Mono"]);
  for (const m of css.matchAll(/url\(\/fonts\/([^)]+)\)/g)) {
    const buf = fs.readFileSync(path.join(ROOT, "fonts", m[1]));
    assert.equal(buf.subarray(0, 4).toString("latin1"), "wOF2", m[1]);
  }
  for (const f of ["familjen-grotesk", "figtree", "ibm-plex-mono"]) {
    assert.match(read(`fonts/LICENSE-${f}.txt`), /SIL Open Font License/);
    assert.match(fs.readFileSync(path.join(__dirname, "..", "THIRD_PARTY_NOTICES.md"), "utf8"), new RegExp(`LICENSE-${f}\\.txt`));
  }
});

test("components.css has the theme transition rule and 44px toggle; theme-boot is a classic script", () => {
  const c = read("css/components.css");
  assert.match(c, /\[data-theme-anim\] \*/);
  assert.match(c, /var\(--theme-dur\)/);
  assert.match(c, /\.theme-toggle\s*\{[^}]*min-height:\s*var\(--tap-min\)/);
  const boot = read("js/theme-boot.js");
  assert.doesNotMatch(boot, /^\s*(import|export)\s/m);
  assert.match(boot, /try\s*\{/);
});

// ---------- runtime: shims ----------
function makeEnv({ saved, dark = false, throwStorage = false } = {}) {
  const store = new Map(saved === undefined ? [] : [["co_theme", saved]]);
  const attrs = {};
  const dataset = {};
  const events = [];
  const timers = [];
  const mqls = [];
  const localStorage = {
    getItem: (k) => { if (throwStorage) throw new Error("blocked"); return store.has(k) ? store.get(k) : null; },
    setItem: (k, v) => { if (throwStorage) throw new Error("blocked"); store.set(k, String(v)); },
  };
  const html = {
    dataset, getAttribute: (k) => attrs[k] ?? null,
    setAttribute(k, v) { attrs[k] = v; if (k === "data-theme") dataset.theme = v; },
    removeAttribute(k) { delete attrs[k]; },
  };
  // theme.js writes el.dataset.theme directly; keep attrs in step for assertions
  Object.defineProperty(dataset, "theme", { get() { return attrs["data-theme"]; }, set(v) { attrs["data-theme"] = v; }, enumerable: true, configurable: true });
  const matchMedia = () => {
    const m = { matches: dark, listeners: [], addEventListener(_, fn) { m.listeners.push(fn); } };
    mqls.push(m);
    return m;
  };
  const window = { dispatchEvent: (e) => { events.push(e); return true; }, addEventListener() {}, removeEventListener() {}, matchMedia };
  return { store, attrs, html, localStorage, matchMedia, window, events, timers, mqls };
}

async function loadTheme(env) {
  global.document = { documentElement: env.html };
  global.window = env.window;
  global.localStorage = env.localStorage;
  global.matchMedia = env.matchMedia;
  global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } };
  const mod = await import(pathToFileURL(path.join(ROOT, "js", "theme.js")).href + `?${Math.random()}`);
  return mod;
}

function cleanup() {
  for (const k of ["document", "window", "localStorage", "matchMedia", "CustomEvent"]) delete global[k];
}

test("resolveTheme: saved wins, invalid is ignored, else OS", async () => {
  const env = makeEnv();
  const t = await loadTheme(env);
  try {
    assert.deepEqual(t.THEMES, ["light", "dark"]);
    assert.equal(t.THEME_KEY, "co_theme");
    assert.equal(t.resolveTheme("light", true), "light");
    assert.equal(t.resolveTheme("dark", false), "dark");
    assert.equal(t.resolveTheme(null, true), "dark");
    assert.equal(t.resolveTheme(null, false), "light");
    for (const bad of ["blue", "", 1, undefined, {}, "DARK"]) assert.equal(t.resolveTheme(bad, true), "dark");
    for (const bad of ["blue", "", 1, undefined, {}]) assert.equal(t.resolveTheme(bad, false), "light");
  } finally { cleanup(); }
});

test("setTheme persists JSON, sets attribute, fires event; persist:false does not write", async () => {
  const env = makeEnv();
  const t = await loadTheme(env);
  try {
    t.setTheme("dark");
    assert.equal(env.attrs["data-theme"], "dark");
    assert.equal(env.store.get("co_theme"), '"dark"');
    assert.equal(t.getSavedTheme(), "dark");
    assert.equal(env.events.at(-1).type, "kairo:themechange");
    assert.deepEqual(env.events.at(-1).detail, { theme: "dark" });
    assert.equal(env.attrs["data-theme-anim"], "");
    t.setTheme("light", { persist: false });
    assert.equal(env.attrs["data-theme"], "light");
    assert.equal(env.store.get("co_theme"), '"dark"');
    t.setTheme("purple");
    assert.equal(env.attrs["data-theme"], "light");
    assert.equal(t.toggleTheme(), "dark");
    assert.equal(t.toggleTheme(), "light");
    assert.equal(t.getTheme(), "light");
  } finally { cleanup(); }
});

test("getSavedTheme tolerates junk and blocked storage; setTheme still applies when storage throws", async () => {
  const env = makeEnv({ saved: "not json{" });
  const t = await loadTheme(env);
  try {
    assert.equal(t.getSavedTheme(), null);
    env.store.set("co_theme", '"mauve"');
    assert.equal(t.getSavedTheme(), null);
  } finally { cleanup(); }
  const env2 = makeEnv({ throwStorage: true });
  const t2 = await loadTheme(env2);
  try {
    assert.equal(t2.getSavedTheme(), null);
    t2.setTheme("dark");
    assert.equal(env2.attrs["data-theme"], "dark");
  } finally { cleanup(); }
});

test("initTheme is idempotent, follows the OS only while nothing is saved", async () => {
  const env = makeEnv({ dark: true });
  const t = await loadTheme(env);
  try {
    t.initTheme();
    t.initTheme();
    assert.equal(env.attrs["data-theme"], "dark");
    const withListener = env.mqls.filter((m) => m.listeners.length);
    assert.equal(withListener.length, 1, "second initTheme call must not add listeners");
    assert.equal(withListener[0].listeners.length, 1);
    assert.equal(env.store.has("co_theme"), false, "init never persists");
    withListener[0].listeners[0]({ matches: false });
    assert.equal(env.attrs["data-theme"], "light");
    t.setTheme("dark");
    withListener[0].listeners[0]({ matches: false });
    assert.equal(env.attrs["data-theme"], "dark", "saved choice wins over OS changes");
  } finally { cleanup(); }
});

test("theme-boot.js: saved value, OS fallback, junk and blocked storage", () => {
  const code = read("js/theme-boot.js");
  const run = ({ saved, dark, throwStorage, noMatchMedia }) => {
    const env = makeEnv({ saved, dark, throwStorage });
    const ctx = { document: { documentElement: env.html }, localStorage: env.localStorage, window: noMatchMedia ? {} : { matchMedia: env.matchMedia } };
    ctx.window.matchMedia = noMatchMedia ? undefined : env.matchMedia;
    vm.runInNewContext(code, ctx);
    return env.attrs["data-theme"];
  };
  assert.equal(run({ saved: '"dark"', dark: false }), "dark");
  assert.equal(run({ saved: '"light"', dark: true }), "light");
  assert.equal(run({ dark: true }), "dark");
  assert.equal(run({ dark: false }), "light");
  assert.equal(run({ saved: "garbage", dark: true }), "dark");
  assert.equal(run({ saved: '"neon"', dark: false }), "light");
  assert.equal(run({ throwStorage: true, dark: true }), "dark");
  assert.equal(run({ noMatchMedia: true }), "light");
});

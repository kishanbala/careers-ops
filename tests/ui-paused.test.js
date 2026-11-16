// Phase 3 spec §5, §7 (issue #27): ui/paused.js is the only way a screen renders a paused action;
// ui/tool-state.js renders running and error states. Paused controls stay focusable, send nothing, change nothing.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// ---------- small DOM shim with capture/bubble event dispatch (Node has no DOM) ----------
const kebab = (k) => "data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
class Text { constructor(d) { this.nodeType = 3; this.data = String(d); this.parentNode = null; } get textContent() { return this.data; } remove() { detach(this); } }
function detach(n) { if (n.parentNode) { n.parentNode.childNodes = n.parentNode.childNodes.filter((c) => c !== n); n.parentNode = null; } }
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.attrs = new Map(); this.listeners = [];
    const props = new Map();
    this.style = { setProperty: (k, v) => props.set(k, String(v)), getPropertyValue: (k) => props.get(k) ?? "" };
    const self = this;
    this.dataset = new Proxy({}, { set(_, k, v) { self.setAttribute(kebab(k), v); return true; }, get(_, k) { return self.getAttribute(kebab(k)) ?? undefined; } });
    this.classList = {
      add: (...cs) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); cs.forEach((c) => s.add(c)); self.setAttribute("class", [...s].join(" ")); },
      contains: (c) => self.className.split(/\s+/).includes(c),
    };
  }
  get type() { return this.getAttribute("type") || (this.tagName === "BUTTON" ? "submit" : "text"); }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  addEventListener(type, fn, capture = false) { this.listeners.push({ type, fn, capture: !!(capture && (capture === true || capture.capture)) }); }
  appendChild(c) { detach(c); c.parentNode = this; this.childNodes.push(c); return c; }
  append(...cs) { cs.forEach((c) => this.appendChild(typeof c === "string" ? new Text(c) : c)); }
  replaceChildren(...cs) { this.childNodes.forEach((c) => { c.parentNode = null; }); this.childNodes = []; this.append(...cs); }
  remove() { detach(this); }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get className() { return this.getAttribute("class") || ""; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === document.body; }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  matches(sel) {
    return sel.split(",").map((s) => s.trim()).some((s) => {
      const m = s.match(/^([a-z]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?$/i);
      if (!m) throw new Error("shim selector not supported: " + s);
      const [, tag, attr, val] = m;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (attr && !this.hasAttribute(attr) && !(attr === "type" && val !== undefined && this.type === val)) return false;
      if (attr && val !== undefined && (attr === "type" ? this.type : this.getAttribute(attr)) !== val) return false;
      return true;
    });
  }
  querySelectorAll(sel) { return this.all((c) => c.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  focus() { document.activeElement = this; }
}
function dispatch(target, type, init = {}) {
  const ev = { type, target, defaultPrevented: false, stopped: false, ...init };
  ev.preventDefault = () => { ev.defaultPrevented = true; };
  ev.stopPropagation = () => { ev.stopped = true; };
  ev.stopImmediatePropagation = () => { ev.stopped = true; ev.stoppedNow = true; };
  const pathUp = [];
  for (let n = target; n; n = n.parentNode) pathUp.push(n);
  const run = (node, capture) => {
    for (const l of node.listeners) {
      if (l.type !== type || l.capture !== capture) continue;
      l.fn(ev);
      if (ev.stoppedNow) return;
    }
  };
  for (const n of [...pathUp].reverse().slice(0, -1)) { run(n, true); if (ev.stopped) return ev; }
  run(target, true); if (ev.stopped) return ev; // at target: capture listeners first (current DOM spec)
  run(target, false); if (ev.stopped) return ev;
  for (const n of pathUp.slice(1)) { run(n, false); if (ev.stopped) return ev; }
  return ev;
}
globalThis.document = { createElement: (t) => new El(t), createTextNode: (d) => new Text(d), querySelectorAll: () => [], body: new El("body"), activeElement: null };

const JS = path.join(__dirname, "..", "public", "js");
const imp = (p) => import(pathToFileURL(path.join(JS, p)).href);
const BANNER = "Being rebuilt. Back soon.";

test("paused flags match the Architect spec; pausedBanner only for paused flags, exact text, stable id", async () => {
  const { FLAGS } = await imp("features.js");
  const { pausedBanner, bannerId } = await imp("ui/paused.js");
  const paused = Object.keys(FLAGS).filter((k) => FLAGS[k] === "paused").sort();
  assert.deepEqual(paused, ["cv.archetype", "cv.fullPreview", "pipeline.delete", "scan.portals", "scan.run"]);
  for (const f of paused) {
    const b = pausedBanner(f);
    assert.equal(b.tagName, "P");
    assert.ok(b.classList.contains("paused-banner"));
    assert.equal(b.textContent, BANNER);
    assert.equal(b.getAttribute("id"), bannerId(f));
    assert.match(b.getAttribute("id"), /^paused-[a-zA-Z-]+$/);
  }
  assert.equal(pausedBanner("stories.generate"), null);
  assert.equal(pausedBanner("stories.view"), null);
  assert.equal(pausedBanner("no.suchFlag").textContent, BANNER); // unknown = paused, never throws
});

test("pauseControl: aria-disabled, is-paused, describedby, still focusable; click and Enter/Space never reach the screen", async () => {
  const { pauseControl, bannerId } = await imp("ui/paused.js");
  const btn = new El("button");
  btn.setAttribute("class", "btn btn-outline");
  btn.setAttribute("aria-describedby", "hint");
  let ran = 0;
  btn.addEventListener("click", () => ran++);
  btn.addEventListener("keydown", () => ran++);
  assert.equal(pauseControl(btn, "pipeline.delete"), btn);
  assert.equal(btn.getAttribute("aria-disabled"), "true");
  assert.equal(btn.className, "btn btn-outline is-paused");
  assert.equal(btn.getAttribute("aria-describedby"), `hint ${bannerId("pipeline.delete")}`);
  assert.equal(btn.hasAttribute("disabled"), false);
  assert.notEqual(btn.getAttribute("tabindex"), "-1");
  assert.ok(dispatch(btn, "click").defaultPrevented);
  assert.ok(dispatch(btn, "keydown", { key: "Enter" }).defaultPrevented);
  assert.ok(dispatch(btn, "keydown", { key: " " }).defaultPrevented);
  assert.equal(ran, 0);
  assert.equal(dispatch(btn, "keydown", { key: "Tab" }).defaultPrevented, false); // focus can move on
  assert.equal(ran, 1);
  pauseControl(btn, "pipeline.delete"); // idempotent describedby
  assert.equal(btn.getAttribute("aria-describedby"), `hint ${bannerId("pipeline.delete")}`);
});

test("pauseControl on a container blocks its buttons and form submit, but text fields still take spaces", async () => {
  const { pauseControl } = await imp("ui/paused.js");
  const form = new El("form");
  const ta = new El("textarea");
  const run = new El("button");
  run.setAttribute("type", "submit");
  form.append(ta, run);
  let ran = 0;
  run.addEventListener("click", () => ran++);
  form.addEventListener("submit", () => ran++);
  pauseControl(form, "scan.run");
  assert.equal(run.getAttribute("aria-disabled"), "true");
  assert.ok(run.classList.contains("is-paused"));
  assert.ok(dispatch(run, "click").defaultPrevented);
  assert.ok(dispatch(form, "submit").defaultPrevented);
  assert.equal(ran, 0);
  assert.equal(dispatch(ta, "keydown", { key: " " }).defaultPrevented, false);
  assert.ok(dispatch(run, "keydown", { key: "Enter" }).defaultPrevented);
});

test("pauseControl leaves an 'on' action alone", async () => {
  const { pauseControl } = await imp("ui/paused.js");
  const btn = new El("button");
  let ran = 0;
  btn.addEventListener("click", () => ran++);
  pauseControl(btn, "stories.generate");
  assert.equal(btn.getAttribute("aria-disabled"), null);
  assert.equal(btn.getAttribute("aria-describedby"), null);
  dispatch(btn, "click");
  assert.equal(ran, 1);
});

test("showToolError: plain text message; empty-profile links to Profile; Try again only for retryable kinds", async () => {
  const { showToolError } = await imp("ui/tool-state.js");
  const { toolMessage } = await imp("api.js");
  const el = new El("div");
  showToolError(el, { ok: false, kind: "empty-profile" });
  const box = el.children[0];
  assert.equal(box.getAttribute("role"), "alert");
  assert.equal(box.querySelectorAll("p")[0].textContent, toolMessage({ kind: "empty-profile" }));
  assert.equal(box.querySelector("a[href]").getAttribute("href"), "#/profile");

  let retried = 0;
  showToolError(el, { ok: false, kind: "server" }, { retry: () => retried++ });
  const again = el.querySelector("button");
  assert.equal(again.textContent, "Try again");
  dispatch(again, "click");
  assert.equal(retried, 1);
  for (const kind of ["paused", "empty-input", "too-long", "refused"]) {
    showToolError(el, { ok: false, kind }, { retry: () => retried++ });
    assert.equal(el.querySelector("button"), null, kind);
  }
  showToolError(el, { ok: false, kind: "refused", message: '<img src=x onerror="alert(1)">' });
  assert.equal(el.all((c) => c.tagName === "IMG").length, 0);
  assert.equal(el.textContent, '<img src=x onerror="alert(1)">');
});

test("showRunning: polite live status, stop() removes it and clears the timer", async () => {
  const { showRunning } = await imp("ui/tool-state.js");
  const el = new El("div");
  document.body.append(el);
  const stop = showRunning(el, "Evaluating…");
  const node = el.children[0];
  assert.equal(node.getAttribute("role"), "status");
  assert.equal(node.getAttribute("aria-live"), "polite");
  assert.match(node.textContent, /^Evaluating… 0 s$/);
  assert.equal(el.getAttribute("aria-busy"), "true");
  stop();
  stop();
  assert.equal(el.children.length, 0);
  assert.equal(el.getAttribute("aria-busy"), null);
});

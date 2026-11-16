// Phase 3 spec §5 (issue #27): ui/score.js (weights, bands, strip) and the minimal ui/fit.js.
// WEIGHTS must equal lib/scoring.js WEIGHTS: drift between server scoring and the UI strip fails CI.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

// ---------- minimal DOM shim (Node has no DOM): elements, text, attributes, style, dataset ----------
class Text { constructor(d) { this.nodeType = 3; this.data = String(d); this.parentNode = null; } get textContent() { return this.data; } }
class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.nodeType = 1; this.childNodes = []; this.parentNode = null; this.attrs = new Map(); this.listeners = [];
    const props = new Map();
    this.style = { setProperty: (k, v) => props.set(k, String(v)), getPropertyValue: (k) => props.get(k) ?? "" };
    const self = this;
    this.dataset = new Proxy({}, {
      set(_, k, v) { self.setAttribute("data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()), v); return true; },
      get(_, k) { return self.getAttribute("data-" + String(k).replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())) ?? undefined; },
    });
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  addEventListener(type, fn) { this.listeners.push({ type, fn }); }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; }
  replaceChildren(...cs) { this.childNodes = []; cs.forEach((c) => this.appendChild(c)); }
  get children() { return this.childNodes.filter((c) => c.nodeType === 1); }
  get className() { return this.getAttribute("class") || ""; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(""); }
  all(pred, out = []) { for (const c of this.children) { if (pred(c)) out.push(c); c.all(pred, out); } return out; }
  byClass(cls) { return this.all((c) => c.className.split(/\s+/).includes(cls)); }
}
globalThis.document = { createElement: (t) => new El(t), createTextNode: (d) => new Text(d), querySelectorAll: () => [] };

const JS = path.join(__dirname, "..", "public", "js");
const load = () => import(pathToFileURL(path.join(JS, "ui", "score.js")).href);
const loadFit = () => import(pathToFileURL(path.join(JS, "ui", "fit.js")).href);
const evalData = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "api", "evaluate.json"), "utf8")).response.data;

test("WEIGHTS deep-equal lib/scoring.js WEIGHTS, sum to 1, frozen; DIM_LABELS cover the same 10 keys", async () => {
  const { WEIGHTS, DIM_LABELS } = await load();
  const server = require("../lib/scoring.js").WEIGHTS;
  assert.deepEqual({ ...WEIGHTS }, server);
  assert.deepEqual(Object.keys(WEIGHTS), Object.keys(server)); // same order: strip segments follow it
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(Object.isFrozen(WEIGHTS));
  assert.deepEqual(Object.keys(DIM_LABELS), Object.keys(server));
  for (const v of Object.values(DIM_LABELS)) assert.ok(typeof v === "string" && v.length > 1);
});

test("band: apply >= 4.0, worth a look 3.0-3.9, skip < 3.0, none when not a finite number (Bala, #27)", async () => {
  const { band, BAND_COPY } = await load();
  const cases = [[5, "apply"], [4.0, "apply"], [4.2, "apply"], [3.99, "look"], [3.9, "look"], [3.0, "look"], [2.99, "skip"], [1, "skip"], [0, "skip"], ["4.2", "apply"], ["3", "look"],
    [NaN, "none"], [Infinity, "none"], [null, "none"], [undefined, "none"], ["", "none"], ["  ", "none"], ["abc", "none"], [{}, "none"]];
  for (const [s, b] of cases) assert.equal(band(s), b, String(s));
  assert.deepEqual({ ...BAND_COPY }, { apply: "Apply", look: "Worth a look", skip: "Skip", none: "Not scored" });
});

test("fmtScore and applyLine", async () => {
  const { fmtScore, applyLine } = await load();
  assert.equal(fmtScore(4.2), "4.2");
  assert.equal(fmtScore(4), "4.0");
  assert.equal(fmtScore(3.25), "3.3");
  assert.equal(fmtScore("3.5"), "3.5");
  for (const v of [null, undefined, NaN, "", "x"]) assert.equal(fmtScore(v), "—");
  assert.equal(applyLine({ minscore: "3.5" }), 3.5);
  assert.equal(applyLine({ minscore: 4.5 }), 4.5);
  assert.equal(applyLine({ minscore: 1 }), 1);
  assert.equal(applyLine({ minscore: 5 }), 5);
  for (const p of [{ minscore: "0.5" }, { minscore: 6 }, { minscore: "" }, { minscore: "abc" }, {}, null, undefined]) assert.equal(applyLine(p), 4.0, JSON.stringify(p));
});

test("scoreStrip: 10 segments, width = weight, fill = score / 5, role=img with every dimension in the label", async () => {
  const { scoreStrip, WEIGHTS, DIM_LABELS } = await load();
  const strip = scoreStrip(evalData.scoring);
  assert.equal(strip.getAttribute("role"), "img");
  assert.ok(strip.className.includes("k-strip"));
  const segs = strip.byClass("k-strip-seg");
  assert.equal(segs.length, 10);
  Object.entries(WEIGHTS).forEach(([k, w], i) => {
    assert.equal(segs[i].dataset.dim, k);
    assert.equal(segs[i].style.getPropertyValue("flex-grow"), String(w));
    const fill = segs[i].byClass("k-strip-fill")[0];
    assert.equal(fill.style.getPropertyValue("height"), `${Math.round((evalData.scoring[k] / 5) * 10000) / 100}%`);
    assert.ok(fill.className.includes(evalData.scoring[k] >= 4 ? "k-strip-fill--strong" : "k-strip-fill--mid"));
  });
  const label = strip.getAttribute("aria-label");
  for (const k of Object.keys(WEIGHTS)) assert.ok(label.includes(DIM_LABELS[k]), k);
  assert.match(label, /apply line 4\.0/);
  const line = strip.byClass("k-strip-line")[0];
  assert.equal(line.getAttribute("aria-hidden"), "true");
  assert.equal(line.style.getPropertyValue("bottom"), "80%");
  assert.equal(scoreStrip(evalData.scoring, { applyLine: 3.5 }).byClass("k-strip-line")[0].style.getPropertyValue("bottom"), "70%");
});

test("scoreStrip without scores (legacy roles) renders empty segments, never NaN", async () => {
  const { scoreStrip } = await load();
  for (const sc of [undefined, null, {}, { northStar: "x", cvMatch: NaN }]) {
    const strip = scoreStrip(sc);
    assert.equal(strip.byClass("k-strip-seg").length, 10);
    assert.equal(strip.byClass("k-strip-fill").length, 0);
    assert.doesNotMatch(strip.getAttribute("aria-label"), /NaN|undefined/);
    assert.match(strip.getAttribute("aria-label"), /not scored/);
  }
});

test("bandPill text and class per band", async () => {
  const { bandPill } = await load();
  for (const [s, b, t] of [[4.2, "apply", "Apply"], [3.3, "look", "Worth a look"], [1.5, "skip", "Skip"], [undefined, "none", "Not scored"]]) {
    const el = bandPill(s);
    assert.equal(el.textContent, t);
    assert.ok(el.className.split(" ").includes(`k-band--${b}`));
  }
});

test("renderFit: grade, score, band, strip, all 10 dimensions and gaps, as text only", async () => {
  const { renderFit } = await loadFit();
  const el = new El("div");
  renderFit(el, evalData);
  const fit = el.children[0];
  assert.ok(fit.className.includes("k-fit"));
  assert.equal(fit.byClass("grade-chip")[0].textContent, evalData.grade);
  assert.equal(fit.byClass("k-fit-num")[0].textContent, evalData.finalScore.toFixed(1));
  assert.equal(fit.byClass("k-band")[0].textContent, "Worth a look"); // 3.3
  assert.equal(fit.byClass("k-strip").length, 1);
  assert.equal(fit.byClass("k-fit-dim").length, 10);
  assert.equal(fit.byClass("k-fit-gap").length, evalData.gaps.length);
  const compact = new El("div");
  renderFit(compact, evalData, { compact: true });
  assert.equal(compact.byClass("k-fit-dim").length, 0);
  assert.equal(compact.byClass("k-strip").length, 1);
  // model output stays text: no element is created from it
  const evil = new El("div");
  renderFit(evil, { ...evalData, roleTitle: '<img src=x onerror="alert(1)">', gaps: [{ gap: "<script>x</script>", why: "w" }] });
  assert.equal(evil.all((c) => c.tagName === "IMG" || c.tagName === "SCRIPT").length, 0);
  assert.match(evil.textContent, /<img src=x/);
  // empty data and a role-only fallback do not throw
  const empty = new El("div");
  renderFit(empty, null, { role: { role: "R", company: "C", score: 4.1, grade: "A-" } });
  assert.equal(empty.byClass("k-band")[0].textContent, "Apply");
});

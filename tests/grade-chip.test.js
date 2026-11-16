// Phase 2A: medal grade chips.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "render", "grade-chip.js")).href);

test("gradeTier: A gold, A- silver, B+ bronze, rest steel", async () => {
  const { gradeTier } = await load();
  assert.equal(gradeTier("A"), "gold");
  assert.equal(gradeTier("A-"), "silver");
  assert.equal(gradeTier("B+"), "bronze");
  for (const g of ["B", "B-", "C", "C+", "D", "F", "A+", "", "  ", "unknown", null, undefined, 4]) assert.equal(gradeTier(g), "steel", String(g));
});

test("gradeTier trims and uppercases", async () => {
  const { gradeTier } = await load();
  assert.equal(gradeTier(" a "), "gold");
  assert.equal(gradeTier("a-"), "silver");
  assert.equal(gradeTier("b+ "), "bronze");
});

test("gradeChip markup, sizes and aria-label", async () => {
  const { gradeChip } = await load();
  assert.equal(gradeChip("A"), '<span class="grade-chip grade-chip--gold grade-chip--md" aria-label="Grade A">A</span>');
  assert.match(gradeChip("A-", { size: "sm" }), /grade-chip--silver grade-chip--sm/);
  assert.match(gradeChip("B+", { size: "lg" }), /grade-chip--bronze grade-chip--lg/);
  assert.match(gradeChip("C"), /grade-chip--steel grade-chip--md/);
  assert.match(gradeChip(""), /aria-label="Grade "/);
});

test("gradeChip escapes model output", async () => {
  const { gradeChip } = await load();
  const out = gradeChip('<img src=x onerror="alert(1)">');
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img/);
  assert.match(out, /&quot;/);
  assert.match(gradeChip("A", { size: '"><script>' }), /&quot;&gt;&lt;script&gt;/);
});

test("bronze medal: black chip text reaches AA (4.5:1) on every gradient stop (BUG-16)", () => {
  const css = require("node:fs").readFileSync(path.join(__dirname, "..", "public", "css", "tokens.css"), "utf8");
  const m = css.match(/--medal-bronze:\s*linear-gradient\(([^)]*)\)/);
  assert.ok(m, "--medal-bronze not found");
  const stops = [...m[1].matchAll(/#([0-9A-Fa-f]{6})/g)].map((x) => x[1]);
  assert.equal(stops.length, 3);
  assert.deepEqual(stops.slice(0, 2).map((s) => s.toUpperCase()), ["E2A777", "A8693A"], "light and mid stops are fixed by design");
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (h) => 0.2126 * lin(parseInt(h.slice(0, 2), 16)) + 0.7152 * lin(parseInt(h.slice(2, 4), 16)) + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
  for (const s of stops) assert.ok((lum(s) + 0.05) / 0.05 >= 4.5, `black on #${s}`);
});

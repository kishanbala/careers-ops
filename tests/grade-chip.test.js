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

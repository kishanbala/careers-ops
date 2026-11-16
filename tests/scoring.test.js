// Tests for lib/scoring.js: deterministic weighted scoring (weights from upstream modes/ofertas.md).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { WEIGHTS, LEGACY_DIMENSIONS, gradeFor, recommendationFor, applyScoring } = require("../lib/scoring.js");

const scoring = (v) => Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, v]));

test("weights sum to exactly 1.0 and there are 10 dimensions", () => {
  assert.equal(Object.keys(WEIGHTS).length, 10);
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("uniform scores give that same total", () => {
  for (const v of [1, 3, 4.5, 5]) assert.equal(applyScoring({ scoring: scoring(v) }).finalScore, v);
});

test("weighted total uses the upstream weights (hand-computed case)", () => {
  // northStar 5 (.25) + cvMatch 4 (.15) + level 3 (.15) + comp 2 (.10) + growth 4 (.10) + five 3s (.25 total)
  // = 1.25 + 0.60 + 0.45 + 0.20 + 0.40 + 0.75 = 3.65 -> 3.7
  const sc = { ...scoring(3), northStar: 5, cvMatch: 4, comp: 2, growth: 4 };
  const out = applyScoring({ scoring: sc });
  assert.equal(out.finalScore, 3.7);
  assert.equal(out.grade, "B+");
});

test("grade boundaries match the web app's scale", () => {
  assert.deepEqual([4.5, 4.4, 4.0, 3.9, 3.5, 3.4, 3.0, 2.9, 2.5, 2.4].map(gradeFor), ["A", "A-", "A-", "B+", "B+", "B", "B", "C", "C", "D"]);
});

test("below 3.0 is advised against (upstream ethics rule)", () => {
  assert.match(recommendationFor(2.9), /Skip/);
  assert.equal(recommendationFor(3.0), "Consider");
  assert.equal(recommendationFor(4.0), "Recommend");
  assert.equal(recommendationFor(4.5), "Strongly Recommend");
});

test("legacy 6-key dimensions the UI renders are derived from the 10 dimensions, numbers only", () => {
  const sc = { ...scoring(3), northStar: 5, comp: 2, growth: 4, cultureSignals: 1, companyReputation: 2 };
  const out = applyScoring({ scoring: sc, dimensions: { stale: 1 } });
  assert.deepEqual(Object.keys(out.dimensions).sort(), Object.keys(LEGACY_DIMENSIONS).sort());
  assert.deepEqual(out.dimensions, { roleImpact: 5, cvMatch: 3, compensation: 2, growthPath: 4, teamCulture: 1, missionAlign: 2 });
  assert.ok(Object.values(out.dimensions).every((v) => typeof v === "number"));
});

test("draft answers (section G) are dropped below 4.5 and kept at or above it", () => {
  const drafts = [{ question: "Why us?", answer: "..." }];
  assert.deepEqual(applyScoring({ scoring: scoring(4), draftAnswers: drafts }).draftAnswers, []);
  assert.deepEqual(applyScoring({ scoring: scoring(4.5), draftAnswers: drafts }).draftAnswers, drafts);
  assert.deepEqual(applyScoring({ scoring: scoring(5) }).draftAnswers, []);
});

test("data without a valid scoring block is returned untouched so the legacy UI fields survive", () => {
  const legacy = { finalScore: 4.2, grade: "A-", dimensions: { roleImpact: 4 } };
  assert.equal(applyScoring(legacy), legacy);
  assert.equal(applyScoring({ ...legacy, scoring: { northStar: 5 } }).finalScore, 4.2); // incomplete
  assert.equal(applyScoring({ ...legacy, scoring: { ...scoring(3), comp: 9 } }).finalScore, 4.2); // out of range
  assert.equal(applyScoring({ ...legacy, scoring: { ...scoring(3), comp: "4" } }).finalScore, 4.2); // wrong type
  assert.equal(applyScoring(null), null);
  assert.deepEqual(applyScoring({ raw: "text" }), { raw: "text" });
});

test("does not mutate its input", () => {
  const input = { scoring: scoring(4), finalScore: 1 };
  applyScoring(input);
  assert.equal(input.finalScore, 1);
});

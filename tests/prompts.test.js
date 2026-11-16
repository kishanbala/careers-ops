// Tests for the prompt layer: prompts/*.md (derived from santifer/career-ops modes/) -> lib/prompts.generated.js.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const PROMPTS = require("../lib/prompts.generated.js");
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "prompts", "modes.json"), "utf8"));
const MODES = Object.keys(MANIFEST).filter((m) => !m.startsWith("_"));

test("generated prompts are in sync with prompts/*.md", () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-prompts.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});

test("every mode in the manifest has a built prompt, and nothing extra", () => {
  assert.deepEqual(Object.keys(PROMPTS).sort(), MODES.slice().sort());
});

test("every mode carries the shared rules and no HTML comments leak into the prompt", () => {
  for (const mode of MODES) {
    assert.ok(PROMPTS[mode].includes("SOURCES OF TRUTH"), `${mode} lacks shared rules`);
    assert.ok(!PROMPTS[mode].includes("<!--"), `${mode} contains an HTML comment`);
  }
});

test("every prompt file declares which upstream file it derives from (attribution)", () => {
  for (const mode of MODES) {
    const last = MANIFEST[mode].parts[MANIFEST[mode].parts.length - 1];
    const text = fs.readFileSync(path.join(ROOT, "prompts", `${last}.md`), "utf8");
    assert.match(text, /derived-from: santifer\/career-ops/, `${last}.md has no derived-from header`);
    assert.ok(MANIFEST[mode].upstream.length > 0);
  }
});

test("each mode ends with a parseable JSON schema (response contract the UI depends on)", () => {
  for (const mode of MODES) {
    const last = PROMPTS[mode].trim().split("\n").pop();
    const schema = last.slice(last.indexOf("{")); // some modes write "Return ONLY valid JSON: {...}" on one line
    assert.ok(last.includes("{"), `${mode}: last line has no schema`);
    assert.doesNotThrow(() => JSON.parse(schema), `${mode}: schema is not valid JSON`);
  }
});

test("evaluate schema keeps every field the frontend reads, plus the upstream additions", () => {
  const schema = JSON.parse(PROMPTS.evaluate.trim().split("\n").pop());
  for (const k of ["archetype", "roleTitle", "company", "jobLocation", "finalScore", "grade", "recommendation", "matchPercent", "dimensions", "blocks", "starStories", "gaps"]) {
    assert.ok(k in schema, `missing legacy field ${k}`);
  }
  assert.deepEqual(Object.keys(schema.dimensions), ["roleImpact", "cvMatch", "compensation", "growthPath", "teamCulture", "missionAlign"]);
  assert.deepEqual(Object.keys(schema.blocks), ["roleSummary", "cvMatch", "levelStrategy", "compResearch", "personalizationHook", "interviewPrep"]);
  assert.equal(Object.keys(schema.scoring).length, 10);
  for (const k of ["keywords", "draftAnswers", "redFlagQuestions", "archetypeSecondary"]) assert.ok(k in schema, `missing ${k}`);
});

test("evaluate keeps the web app's own rules: job-location comp, gap naming, upstream blocks A-G", () => {
  const p = PROMPTS.evaluate;
  assert.ok(p.includes("Evaluate this job offer"));
  assert.match(p, /JD's location/);
  assert.match(p, /never the candidate's location/);
  for (const b of ["STEP 0 ARCHETYPE", "A ROLE SUMMARY", "B CV MATCH", "C LEVEL STRATEGY", "D COMP", "E PERSONALIZATION", "F INTERVIEW PLAN", "G DRAFT ANSWERS", "KEYWORDS"]) {
    assert.ok(p.includes(b), `missing ${b}`);
  }
  assert.match(p, /Reflection/);
});

test("pdf keeps the four hard rules (no dropped roles, nationality, contacts, no invention)", () => {
  const p = PROMPTS.pdf;
  assert.match(p, /NEVER remove, merge or combine jobs/);
  assert.match(p, /preserve nationality/);
  assert.match(p, /contact details intact/);
  assert.match(p, /Do not invent experience/);
  assert.ok(p.includes("CV tailor"));
});

test("scan cannot present invented postings as real (no browser here)", () => {
  const p = PROMPTS.scan;
  assert.match(p, /cannot browse/);
  assert.match(p, /Never invent a deep link/);
  assert.match(p, /"verified":false/);
});

test("contacto enforces the 3-sentence framework, 300 chars and no phone numbers", () => {
  const p = PROMPTS.contacto;
  assert.match(p, /Hook/);
  assert.match(p, /Proof/);
  assert.match(p, /Proposal/);
  assert.match(p, /under 300 characters/);
  assert.match(p, /Never include a phone number/);
});

test("comp-benchmark data lives in prompts/, not in code, and is labelled as static", () => {
  assert.ok(PROMPTS.evaluate.includes("CHF 95k-130k"));
  assert.match(PROMPTS.evaluate, /not live market data/);
  assert.ok(!fs.readFileSync(path.join(ROOT, "api", "evaluate.js"), "utf8").includes("CHF"));
});

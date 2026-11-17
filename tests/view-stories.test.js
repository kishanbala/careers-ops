// Phase 3D (#31): pure helpers of the Story bank (public/js/ui/stories/story.js). Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const imp = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "ui", "stories", "story.js")).href);
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "views", "stories-data.json"), "utf8"));

test("storyParts keeps only non-empty strings, in reading order", async () => {
  const { storyParts } = await imp();
  const p = storyParts(fx.story);
  assert.equal(p.full, "SYNTHETIC full story.");
  assert.deepEqual(p.steps.map((s) => s.label), ["Situation", "Action", "Result"]);
  assert.deepEqual(storyParts({ situation: 42, task: ["x"], action: "  ", result: null }), { full: "", steps: [] });
  assert.deepEqual(storyParts(null), { full: "", steps: [] });
});

test("storyTitle and storyTags tolerate bad model output", async () => {
  const { storyTitle, storyTags } = await imp();
  assert.equal(storyTitle({ question: "  Q?  " }), "Q?");
  assert.equal(storyTitle({}), "Story");
  assert.equal(storyTitle(null), "Story");
  assert.deepEqual(storyTags({ tags: ["a", " a ", 5, null, "", "b"] }), ["a", "b"]);
  assert.equal(storyTags({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) }).length, 8);
  assert.deepEqual(storyTags({ tags: "not a list" }), []);
});

test("parseStoryQuery reads role and q from the hash, and tolerates nothing at all", async () => {
  const { parseStoryQuery } = await imp();
  assert.deepEqual(parseStoryQuery("#/stories?role=1700000000203&q=Tell%20me%20about%20X"), { role: "1700000000203", q: "Tell me about X" });
  assert.deepEqual(parseStoryQuery("#/stories"), { role: "", q: "" });
  assert.deepEqual(parseStoryQuery(undefined), { role: "", q: "" });
  assert.equal(parseStoryQuery(`#/stories?q=${"a".repeat(900)}`).q.length, 500);
});

test("findRole / linkedRoles only resolve roles that exist; roleLabel is plain text", async () => {
  const { findRole, linkedRoles, roleLabel } = await imp();
  assert.equal(findRole(fx.pipeline, "11").company, "Brightquill Labs");
  assert.equal(findRole(fx.pipeline, ""), null);
  assert.equal(findRole(fx.pipeline, "999"), null);
  assert.equal(findRole(null, "11"), null);
  assert.deepEqual(linkedRoles({ roleIds: [11, 999, "12"] }, fx.pipeline).map((r) => r.id), [11, 12]);
  assert.deepEqual(linkedRoles({}, fx.pipeline), []);
  assert.equal(roleLabel({ role: "Analyst", company: "Co" }), "Analyst at Co");
  assert.equal(roleLabel({ role: "Analyst" }), "Analyst");
  assert.equal(roleLabel(null), "");
});

test("buildContent puts the context after a blank line, like v1", async () => {
  const { buildContent } = await imp();
  assert.equal(buildContent(" Q? ", ""), "Q?");
  assert.equal(buildContent("Q?", " ctx "), "Q?\n\nContext: ctx");
});

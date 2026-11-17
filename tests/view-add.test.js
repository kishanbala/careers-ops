// Phase 3D (#31): pure helpers of Add role (public/js/ui/add/batch.js). Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const imp = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "ui", "add", "batch.js")).href);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "views", "add-batch.json"), "utf8"));

test("splitJds: one job per block, separated by a line holding only ---; blanks dropped; --- inside a line is text", async () => {
  const { splitJds } = await imp();
  assert.deepEqual(splitJds(fixture.three), ["SYNTHETIC job A", "SYNTHETIC job B", "SYNTHETIC job C"]);
  assert.deepEqual(splitJds(fixture.messy), ["first", "second", "third"]);
  assert.deepEqual(splitJds(fixture.inline), ["Salary 50---60k stays in one job"]);
  assert.deepEqual(splitJds("   \n---\n  "), []);
  assert.deepEqual(splitJds(undefined), []);
  assert.deepEqual(splitJds("one job only"), ["one job only"]);
});

test("planBatch: at most 5 per run (decision 4); reports what is left out", async () => {
  const { planBatch, MAX_BATCH } = await imp();
  assert.equal(MAX_BATCH, 5);
  const seven = Array.from({ length: 7 }, (_, i) => `job ${i + 1}`).join("\n---\n");
  const p = planBatch(seven);
  assert.equal(p.items.length, 5);
  assert.equal(p.total, 7);
  assert.equal(p.skipped, 2);
  assert.deepEqual(p.items[4], "job 5");
  assert.deepEqual(planBatch("a\n---\nb"), { items: ["a", "b"], total: 2, skipped: 0 });
  assert.deepEqual(planBatch(""), { items: [], total: 0, skipped: 0 });
});

test("snippet: first non-empty line, shortened", async () => {
  const { snippet } = await imp();
  assert.equal(snippet("\n\n  Senior Analyst  \nmore"), "Senior Analyst");
  assert.equal(snippet("x".repeat(200), 20).length, 20);
  assert.match(snippet("x".repeat(200), 20), /…$/);
  assert.equal(snippet(null), "");
});

test("batchSummary and STOP_KINDS", async () => {
  const { batchSummary, STOP_KINDS } = await imp();
  assert.equal(batchSummary([{ status: "done" }, { status: "done" }]), "2 of 2 evaluated.");
  assert.equal(batchSummary([{ status: "done" }, { status: "failed" }, { status: "skipped" }]), "1 of 3 evaluated, 1 failed, 1 not run.");
  assert.equal(batchSummary(null), "0 of 0 evaluated.");
  assert.deepEqual([...STOP_KINDS].sort(), ["empty-profile", "paused", "rate-limited"]);
});

test("hash hand-off: #/add?jd=1 reads the JD once from sessionStorage and removes it (spec §6)", async () => {
  const { takeHandoff, hashQuery, HANDOFF_KEY } = await imp();
  assert.equal(HANDOFF_KEY, "kairo:handoff-jd");
  assert.deepEqual(hashQuery("#/add?jd=1&x=%20y"), { jd: "1", x: " y" });
  assert.deepEqual(hashQuery("#/add"), {});
  const mem = new Map([[HANDOFF_KEY, "SYNTHETIC handed JD"]]);
  const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), removeItem: (k) => mem.delete(k) };
  assert.equal(takeHandoff("#/add", store), "");
  assert.equal(mem.size, 1, "no ?jd=1: nothing read or removed");
  assert.equal(takeHandoff("#/add?jd=1", store), "SYNTHETIC handed JD");
  assert.equal(mem.size, 0);
  assert.equal(takeHandoff("#/add?jd=1", store), "", "second read is empty");
  assert.equal(takeHandoff("#/add?jd=1", null), "");
  assert.equal(takeHandoff("#/add?jd=1", { getItem() { throw new Error("blocked"); }, removeItem() {} }), "");
});

// Phase 3D (#31): pure helpers of the Profile screen (public/js/ui/profile/form.js). Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const imp = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "ui", "profile", "form.js")).href);
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "views", "profile-form.json"), "utf8"));

test("validateMinscore: empty is allowed (default 4.0); 1 to 5 accepted; everything else refused", async () => {
  const { validateMinscore } = await imp();
  for (const [input, value] of fixture.minscoreOk) assert.deepEqual(validateMinscore(input), { ok: true, value }, String(input));
  for (const bad of fixture.minscoreBad) assert.equal(validateMinscore(bad).ok, false, String(bad));
  assert.match(validateMinscore("9").error, /1\.0 to 5\.0/);
});

test("buildPatch trims short fields, keeps the CV exactly as typed, and reports a bad apply line without a patch of it", async () => {
  const { buildPatch } = await imp();
  const r = buildPatch(fixture.form);
  assert.equal(r.ok, true);
  assert.equal(r.patch.name, "Pat Placeholder (SYNTHETIC)");
  assert.equal(r.patch.cv, fixture.form.cv);
  assert.equal(r.patch.minscore, "3.5");
  assert.deepEqual(Object.keys(r.patch).sort(), ["cv", "location", "minscore", "name", "salary", "story", "target", "title"]);
  const bad = buildPatch({ ...fixture.form, minscore: "7" });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.minscore);
  assert.equal("minscore" in bad.patch, false);
  assert.equal(buildPatch(null).ok, true); // never throws on junk
});

test("cvCount: counts characters and flags the 50,000 limit", async () => {
  const { cvCount, MAX_CV_CHARS } = await imp();
  assert.equal(MAX_CV_CHARS, 50000);
  assert.deepEqual(cvCount("abc"), { chars: 3, over: false, label: "3 of 50,000 characters" });
  assert.equal(cvCount("x".repeat(50000)).over, false);
  const over = cvCount("x".repeat(50001));
  assert.equal(over.over, true);
  assert.match(over.label, /Over the 50,000 limit/);
  assert.equal(cvCount(undefined).chars, 0);
});

test("pdfProblem: PDFs pass, other files and oversize PDFs are explained", async () => {
  const { pdfProblem } = await imp();
  assert.equal(pdfProblem({ name: "cv.pdf", type: "application/pdf", size: 1000 }), null);
  assert.equal(pdfProblem({ name: "CV.PDF", type: "", size: 1000 }), null);
  assert.match(pdfProblem({ name: "cv.docx", type: "application/msword", size: 10 }), /not a PDF/);
  assert.match(pdfProblem({ name: "cv.pdf", type: "application/pdf", size: 11 * 1024 * 1024 }), /larger than 10 MB/);
  assert.match(pdfProblem(null), /No file/);
});

test("describeUsage: percent, 80% warning and a per-key breakdown", async () => {
  const { describeUsage, fmtBytes } = await imp();
  assert.equal(fmtBytes(512), "512 B");
  assert.equal(fmtBytes(2048), "2 KB");
  assert.equal(fmtBytes(2 * 1024 * 1024), "2.0 MB");
  const low = describeUsage({ usedBytes: 500_000, quotaBytes: 5_000_000, byKey: { co_pipeline: 400_000, co_stories: 2048, co_profile: 10 } });
  assert.equal(low.pct, 10);
  assert.equal(low.warn, false);
  assert.deepEqual(low.parts, ["Roles 391 KB", "Stories 2 KB", "Profile 10 B"]);
  const edge = describeUsage({ usedBytes: 4_000_000, quotaBytes: 5_000_000 });
  assert.equal(edge.warn, true);
  assert.match(edge.warnText, /80% full/);
  assert.equal(describeUsage({ usedBytes: 4_999_999, quotaBytes: 5_000_000 }).warn, true);
  assert.equal(describeUsage({ usedBytes: 3_999_999, quotaBytes: 5_000_000 }).warn, false);
  assert.equal(describeUsage(null).pct, 0);
  assert.equal(describeUsage({ usedBytes: 9e9, quotaBytes: 5_000_000 }).pct, 100);
});

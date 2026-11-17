// changes/ fragments fold into CHANGELOG.md [Unreleased] and docs/build-ledger.csv (scripts/fold-changes.mjs).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "scripts", "fold-changes.mjs")).href);

test("folds fragments under matching headings, appends ledger rows, deletes fragments", async () => {
  const { fold } = await load();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "fold-"));
  fs.mkdirSync(path.join(root, "changes"));
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "CHANGELOG.md"), "# Changelog\n\n## [Unreleased]\n\n### Added\n- old add\n\n## [1.0.0]\n- shipped\n");
  fs.writeFileSync(path.join(root, "docs", "build-ledger.csv"), "date,phase\n2026-11-16,P1");
  fs.writeFileSync(path.join(root, "changes", "README.md"), "keep me");
  fs.writeFileSync(path.join(root, "changes", "a.md"), "### Added\n- new add\n\n### Fixed\n- a fix\n");
  fs.writeFileSync(path.join(root, "changes", "a.csv"), "2026-11-17,3C\n");

  assert.deepEqual(fold(root), { files: 2, rows: 1 });
  const cl = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
  assert.match(cl, /### Added\n- old add\n- new add\n/);
  assert.match(cl, /### Fixed\n- a fix\n\n## \[1\.0\.0\]/);
  assert.equal(fs.readFileSync(path.join(root, "docs", "build-ledger.csv"), "utf8"), "date,phase\n2026-11-16,P1\n2026-11-17,3C\n");
  assert.deepEqual(fs.readdirSync(path.join(root, "changes")), ["README.md"]);
});

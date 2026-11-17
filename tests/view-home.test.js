// Phase 3A (issue #28): pure helpers behind the Home screen (public/js/ui/home/*, ui/site-footer.js).
// DOM behaviour is covered by e2e/view-home.spec.js. Synthetic data only (rule 15).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const PUB = path.join(__dirname, "..", "public");
const url = (p) => pathToFileURL(path.join(PUB, p)).href;
const readJson = (...p) => JSON.parse(fs.readFileSync(path.join(...p), "utf8"));
const scoring = require("../lib/scoring.js");

class MemStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

test("hero and privacy copy are the locked design §3 wording", async () => {
  const c = await import(url("js/ui/home/content.js"));
  assert.equal(c.HERO.title, "Know which jobs are worth your time.");
  assert.equal(c.PRIVACY_LINE, "Your CV and roles stay in this browser. When you run a tool, the text goes through our server to Anthropic's AI to produce the result. We don't store it.");
  assert.deepEqual(c.DEMO_STEPS.map((s) => s.title), ["Add your CV", "Paste a job", "Get a verdict", "Act on it"]);
  assert.deepEqual(c.CHECKLIST.map((s) => [s.title, s.time]), [["Add your CV", "2 min"], ["Say what you are after", "1 min"], ["Evaluate your first job", "under a minute"]]);
  assert.equal(c.CHECKLIST[1].note, "optional");
});

test("band copy matches ui/score.js band() at every boundary", async () => {
  const c = await import(url("js/ui/home/content.js"));
  const s = await import(url("js/ui/score.js"));
  assert.deepEqual(c.BANDS.map((b) => b.id), ["apply", "look", "skip"]);
  assert.deepEqual(c.BANDS.map((b) => b.label), ["Apply", "Worth a look", "Skip"]);
  assert.equal(s.band(4.0), "apply");
  assert.equal(s.band(3.9), "look");
  assert.equal(s.band(3.0), "look");
  assert.equal(s.band(2.9), "skip");
  assert.match(c.BANDS[0].range, /4\.0/);
  assert.match(c.BANDS[1].range, /3\.0.*3\.9/);
  assert.match(c.BANDS[2].range, /3\.0/);
});

test("letter-grade scale matches lib/scoring.js gradeFor()", async () => {
  const c = await import(url("js/ui/home/content.js"));
  const lows = { A: 4.5, "A-": 4.0, "B+": 3.5, B: 3.0, C: 2.5, D: 0 };
  assert.deepEqual(c.GRADES.map((g) => g.grade), Object.keys(lows));
  for (const [g, low] of Object.entries(lows)) assert.equal(scoring.gradeFor(low), g);
  assert.equal(scoring.gradeFor(4.49), "A-");
});

test("demo timing and step maths", async () => {
  const d = await import(url("js/ui/home/demo.js"));
  assert.equal(d.STEP_MS, 3600);
  assert.equal(d.nextIndex(0), 1);
  assert.equal(d.nextIndex(3), 0);
  assert.equal(d.nextIndex(undefined), 1);
  assert.equal(d.clampIndex(2), 2);
  for (const bad of [-1, 4, 1.5, "1", null, NaN]) assert.equal(d.clampIndex(bad), 0);
});

test("prefersReducedMotion reads the media query and never throws", async () => {
  const d = await import(url("js/ui/home/demo.js"));
  assert.equal(d.prefersReducedMotion({ matchMedia: (q) => ({ matches: /reduce/.test(q) }) }), true);
  assert.equal(d.prefersReducedMotion({ matchMedia: () => ({ matches: false }) }), false);
  assert.equal(d.prefersReducedMotion({ matchMedia: () => { throw new Error("x"); } }), false);
  assert.equal(d.prefersReducedMotion(null), false);
});

test("backup filename is dated in UTC and falls back on a bad date", async () => {
  const b = await import(url("js/ui/home/backup.js"));
  assert.equal(b.backupFilename(new Date("2026-11-20T23:59:00Z")), "kairo-backup-2026-11-20.json");
  assert.match(b.backupFilename(new Date("nope")), /^kairo-backup-\d{4}-\d{2}-\d{2}\.json$/);
  assert.match(b.backupFilename(), /^kairo-backup-\d{4}-\d{2}-\d{2}\.json$/);
});

test("parseBackupText: valid JSON, empty, garbage, and oversize", async () => {
  const b = await import(url("js/ui/home/backup.js"));
  assert.deepEqual(b.parseBackupText('{"a":1}'), { ok: true, obj: { a: 1 } });
  for (const t of ["", "   ", null, undefined, 5]) assert.equal(b.parseBackupText(t).ok, false);
  assert.equal(b.parseBackupText("{not json").ok, false);
  const big = b.parseBackupText("{}", b.MAX_BACKUP_BYTES + 1);
  assert.equal(big.ok, false);
  assert.match(big.error, /too large/);
});

test("describeCounts reads plainly", async () => {
  const b = await import(url("js/ui/home/backup.js"));
  assert.equal(b.describeCounts({ profile: 1, roles: 4, stories: 2 }), "your profile, 4 roles, 2 stories");
  assert.equal(b.describeCounts({ profile: 0, roles: 1, stories: 1 }), "no profile, 1 role, 1 story");
  assert.equal(b.describeCounts(null), "no profile, 0 roles, 0 stories");
});

test("backup fixtures: the valid one passes importAll dryRun, the invalid one is refused, neither writes", async () => {
  const storage = new MemStorage();
  globalThis.localStorage = storage;
  const store = await import(`${url("js/store.js")}?home=1`);
  const valid = readJson(__dirname, "fixtures", "views", "home-backup-valid.json");
  const bad = readJson(__dirname, "fixtures", "views", "home-backup-invalid.json");
  const ok = store.importAll(valid, { dryRun: true, storage });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.counts, { profile: 1, roles: 4, stories: 2 });
  const no = store.importAll(bad, { dryRun: true, storage });
  assert.equal(no.ok, false);
  assert.ok(no.errors.length > 0);
  assert.equal(storage.length, 0);
});

test("export then import round-trips through the store", async () => {
  const storage = new MemStorage();
  globalThis.localStorage = storage;
  const store = await import(`${url("js/store.js")}?home=2`);
  const valid = readJson(__dirname, "fixtures", "views", "home-backup-valid.json");
  assert.equal(store.importAll(valid, { storage }).ok, true);
  const out = store.exportAll(storage);
  assert.equal(out.app, "kairo");
  assert.equal(out.data.co_pipeline.length, 4);
  assert.equal(out.data.co_stories.length, 2);
});

test("site footer: attribution text is fixed, Impressum is off by default", () => {
  const src = fs.readFileSync(path.join(PUB, "js", "ui", "site-footer.js"), "utf8");
  assert.match(src, /Evaluation method adapted from santifer\/career-ops \(MIT\)/);
  assert.match(src, /export const IMPRESSUM_URL = null;/);
  assert.match(src, /safeUrl\(/);
});

test("example evaluation is the synthetic evaluate fixture, unchanged", () => {
  const ex = readJson(PUB, "data", "example-evaluation.json");
  const fx = readJson(__dirname, "fixtures", "api", "evaluate.json").response.data;
  assert.deepEqual(ex, fx);
  assert.match(String(readJson(__dirname, "fixtures", "api", "evaluate.json")._label), /SYNTHETIC/);
});

test("home view: no model call, no raw API access, no inline handlers, no innerHTML", () => {
  const files = ["js/views/home.js", "js/ui/home/content.js", "js/ui/home/demo.js", "js/ui/home/backup.js", "js/ui/site-footer.js"];
  for (const f of files) {
    const src = fs.readFileSync(path.join(PUB, f), "utf8");
    assert.doesNotMatch(src, /callAPI|runTool|\/api\/|innerHTML|insertAdjacentHTML|\bonclick\s*[:=]|setAttribute\(\s*['"]on/, f);
  }
  const home = fs.readFileSync(path.join(PUB, "js", "views", "home.js"), "utf8");
  assert.match(home, /data-action|dataset: \{ action: 'start-cv' \}/);
  assert.match(home, /\/data\/example-evaluation\.json/);
});

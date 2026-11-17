// Phase 3C (issue #30): ui/pipeline/model.js (pure) plus a source check that the delete control goes through pauseControl.
process.env.TZ = "UTC";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

globalThis.document = { createElement: () => { throw new Error("no DOM in this test"); } };
const ROOT = path.join(__dirname, "..", "public", "js");
const load = () => import(pathToFileURL(path.join(ROOT, "ui", "pipeline", "model.js")).href);
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "views", "today-roles.json"), "utf8"));

test("stageLabel and stageOptions: six stages, plus an unknown current stage so the select shows the truth", async () => {
  const { stageLabel, stageOptions, STAGES } = await load();
  assert.deepEqual(STAGES.map((s) => s.label), ["Researching", "Saved", "Applied", "Interviewing", "Offer received", "Rejected"]);
  assert.equal(stageLabel("  APPLIED "), "Applied");
  assert.equal(stageLabel("offer accepted"), "Offer accepted");
  assert.equal(stageLabel("on hold"), "On hold");
  assert.equal(stageLabel(""), "Not set");
  assert.equal(stageLabel(null), "Not set");
  assert.equal(stageOptions("applied").length, 6);
  const o = stageOptions("offer accepted");
  assert.equal(o.length, 7);
  assert.deepEqual(o.at(-1), { key: "offer accepted", label: "Offer accepted" });
});

test("filterRoles: all, open (not rejected/accepted), one stage; junk entries are dropped", async () => {
  const { filterRoles } = await load();
  const roles = [...fx.roles, null, "x", []];
  assert.equal(filterRoles(roles, "all").length, 8);
  assert.equal(filterRoles(roles, "open").length, 7);
  assert.deepEqual(filterRoles(roles, "applied").map((r) => r.id), [2, 4, 8]);
  assert.deepEqual(filterRoles(roles, "offer received"), []);
  assert.deepEqual(filterRoles(null, "all"), []);
});

test("findRole matches numeric ids by string and returns null for unknown or missing ids", async () => {
  const { findRole } = await load();
  assert.equal(findRole([{ id: 1700000000203 }], "1700000000203").id, 1700000000203);
  assert.equal(findRole([{ id: 1 }], "2"), null);
  assert.equal(findRole([{ id: 1 }], null), null);
  assert.equal(findRole(null, "1"), null);
});

test("toLocalInput / fromLocalInput round-trip and reject anything that is not a full local date-time", async () => {
  const { toLocalInput, fromLocalInput } = await load();
  assert.equal(toLocalInput("2026-11-24T10:30:00.000Z"), "2026-11-24T10:30");
  assert.equal(fromLocalInput("2026-11-24T10:30"), "2026-11-24T10:30:00.000Z");
  for (const bad of [null, undefined, "", "2026-11-24", "x", "2026-13-40T99:99", 5]) assert.equal(fromLocalInput(bad), null, String(bad));
  for (const bad of [null, undefined, "", "nope", 5]) assert.equal(toLocalInput(bad), "");
});

test("nextActionPatch trims, caps at 200, and stores null instead of blanks", async () => {
  const { nextActionPatch } = await load();
  assert.deepEqual(nextActionPatch({ text: "  Call Sam ", nextAt: "2026-11-24T10:30", interviewAt: "" }), { nextAction: "Call Sam", nextActionAt: "2026-11-24T10:30:00.000Z", interviewAt: null });
  assert.deepEqual(nextActionPatch({ text: "   ", nextAt: "", interviewAt: "" }), { nextAction: null, nextActionAt: null, interviewAt: null });
  assert.equal(nextActionPatch({ text: "x".repeat(300) }).nextAction.length, 200);
  assert.deepEqual(nextActionPatch({}), { nextAction: null, nextActionAt: null, interviewAt: null });
});

test("historyRows keeps real entries only; bandOf follows the 4.0 / 3.0 bands; nextLine is empty, never invented", async () => {
  const { historyRows, bandOf, nextLine } = await load();
  const rows = historyRows({ stageHistory: [{ status: "researching", at: "2026-11-09T10:00:00.000Z" }, { status: "", at: "x" }, null, { status: "applied", at: "bad" }] });
  assert.deepEqual(rows, [{ label: "Researching", at: "2026-11-09T10:00:00.000Z" }, { label: "Applied", at: null }]);
  assert.deepEqual(historyRows({}), []);
  assert.equal(bandOf({ score: 4 }), "apply");
  assert.equal(bandOf({ score: 3.9 }), "look");
  assert.equal(bandOf({ score: 2.9 }), "skip");
  assert.equal(bandOf({}), "none");
  assert.equal(nextLine({ nextAction: null }), "");
  assert.equal(nextLine({ nextAction: " Call " }), "Call");
});

test("source rules: delete only through pauseControl + pausedBanner('pipeline.delete'); no innerHTML, inline handlers or external links", () => {
  const files = ["views/pipeline.js", "views/today.js", "ui/pipeline/model.js", "ui/today/moves.js"].map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]);
  const pipe = files[0][1];
  assert.match(pipe, /pauseControl\(del, 'pipeline\.delete'\)/);
  assert.match(pipe, /pausedBanner\('pipeline\.delete'\)/);
  assert.ok(!/removeRole|splice\(/.test(pipe), "no delete implementation while paused");
  for (const [f, src] of files) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(src), `${f}: no innerHTML`);
    assert.ok(!/onclick\s*[:=]\s*['"`]/i.test(src), `${f}: no string onclick`);
    assert.ok(!/https?:\/\//.test(src), `${f}: no external URL`);
    assert.ok(!/callAPI|runTool|fetch\(/.test(src), `${f}: Today and Pipeline never call the model`);
  }
});

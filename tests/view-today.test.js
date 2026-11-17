// Phase 3C (issue #30): ui/today/moves.js (pure). Timed moves come only from dates the role has; nulls stay null.
process.env.TZ = "UTC"; // local-day maths below assume UTC
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

globalThis.document = { createElement: () => { throw new Error("no DOM in this test"); } };
const load = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "ui", "today", "moves.js")).href);
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "views", "today-roles.json"), "utf8"));
const NOW = Date.parse(fx.now);
const ids = (arr) => arr.map((m) => m.roleId);

test("buildMoves groups the fixture: overdue, today, upcoming, waiting, ready, undated; closed and bad data make nothing", async () => {
  const { buildMoves, countMoves } = await load();
  const m = buildMoves(fx.roles, NOW);
  assert.deepEqual(ids(m.overdue), [4]);
  assert.deepEqual(ids(m.today), [1]);
  assert.equal(m.today[0].kind, "next");
  assert.equal(m.today[0].text, "Prepare two STAR stories");
  assert.deepEqual(ids(m.upcoming), [1]);
  assert.equal(m.upcoming[0].kind, "interview");
  assert.deepEqual(ids(m.waiting), [2]);
  assert.equal(m.waiting[0].days, 7);
  assert.deepEqual(ids(m.ready), [5]);
  assert.deepEqual(ids(m.undated), [6]);
  assert.equal(countMoves(m), 6);
  const all = Object.values(m).flat();
  assert.ok(!all.some((x) => x.roleId === 3), "rejected role: no move");
  assert.ok(!all.some((x) => x.roleId === 7), "no dates, not in the Apply band: no move");
  assert.ok(!all.some((x) => x.roleId === 8), "unparsable dates and blank text: no move");
});

test("nothing is invented: a next date without text says 'Next step'; no date at all gives no timed move", async () => {
  const { buildMoves } = await load();
  const m = buildMoves([{ id: 1, role: "R", status: "saved", score: 2, nextActionAt: "2026-11-22T10:00:00.000Z" }, { id: 2, role: "S", status: "saved", score: 2 }], NOW);
  assert.equal(m.upcoming[0].text, "Next step");
  assert.deepEqual(ids(Object.values(m).flat()), [1]);
});

test("a waiting role needs 7 full days and no interview recorded", async () => {
  const { buildMoves } = await load();
  const mk = (appliedAt, interviewAt = null) => [{ id: 1, role: "R", status: "applied", score: 3, appliedAt, interviewAt }];
  assert.equal(buildMoves(mk("2026-11-14T09:00:00.000Z"), NOW).waiting.length, 0); // 6 days
  assert.equal(buildMoves(mk("2026-11-13T23:59:00.000Z"), NOW).waiting.length, 1); // 7 days
  assert.equal(buildMoves(mk("2026-11-01T09:00:00.000Z", "2026-11-25T09:00:00.000Z"), NOW).waiting.length, 0);
});

test("bucketOf uses local days: late yesterday is overdue, 23:59 today is today, midnight tomorrow is upcoming", async () => {
  const { bucketOf } = await load();
  assert.equal(bucketOf(Date.parse("2026-11-19T23:59:00Z"), NOW), "overdue");
  assert.equal(bucketOf(Date.parse("2026-11-20T00:00:00Z"), NOW), "today");
  assert.equal(bucketOf(Date.parse("2026-11-20T23:59:00Z"), NOW), "today");
  assert.equal(bucketOf(Date.parse("2026-11-21T00:00:00Z"), NOW), "upcoming");
});

test("ready roles are sorted by score, groups by time; the Apply band is >= 4.0", async () => {
  const { buildMoves } = await load();
  const roles = [
    { id: 1, role: "A", status: "saved", score: 4.0 }, { id: 2, role: "B", status: "researching", score: 4.8 }, { id: 3, role: "C", status: "saved", score: 3.99 },
    { id: 4, role: "D", status: "saved", nextActionAt: "2026-11-23T10:00:00Z" }, { id: 5, role: "E", status: "saved", nextActionAt: "2026-11-22T10:00:00Z" },
  ];
  const m = buildMoves(roles, NOW);
  assert.deepEqual(ids(m.ready), [2, 1]);
  assert.deepEqual(ids(m.upcoming), [5, 4]);
});

test("junk input never throws", async () => {
  const { buildMoves, summary, toMs, fmtWhen } = await load();
  for (const bad of [null, undefined, "x", 5, {}, [null, 3, "x", []]]) {
    assert.doesNotThrow(() => buildMoves(bad, NOW));
    assert.doesNotThrow(() => summary(bad));
  }
  assert.equal(toMs("nope"), null);
  assert.equal(toMs(""), null);
  assert.equal(toMs(NaN), null);
  assert.equal(toMs("2026-11-20T09:00:00Z"), NOW);
  assert.equal(fmtWhen(null), "");
});

test("summary counts open roles, Apply band and interviewing; closed roles are not open", async () => {
  const { summary } = await load();
  assert.deepEqual(summary(fx.roles), { total: 8, open: 7, apply: 2, interviewing: 1 });
});

test("fmtWhen: 'Today, HH:MM' for today, weekday date otherwise (24 h, en-GB)", async () => {
  const { fmtWhen } = await load();
  assert.equal(fmtWhen(Date.parse("2026-11-20T16:00:00Z"), NOW), "Today, 16:00");
  assert.equal(fmtWhen(Date.parse("2026-11-21T13:00:00Z"), NOW), "Sat 21 Nov, 13:00");
});

// Storage schema v2 (build-plan §3a, Phase 2 spec §5): additive, idempotent migration + helpers.
// Fixtures in tests/fixtures/storage/ are synthetic only (rule 15).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const STORE_URL = pathToFileURL(path.join(__dirname, "..", "public", "js", "store.js")).href;
const fixture = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "storage", n), "utf8"));

// localStorage shim: string values, insertion-ordered keys, optional failing writes.
class MemStorage {
  constructor(entries = {}, { failOn = null, quotaBytes = Infinity } = {}) {
    this.m = new Map(Object.entries(entries));
    this.failOn = failOn;
    this.quotaBytes = quotaBytes;
  }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    v = String(v);
    if (this.failOn && this.failOn(k, v)) throw Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
    let size = 0;
    for (const [kk, vv] of this.m) if (kk !== k) size += (kk.length + vv.length) * 2;
    if (size + (k.length + v.length) * 2 > this.quotaBytes) throw Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
    this.m.set(k, v);
  }
  removeItem(k) { this.m.delete(k); }
  dump() { return Object.fromEntries(this.m); }
}
// Fixture values are JSON values; storage holds JSON strings (as LS.set writes them).
const seeded = (fx, opts) => new MemStorage(Object.fromEntries(Object.entries(fx.storage).map(([k, v]) => [k, JSON.stringify(v)])), opts);

let n = 0;
// Fresh module instance per call (query string), with the given global localStorage at import time.
async function loadStore(storage) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, "localStorage");
  const prev = globalThis.localStorage;
  if (storage) globalThis.localStorage = storage; else delete globalThis.localStorage;
  try {
    return await import(`${STORE_URL}?i=${++n}`);
  } finally {
    if (!storage) { if (had) globalThis.localStorage = prev; }
  }
}
const pure = loadStore(null);

const V2_FIELDS = ["appliedAt", "interviewAt", "nextAction", "nextActionAt", "stageHistory", "jdComplete"];

test("store.js imports in Node without localStorage", async () => {
  const s = await pure;
  assert.equal(s.SCHEMA_VERSION, 2);
  assert.deepEqual(s.migrationResult, { status: "noop", backupTaken: false });
  assert.deepEqual(s.pipeline, []);
  assert.deepEqual(s.stories, []);
  for (const k of ["LS", "pipeline", "stories", "profile", "setProfile", "migrate", "migrateData", "makeRole", "normalizeRole", "normalizeStory", "updateRole", "setStage", "linkStory", "onChange", "exportAll", "importAll", "storageUsage"]) {
    assert.ok(k in s, `missing export ${k}`);
  }
});

test("v1 -> v2: adds fields only, snapshots co_backup_v1 first, sets co_schema = 2", async () => {
  const { migrate } = await pure;
  const st = seeded(fixture("v1-basic.json"));
  const before = st.dump();
  const r = migrate(st);
  assert.deepEqual(r, { status: "migrated", backupTaken: true });
  const after = st.dump();
  assert.equal(after.co_schema, "2");
  // untouched keys keep their exact strings
  for (const k of ["co_profile", "co_theme", "unrelated_key"]) assert.equal(after[k], before[k], k);
  // backup holds the raw v1 strings
  const backup = JSON.parse(after.co_backup_v1);
  assert.ok(!Number.isNaN(Date.parse(backup.takenAt)));
  assert.deepEqual(backup.keys, { co_profile: before.co_profile, co_pipeline: before.co_pipeline, co_stories: before.co_stories });
  // every v1 field survives; only v2 fields are added
  const oldRoles = JSON.parse(before.co_pipeline);
  const roles = JSON.parse(after.co_pipeline);
  assert.equal(roles.length, oldRoles.length);
  roles.forEach((r, i) => {
    for (const [k, v] of Object.entries(oldRoles[i])) assert.deepEqual(r[k], v, `role ${i}.${k}`);
    assert.deepEqual(Object.keys(r).filter((k) => !(k in oldRoles[i])).sort(), [...V2_FIELDS].sort());
    assert.equal(r.appliedAt, null);
    assert.equal(r.interviewAt, null);
    assert.equal(r.nextAction, null);
    assert.equal(r.nextActionAt, null);
    assert.deepEqual(r.stageHistory, []); // never invented
  });
  assert.equal(roles[0].jdComplete, true);
  assert.equal(roles[1].jd.length, 500);
  assert.equal(roles[1].jdComplete, false); // cut by v1 at 500 chars: Phase 3B asks for the full JD
  assert.equal(roles[2].customNote, "unknown field kept as is");
  const stories = JSON.parse(after.co_stories);
  assert.deepEqual(stories[0].roleIds, []);
});

test("migration is idempotent: a second run is a no-op and storage is deep-equal", async () => {
  const { migrate } = await pure;
  const st = seeded(fixture("v1-basic.json"));
  migrate(st);
  const once = st.dump();
  assert.deepEqual(migrate(st), { status: "noop", backupTaken: false });
  assert.deepEqual(st.dump(), once);
  assert.deepEqual(migrate(st), { status: "noop", backupTaken: false });
  assert.deepEqual(st.dump(), once);
});

test("v2 -> v2 is a no-op: nothing is written", async () => {
  const { migrate } = await pure;
  const st = seeded(fixture("v2-basic.json"));
  const before = st.dump();
  let writes = 0;
  const set = st.setItem.bind(st);
  st.setItem = (k, v) => { writes++; set(k, v); };
  assert.deepEqual(migrate(st), { status: "noop", backupTaken: false });
  assert.equal(writes, 0);
  assert.deepEqual(st.dump(), before);
});

test("rows added by a v1 build after co_schema = 2 are normalised; the existing backup is kept", async () => {
  const { migrate } = await pure;
  const fx = fixture("v2-plus-v1-rows.json");
  const st = seeded(fx);
  const before = st.dump();
  assert.deepEqual(migrate(st), { status: "normalized", backupTaken: false });
  const after = st.dump();
  assert.equal(after.co_backup_v1, before.co_backup_v1);
  const roles = JSON.parse(after.co_pipeline);
  const old = fx.storage.co_pipeline;
  for (const k of V2_FIELDS) assert.ok(k in roles[0], `new row has ${k}`);
  assert.deepEqual(roles[0].stageHistory, []);
  assert.equal(roles[0].appliedAt, null);
  assert.deepEqual(roles.slice(1), old.slice(1)); // v2 rows unchanged (incl. real dates and history)
  const stories = JSON.parse(after.co_stories);
  assert.deepEqual(stories[0].roleIds, []);
  assert.deepEqual(stories.slice(1), fx.storage.co_stories.slice(1));
  assert.deepEqual(migrate(st), { status: "noop", backupTaken: false });
});

test("quota: backup write fails -> skipped-quota, v1 data untouched, no co_schema", async () => {
  const { migrate } = await pure;
  const st = seeded(fixture("v1-basic.json"), { failOn: (k) => k === "co_backup_v1" });
  const before = st.dump();
  assert.deepEqual(migrate(st), { status: "skipped-quota", backupTaken: false });
  assert.deepEqual(st.dump(), before);
});

test("quota: a data write fails after the backup -> earlier writes restored, backup removed", async () => {
  const { migrate } = await pure;
  const st = seeded(fixture("v1-basic.json"), { failOn: (k) => k === "co_stories" });
  const before = st.dump();
  assert.deepEqual(migrate(st), { status: "skipped-quota", backupTaken: false });
  assert.deepEqual(st.dump(), before);
});

test("quota: storage full -> skipped-quota and data untouched", async () => {
  const { migrate } = await pure;
  const raw = seeded(fixture("v1-basic.json"));
  const used = Object.entries(raw.dump()).reduce((s, [k, v]) => s + (k.length + v.length) * 2, 0);
  const st = seeded(fixture("v1-basic.json"), { quotaBytes: used + 10 });
  const before = st.dump();
  assert.equal(migrate(st).status, "skipped-quota");
  assert.deepEqual(st.dump(), before);
});

test("a store module that meets a full storage still loads the v1 data", async () => {
  const st = seeded(fixture("v1-basic.json"), { failOn: () => true });
  const s = await loadStore(st);
  assert.equal(s.migrationResult.status, "skipped-quota");
  assert.equal(s.pipeline.length, 3);
  assert.equal(s.pipeline[0].appliedAt, undefined); // readers tolerate the v1 shape
});

test("unparsable or foreign values are left untouched", async () => {
  const { migrate, migrateData } = await pure;
  const st = new MemStorage({ co_pipeline: "{not json", co_stories: JSON.stringify([{ id: 1, question: "SYNTHETIC" }]), co_profile: "also not json" });
  assert.equal(migrate(st).status, "migrated");
  const after = st.dump();
  assert.equal(after.co_pipeline, "{not json");
  assert.equal(after.co_profile, "also not json");
  assert.deepEqual(JSON.parse(after.co_stories)[0].roleIds, []);
  const obj = JSON.stringify({ not: "a list" });
  assert.equal(migrateData({ co_pipeline: obj, co_schema: "2" }).snap.co_pipeline, obj);
  const mixed = JSON.stringify([null, 5, "x", { id: 1, jd: "short" }]);
  const out = JSON.parse(migrateData({ co_pipeline: mixed }).snap.co_pipeline);
  assert.deepEqual(out.slice(0, 3), [null, 5, "x"]);
  assert.equal(out[3].jdComplete, true);
});

test("the three skills shapes inside fullData are untouched", async () => {
  const { migrate } = await pure;
  const fx = fixture("v1-skills-shapes.json");
  const st = seeded(fx);
  migrate(st);
  const roles = JSON.parse(st.dump().co_pipeline);
  assert.equal(roles.length, 3);
  roles.forEach((r, i) => assert.deepEqual(r.fullData, fx.storage.co_pipeline[i].fullData));
  assert.equal(typeof roles[0].fullData.skills, "string");
  assert.ok(Array.isArray(roles[1].fullData.skills));
  assert.equal(typeof roles[2].fullData.skills, "object");
});

test("fresh visitor: nothing is written; a newer schema is left alone", async () => {
  const { migrate } = await pure;
  const empty = new MemStorage();
  assert.deepEqual(migrate(empty), { status: "noop", backupTaken: false });
  assert.equal(empty.length, 0);
  const future = new MemStorage({ co_schema: "3", co_pipeline: JSON.stringify([{ id: 1 }]) });
  const before = future.dump();
  assert.equal(migrate(future).status, "noop");
  assert.deepEqual(future.dump(), before);
});

test("migrateData is pure and normalizeRole / normalizeStory are pure and idempotent", async () => {
  const { migrateData, normalizeRole, normalizeStory } = await pure;
  const snap = { co_pipeline: JSON.stringify([{ id: 1, jd: "x" }]), co_stories: null, co_profile: null, co_schema: null };
  const copy = { ...snap };
  const r = migrateData(snap);
  assert.deepEqual(snap, copy);
  assert.equal(r.changed, true);
  assert.equal(migrateData(r.snap).changed, false);
  const role = { id: 1, jd: "x".repeat(600) };
  const nr = normalizeRole(role);
  assert.deepEqual(role, { id: 1, jd: "x".repeat(600) });
  assert.equal(nr.jdComplete, false);
  assert.deepEqual(normalizeRole(nr), nr);
  assert.equal(normalizeRole(nr), nr); // already v2: same object back
  assert.deepEqual(normalizeStory({ id: 2 }), { id: 2, roleIds: [] });
  const s = { id: 3, roleIds: [7] };
  assert.equal(normalizeStory(s), s);
});

test("makeRole keeps the full JD and starts the stage history", async () => {
  const { makeRole } = await pure;
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "api", "evaluate.json"), "utf8")).response.data;
  const jd = "SYNTHETIC full JD. ".repeat(80);
  const r = makeRole(data, jd);
  assert.equal(r.jd, jd);
  assert.ok(r.jd.length > 500);
  assert.equal(r.jdComplete, true);
  assert.equal(r.status, "researching");
  assert.deepEqual(r.stageHistory, [{ status: "researching", at: r.date }]);
  for (const k of ["appliedAt", "interviewAt", "nextAction", "nextActionAt"]) assert.equal(r[k], null);
  assert.deepEqual(Object.keys(r).slice(0, 12), ["id", "role", "company", "score", "grade", "match", "archetype", "location", "status", "date", "fullData", "jd"]);
  assert.equal(r.role, data.roleTitle);
  assert.equal(r.fullData, data);
});

test("addToPipeline in pages/evaluate.js uses makeRole (no 500-char cut)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "public", "js", "pages", "evaluate.js"), "utf8");
  const fn = src.slice(src.indexOf("export function addToPipeline("), src.indexOf("\n}\n", src.indexOf("export function addToPipeline(")));
  assert.match(fn, /makeRole\(data, jd\)/);
  assert.ok(!src.includes("substring(0, 500)"));
});

test("updateRole / setStage / linkStory mutate the shared arrays in place, persist and notify", async () => {
  const st = seeded(fixture("v2-basic.json"));
  const s = await loadStore(st);
  const arr = s.pipeline;
  const id = arr[1].id;
  const heard = [];
  const off = s.onChange("co_pipeline", (v) => heard.push(v));
  const r = s.updateRole(id, { nextAction: "Follow up (SYNTHETIC)", nextActionAt: "2026-11-20T09:00:00.000Z" });
  assert.equal(r, arr[1]);
  assert.equal(s.pipeline, arr);
  assert.equal(JSON.parse(st.getItem("co_pipeline"))[1].nextAction, "Follow up (SYNTHETIC)");
  assert.equal(heard.length, 1);
  assert.equal(heard[0], arr);
  assert.equal(s.updateRole(424242, {}), null);

  const h0 = arr[1].stageHistory.length;
  s.setStage(id, "applied", "2026-11-17T10:00:00.000Z");
  assert.equal(arr[1].status, "applied");
  assert.equal(arr[1].appliedAt, "2026-11-17T10:00:00.000Z");
  s.setStage(id, "interviewing", "2026-11-18T10:00:00.000Z");
  s.setStage(id, "applied", "2026-11-19T10:00:00.000Z");
  assert.equal(arr[1].appliedAt, "2026-11-17T10:00:00.000Z"); // first applied only
  assert.equal(arr[1].interviewAt, null); // never set by setStage
  assert.deepEqual(arr[1].stageHistory.slice(h0).map((x) => x.status), ["applied", "interviewing", "applied"]);
  assert.equal(JSON.parse(st.getItem("co_pipeline"))[1].stageHistory.length, h0 + 3);
  off();
  s.setStage(id, "saved");
  assert.equal(heard.length, 4);

  const storyArr = s.stories;
  const sid = storyArr[1].id;
  s.linkStory(sid, id);
  s.linkStory(sid, id);
  assert.deepEqual(storyArr[1].roleIds, [id]);
  assert.deepEqual(JSON.parse(st.getItem("co_stories"))[1].roleIds, [id]);
  assert.equal(s.linkStory(999, id), null);
});

test("LS.set (used by the legacy pages) notifies listeners", async () => {
  const st = new MemStorage();
  const s = await loadStore(st);
  let got = null;
  s.onChange("co_profile", (v) => { got = v; });
  s.LS.set("co_profile", { name: "SYNTHETIC" });
  assert.deepEqual(got, { name: "SYNTHETIC" });
  assert.equal(st.getItem("co_profile"), '{"name":"SYNTHETIC"}');
});

test("exportAll / importAll round-trip; dryRun and invalid input write nothing", async () => {
  const src = seeded(fixture("v2-basic.json"));
  const a = await loadStore(src);
  const backup = a.exportAll();
  assert.equal(backup.app, "kairo");
  assert.equal(backup.schema, 2);
  assert.ok(!Number.isNaN(Date.parse(backup.exportedAt)));
  assert.deepEqual(Object.keys(backup.data).sort(), ["co_pipeline", "co_profile", "co_stories", "co_theme"]);
  assert.equal(backup.data.co_theme, "light");

  const dst = new MemStorage({ co_pipeline: JSON.stringify([{ id: 1, role: "old" }]) });
  const orig = dst.getItem("co_pipeline");
  const b = await loadStore(dst); // migrates on import: snapshot taken from the original strings
  const arr = b.pipeline;
  const json = JSON.parse(JSON.stringify(backup));

  const before = dst.dump();
  const dry = b.importAll(json, { dryRun: true });
  assert.deepEqual(dry, { ok: true, counts: { profile: 1, roles: 4, stories: 2 }, errors: [] });
  assert.deepEqual(dst.dump(), before);

  for (const bad of [null, [], { app: "other", schema: 2, data: {} }, { app: "kairo", schema: 9, data: {} }, { app: "kairo", schema: 2, data: { co_pipeline: {} } }, { app: "kairo", schema: 2, data: { co_pipeline: [1] } }, { app: "kairo", schema: 2, data: { co_theme: "blue" } }]) {
    const r = b.importAll(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.errors.length > 0);
    assert.deepEqual(dst.dump(), before);
  }

  const ok = b.importAll(json);
  assert.equal(ok.ok, true);
  assert.equal(b.pipeline, arr); // same array, refreshed in place
  assert.deepEqual(b.pipeline, backup.data.co_pipeline);
  assert.deepEqual(JSON.parse(dst.getItem("co_pipeline")), backup.data.co_pipeline);
  assert.deepEqual(JSON.parse(dst.getItem("co_stories")), backup.data.co_stories);
  assert.deepEqual(b.profile, backup.data.co_profile);
  assert.equal(dst.getItem("co_schema"), "2");
  assert.equal(dst.getItem("co_theme"), '"light"');
  assert.equal(JSON.parse(dst.getItem("co_backup_v1")).keys.co_pipeline, orig); // import never overwrites the snapshot
});

test("importAll migrates v1-shaped rows and never partial-writes on quota failure", async () => {
  const dst = new MemStorage({ co_profile: JSON.stringify({ name: "SYNTHETIC" }) }, { failOn: (k) => k === "co_stories" });
  const b = await loadStore(dst);
  const before = dst.dump();
  const obj = { app: "kairo", schema: 1, data: { co_profile: { name: "SYNTHETIC 2" }, co_pipeline: [{ id: 1, role: "R", jd: "short" }], co_stories: [{ id: 2 }] } };
  const r = b.importAll(obj);
  assert.equal(r.ok, false);
  assert.deepEqual(dst.dump(), before);
  dst.failOn = null;
  assert.equal(b.importAll(obj).ok, true);
  const role = JSON.parse(dst.getItem("co_pipeline"))[0];
  assert.deepEqual(role.stageHistory, []);
  assert.equal(role.jdComplete, true);
  assert.deepEqual(JSON.parse(dst.getItem("co_stories"))[0].roleIds, []);
});

test("storageUsage counts UTF-16 bytes per key and warns at 80%", async () => {
  const { storageUsage } = await pure;
  const st = new MemStorage({ ab: "cdef", x: "" });
  const u = storageUsage(st);
  assert.deepEqual(u.byKey, { ab: 12, x: 2 });
  assert.equal(u.usedBytes, 14);
  assert.equal(u.quotaBytes, 5_000_000);
  assert.equal(u.warn, false);
  const big = new MemStorage({ k: "x".repeat(2_000_000 - 1) }); // (1 + 1_999_999) * 2 = 4,000,000 bytes = 80%
  const w = storageUsage(big);
  assert.equal(w.ratio, 0.8);
  assert.equal(w.warn, true);
  assert.equal(storageUsage(new MemStorage({ k: "x".repeat(1_999_000) })).warn, false);
});

// Phase 3 spec §4 (issue #27): addRole, addStory, removeStory, saveProfile. A blank entry is never saved.
// Synthetic data only (rule 15): tests/fixtures/api/ and tests/fixtures/synthetic-profile.json.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const STORE_URL = pathToFileURL(path.join(__dirname, "..", "public", "js", "store.js")).href;
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "api", n), "utf8")).response.data;
const SYN = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "synthetic-profile.json"), "utf8"));

class MemStorage {
  constructor(entries = {}) { this.m = new Map(Object.entries(entries)); this.writes = 0; this.fail = false; }
  get length() { return this.m.size; }
  key(i) { return [...this.m.keys()][i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) {
    if (this.fail) throw Object.assign(new Error("QuotaExceededError"), { name: "QuotaExceededError" });
    this.writes++;
    this.m.set(k, String(v));
  }
  removeItem(k) { this.m.delete(k); }
  dump() { return Object.fromEntries(this.m); }
}

let n = 0;
// Fresh store per test with its own localStorage (query string = new module instance).
async function fresh(entries = {}) {
  const storage = new MemStorage(entries);
  globalThis.localStorage = storage;
  const store = await import(`${STORE_URL}?p3=${++n}`);
  const heard = { co_pipeline: 0, co_stories: 0, co_profile: 0 };
  for (const k of Object.keys(heard)) store.onChange(k, () => heard[k]++);
  storage.writes = 0;
  return { store, storage, heard };
}

const UNUSABLE_EVALS = [null, undefined, {}, [], "x", fx("raw-failure.json"), fx("evaluate-missing-cv.json"), { finalScore: NaN, roleTitle: "x" }, { finalScore: 3.2, roleTitle: " ", grade: "" }, fx("story.json")];
const UNUSABLE_STORIES = [null, undefined, {}, [], fx("raw-failure.json"), { question: "q" }, { question: " ", situation: "s" }, { question: "q", fullStory: "", situation: "" }, fx("evaluate.json")];

test("new exports exist; existing exports are untouched", async () => {
  const { store } = await fresh();
  for (const k of ["addRole", "addStory", "removeStory", "saveProfile", "isUsable"]) assert.equal(typeof store[k], "function", k);
  for (const k of ["LS", "pipeline", "stories", "profile", "setProfile", "makeRole", "updateRole", "setStage", "linkStory", "onChange", "exportAll", "importAll", "storageUsage", "normalizeRole"]) assert.ok(k in store, k);
  assert.equal(store.deleteRole, undefined); // pipeline.delete is paused: no role delete helper (spec §4)
});

test("addRole saves a v2 role with the full JD, at the front, and notifies", async () => {
  const { store, storage, heard } = await fresh({ co_pipeline: JSON.stringify([{ id: 1, role: "old" }]) });
  const legacyView = store.pipeline; // what legacy pages import
  const data = fx("evaluate.json");
  const jd = SYN.jds.long;
  const r = store.addRole(data, jd);
  assert.ok(r);
  assert.equal(store.pipeline, legacyView);
  assert.equal(legacyView[0], r);
  assert.equal(legacyView.length, 2);
  assert.equal(r.role, data.roleTitle);
  assert.equal(r.score, data.finalScore);
  assert.equal(r.jd, jd);
  assert.ok(jd.length > 500);
  assert.equal(r.jdComplete, true);
  assert.deepEqual(r.stageHistory, [{ status: "researching", at: r.date }]);
  assert.deepEqual(r.fullData, data);
  const saved = JSON.parse(storage.getItem("co_pipeline"));
  assert.equal(saved.length, 2);
  assert.equal(saved[0].id, r.id);
  assert.equal(saved[0].jd, jd);
  assert.equal(heard.co_pipeline, 1);
});

test("addRole never saves a blank entry: null, no write, no notify", async () => {
  const { store, storage, heard } = await fresh({ co_pipeline: JSON.stringify([{ id: 1, role: "old" }]) });
  const before = storage.getItem("co_pipeline"); // as migrated on import
  for (const d of UNUSABLE_EVALS) assert.equal(store.addRole(d, "SYNTHETIC JD"), null, JSON.stringify(d)?.slice(0, 60));
  assert.equal(storage.writes, 0);
  assert.equal(storage.getItem("co_pipeline"), before);
  assert.equal(store.pipeline.length, 1);
  assert.equal(heard.co_pipeline, 0);
});

test("addStory saves at the front with an id and roleIds; links a role when given", async () => {
  const { store, storage, heard } = await fresh({ co_stories: JSON.stringify([{ id: 5, question: "old", roleIds: [] }]) });
  const legacyView = store.stories;
  const s1 = store.addStory(fx("story.json"));
  assert.ok(s1);
  assert.deepEqual(s1.roleIds, []);
  assert.equal(s1.question, fx("story.json").question);
  const s2 = store.addStory(fx("story.json"), { roleId: 1700000000203 });
  assert.deepEqual(s2.roleIds, [1700000000203]);
  assert.notEqual(s1.id, s2.id);
  assert.equal(legacyView, store.stories);
  assert.deepEqual(legacyView.map((s) => s.id), [s2.id, s1.id, 5]);
  assert.deepEqual(JSON.parse(storage.getItem("co_stories")).map((s) => s.id), [s2.id, s1.id, 5]);
  assert.equal(heard.co_stories, 2);
});

test("addStory never saves a blank entry", async () => {
  const { store, storage, heard } = await fresh({ co_stories: JSON.stringify([{ id: 5, question: "old", roleIds: [] }]) });
  const before = storage.getItem("co_stories");
  for (const s of UNUSABLE_STORIES) assert.equal(store.addStory(s, { roleId: 1 }), null, JSON.stringify(s)?.slice(0, 60));
  assert.equal(storage.writes, 0);
  assert.equal(storage.getItem("co_stories"), before);
  assert.equal(store.stories.length, 1);
  assert.equal(heard.co_stories, 0);
});

test("ids stay unique when two entries are added in the same millisecond", async () => {
  const { store } = await fresh();
  const realNow = Date.now;
  try {
    Date.now = () => 1800000000000;
    const a = store.addRole(fx("evaluate.json"), "jd a");
    const b = store.addRole(fx("evaluate.json"), "jd b");
    const c = store.addStory(fx("story.json"));
    const d = store.addStory(fx("story.json"));
    assert.notEqual(a.id, b.id);
    assert.notEqual(c.id, d.id);
  } finally {
    Date.now = realNow;
  }
});

test("removeStory deletes by id (string or number) and notifies; unknown id is false", async () => {
  const { store, storage, heard } = await fresh({ co_stories: JSON.stringify([{ id: 5, question: "a" }, { id: 6, question: "b" }]) });
  assert.equal(store.removeStory("5"), true);
  assert.deepEqual(store.stories.map((s) => s.id), [6]);
  assert.deepEqual(JSON.parse(storage.getItem("co_stories")).map((s) => s.id), [6]);
  assert.equal(heard.co_stories, 1);
  assert.equal(store.removeStory(999), false);
  assert.equal(heard.co_stories, 1);
});

test("saveProfile merges, persists, updates the profile binding and notifies", async () => {
  const { store, storage, heard } = await fresh({ co_profile: JSON.stringify({ name: "Mira (SYNTHETIC)", cv: "CV" }) });
  let seen = null;
  store.onChange("co_profile", () => { seen = store.profile; });
  const p = store.saveProfile({ target: "Analytics Engineer", minscore: "4.0" });
  assert.deepEqual(p, { name: "Mira (SYNTHETIC)", cv: "CV", target: "Analytics Engineer", minscore: "4.0" });
  assert.equal(store.profile, p);
  assert.equal(seen, p); // listeners already see the new binding
  assert.deepEqual(JSON.parse(storage.getItem("co_profile")), p);
  assert.equal(heard.co_profile, 1);
  assert.deepEqual(store.saveProfile(null), p);
});

test("a storage failure keeps memory and storage unchanged and is reported (throws)", async () => {
  const { store, storage, heard } = await fresh({ co_pipeline: "[]", co_stories: JSON.stringify([{ id: 5, question: "a" }]), co_profile: JSON.stringify({ name: "A" }) });
  const snap = storage.dump();
  storage.fail = true;
  assert.throws(() => store.addRole(fx("evaluate.json"), "jd"), /Quota/);
  assert.throws(() => store.addStory(fx("story.json")), /Quota/);
  assert.throws(() => store.removeStory(5), /Quota/);
  assert.throws(() => store.saveProfile({ name: "B" }), /Quota/);
  assert.equal(store.pipeline.length, 0);
  assert.deepEqual(store.stories.map((s) => s.id), [5]);
  assert.deepEqual(store.profile, { name: "A" });
  assert.deepEqual(storage.dump(), snap);
  assert.deepEqual(heard, { co_pipeline: 0, co_stories: 0, co_profile: 0 });
});

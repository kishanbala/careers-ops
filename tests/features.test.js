// Per-action feature flags (design §0, Phase 2 spec §6).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "features.js")).href);

test("FLAGS is frozen, keyed <area>.<action>, values on|paused", async () => {
  const { FLAGS } = await load();
  assert.ok(Object.isFrozen(FLAGS));
  for (const [k, v] of Object.entries(FLAGS)) {
    assert.match(k, /^[a-z]+\.[a-zA-Z]+$/, k);
    assert.ok(v === "on" || v === "paused", `${k}=${v}`);
  }
  assert.throws(() => { "use strict"; FLAGS["scan.run"] = "on"; });
});

test("flags fixed by the Architect spec", async () => {
  const { FLAGS } = await load();
  assert.deepEqual(
    { ...FLAGS },
    {
      "stories.view": "on",
      "stories.generate": "on",
      "scan.run": "paused",
      "scan.portals": "paused",
      "cv.archetype": "paused",
      "cv.fullPreview": "paused",
      "pipeline.delete": "paused",
    },
  );
});

test("flag() throws on unknown keys; isOn and pausedAttrs follow the flag", async () => {
  const { flag, isOn, pausedAttrs, PAUSED_BANNER } = await load();
  assert.throws(() => flag("nope.nope"), /Unknown feature flag/);
  assert.throws(() => flag("toString"), /Unknown feature flag/);
  assert.throws(() => isOn("__proto__"), /Unknown feature flag/);
  assert.equal(flag("scan.run"), "paused");
  assert.equal(isOn("stories.generate"), true);
  assert.equal(isOn("scan.run"), false);
  assert.deepEqual(pausedAttrs("stories.view"), {});
  assert.deepEqual(pausedAttrs("cv.fullPreview"), { "aria-disabled": "true", class: "is-paused" });
  assert.notEqual(pausedAttrs("scan.run"), pausedAttrs("scan.run")); // fresh object, safe to mutate
  assert.equal(PAUSED_BANNER, "Being rebuilt. Back soon.");
});

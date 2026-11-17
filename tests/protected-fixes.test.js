// Regression tests for the protected fixes (build-plan §0). Do not weaken.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Phase 1 (#20): the app is split into a markup shell + ES modules; read the shell plus every public/js/**/*.js, concatenated.
const appSource = () => {
  const dir = path.join(__dirname, "..", "public", "js");
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".js")).sort();
  return [fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8"), ...files.map((f) => fs.readFileSync(path.join(dir, f), "utf8"))].join("\n");
};
const read = (p) => (p === "public/index.html" ? appSource() : fs.readFileSync(path.join(__dirname, "..", p), "utf8"));

// Top-level functions end at the first line that is exactly "}" (braces inside strings break counting).
function fnSource(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const end = src.indexOf("\n}\n", start);
  return src.slice(start, end + 2);
}
const load = (src, name) => vm.runInNewContext(`${fnSource(src, name)};${name}`, {});

// Phase 4A (#39): flattenSkills moved unchanged from pages/cv.js to render/skills.js (the role CV tab imports it from there).
const _flat = load(read("public/js/render/skills.js"), "flattenSkills");
const flattenSkills = (x) => [..._flat(x)]; // copy: vm arrays have a foreign prototype
const extractJson = load(read("api/evaluate.js"), "extractJson");

test("flattenSkills handles string, string[], object and nested shapes", () => {
  assert.deepEqual(flattenSkills("SQL, Python ,"), ["SQL", "Python"]);
  assert.deepEqual(flattenSkills(["SQL", "Python"]), ["SQL", "Python"]);
  assert.deepEqual(flattenSkills({ proficient: ["SQL"], intermediate: "Go, Rust" }), ["SQL", "Go", "Rust"]);
  assert.deepEqual(flattenSkills(null), []);
  assert.ok(flattenSkills({ a: { b: "x" } }).every((s) => typeof s === "string"));
});

test("flattenSkills works on the recorded pdf fixture (object shape)", () => {
  const fx = JSON.parse(read("tests/fixtures/api/pdf-skills-object.json"));
  const out = flattenSkills(fx.response.data.skills);
  assert.ok(out.length > 0 && out.every((s) => typeof s === "string" && !s.includes("[object")));
});

test("extractJson drops prose after the JSON and respects braces in strings", () => {
  const obj = { a: "x } y", b: { c: 1 } };
  const text = "Here:\n" + JSON.stringify(obj) + "\n\nNote: I scored this generously.";
  assert.deepEqual(JSON.parse(extractJson(text)), obj);
  assert.equal(extractJson("no json"), "no json");
});

test("prompt-injection guardrail stays in prompts/_shared.md", () => {
  const s = read("prompts/_shared.md");
  assert.match(s, /UNTRUSTED INPUT/);
  assert.match(s, /not instructions/);
});

test("prompts/pdf.md keeps its hard rules", () => {
  const s = read("prompts/pdf.md").toLowerCase();
  for (const k of ["never", "nationality", "contact", "invent"]) assert.ok(s.includes(k), `missing: ${k}`);
});

test("evaluate config stays pinned (thinking between_tools, max_tokens 6000)", () => {
  const s = read("api/evaluate.js");
  assert.match(s, /max_tokens:\s*6000/);
  assert.match(s, /thinking:\s*\{\s*type:\s*"between_tools"\s*\}/);
});

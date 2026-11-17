// Phase 3B (#29): pure helpers of the role workspace (public/js/ui/role/model.js). Synthetic data only.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const load = () => import(pathToFileURL(path.join(__dirname, "..", "public", "js", "ui", "role", "model.js")).href);
const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "api", n), "utf8")).response.data;
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "views", "seed-v2.json"), "utf8")).storage;
const roleFx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "views", "role-edge-cases.json"), "utf8"));
// Same behaviour as the protected flattenSkills (pages/cv.js cannot load in Node: it wires DOM on import).
const flat = (sk) => (!sk ? [] : typeof sk === "string" ? sk.split(",").map((x) => x.trim()).filter(Boolean) : Array.isArray(sk) ? sk.flatMap(flat) : typeof sk === "object" ? Object.values(sk).flatMap(flat) : [String(sk)]);
const PAYLOAD = '<img src=x onerror=alert(1)>';

test("TABS match the router's role tabs, in design order", async () => {
  const { TABS } = await load();
  const { ROLE_TABS } = await import(pathToFileURL(path.join(__dirname, "..", "public", "js", "router.js")).href);
  assert.deepEqual(TABS.map((t) => t.id), [...ROLE_TABS]);
  assert.deepEqual(TABS.map((t) => t.label), ["Fit", "Tailored CV", "Research", "Outreach", "Interview", "Negotiate"]);
});

test("findRole / roleEval / roleHeading: string or number ids, missing fullData", async () => {
  const m = await load();
  const r = m.findRole(seed.co_pipeline, String(seed.co_pipeline[0].id));
  assert.equal(r.id, seed.co_pipeline[0].id);
  assert.equal(m.findRole(seed.co_pipeline, "999"), null);
  assert.equal(m.findRole(null, 1), null);
  assert.deepEqual(m.roleEval({ fullData: undefined }), {});
  assert.equal(m.hasFullEval(r), true);
  assert.equal(m.hasFullEval(roleFx.noFullData), false);
  const hd = m.roleHeading(roleFx.noFullData);
  assert.equal(hd.title, roleFx.noFullData.role);
  assert.equal(hd.score, roleFx.noFullData.score);
  assert.equal(m.roleHeading({}).title, "Role");
});

test("evalBlocks keeps A-F order and drops empty blocks; lists drop malformed items", async () => {
  const m = await load();
  const d = { blocks: { interviewPrep: "F text", roleSummary: "A text", cvMatch: "  ", levelStrategy: 3 }, starStories: [null, { question: "Q1", starter: "S" }, { starter: "no q" }], redFlagQuestions: [{ question: "R1" }, "x"], keywords: ["a", "a", "", 7, null], draftAnswers: [{ question: "q" }, { question: "q2", answer: "a2" }] };
  assert.deepEqual(m.evalBlocks(d).map((b) => b.letter + b.key), ["AroleSummary", "ClevelStrategy", "FinterviewPrep"]);
  assert.deepEqual(m.starStarters(d), [{ question: "Q1", starter: "S", reflection: "" }]);
  assert.deepEqual(m.redFlags(d), [{ question: "R1", answer: "" }]);
  assert.deepEqual(m.keywords(d), ["a", "7"]);
  assert.deepEqual(m.draftAnswers(d), [{ question: "q2", answer: "a2" }]);
  assert.deepEqual(m.evalBlocks(null), []);
});

test("model text comes back as plain strings (rendering escapes it as text nodes)", async () => {
  const m = await load();
  const b = m.evalBlocks({ blocks: { roleSummary: PAYLOAD } });
  assert.equal(b[0].text, PAYLOAD);
  assert.equal(typeof b[0].text, "string");
});

test("linkedStories and storyParts", async () => {
  const m = await load();
  const id = seed.co_pipeline[0].id;
  assert.deepEqual(m.linkedStories(seed.co_stories, id).map((s) => s.id), [1700000000301]);
  assert.deepEqual(m.linkedStories(seed.co_stories, String(id)).map((s) => s.id), [1700000000301]);
  assert.deepEqual(m.linkedStories([{ id: 1 }, null, { id: 2, roleIds: "x" }], id), []);
  assert.deepEqual(m.storyParts({ situation: "S", result: "R" }).map((p) => p.label), ["Situation", "Result"]);
  assert.deepEqual(m.storyParts({ fullStory: "F" }), [{ key: "fullStory", label: "Story", text: "F" }]);
});

test("storyHref: the 3B -> 3D hand-off #/stories?role=<id>&q=<question>", async () => {
  const { storyHref } = await load();
  const h = storyHref(1700000000203, "Tell me about A/B tests & pricing?");
  assert.ok(h.startsWith("#/stories?"));
  const q = new URLSearchParams(h.split("?")[1]);
  assert.equal(q.get("role"), "1700000000203");
  assert.equal(q.get("q"), "Tell me about A/B tests & pricing?");
  assert.ok(!h.includes(" ") && !h.includes("+"));
  assert.equal(storyHref(5, ""), "#/stories?role=5");
});

test("noteCount: 200 free / 300 premium limits (OUT-02, BUG-13)", async () => {
  const { noteCount } = await load();
  assert.deepEqual([200, 201, 300, 301].map((n) => noteCount("x".repeat(n)).fit), ["free", "premium", "premium", "over"]);
  assert.equal(noteCount("x".repeat(235)).label, "235 / 300");
  assert.equal(noteCount("abc").label, "3 / 200");
  assert.equal(noteCount("😀😀").count, 2);
  assert.equal(noteCount(fx("contacto.json").connectionNote).fit, "premium");
  assert.equal(noteCount(null).count, 0);
});

test("tool inputs keep the v1 text shapes", async () => {
  const m = await load();
  assert.equal(m.researchContent("  Brightquill Labs  "), "Research: Brightquill Labs");
  assert.equal(m.researchContent(" "), "");
  assert.equal(m.outreachContent("JD", "  "), "JD");
  assert.equal(m.outreachContent("JD", "Hiring manager"), "JD\n\nReaching out to: Hiring manager");
  assert.equal(m.outreachContent("", "x"), "");
  assert.equal(m.negotiateContent({ scenario: "Equity vs cash tradeoff", offer: "70k", target: "85k", competing: "", context: "ctx" }),
    "Scenario: Equity vs cash tradeoff\nTheir offer: 70k\nTarget: 85k\nCompeting offer: \nContext: ctx");
  assert.equal(m.SCENARIOS.length, 5);
  const d = m.negotiateDefaults(seed.co_pipeline[0], seed.co_profile);
  assert.equal(d.target, seed.co_profile.salary);
  assert.equal(d.context, "Role: Senior Analytics Engineer at Brightquill Labs GmbH (fictional), Berlin, Germany.");
  assert.equal(m.negotiateDefaults({}, null).target, "");
});

test("research, negotiate and outreach views drop empty fields", async () => {
  const m = await load();
  const r = m.researchView(fx("research.json"));
  assert.equal(r.company, "Brightquill Labs GmbH");
  assert.deepEqual(r.facts.map((f) => f.key), ["stage", "funding", "headcount"]);
  assert.ok(r.blocks.some((b) => b.key === "overview"));
  assert.ok(r.verdict.length > 0);
  assert.deepEqual(m.researchView({ overview: "o", culture: "" }).blocks.map((b) => b.key), ["overview"]);
  const n = m.negotiateView(fx("negotiate.json"));
  assert.deepEqual(n.sections.map((s) => s.key).slice(0, 4), ["opening", "anchor", "fallback", "close"]);
  assert.ok(n.emailBody && n.tips.length);
  const o = m.outreachView({ connectionNote: " hi ", tips: ["", "t"] });
  assert.deepEqual(o, { note: "hi", subject: "", body: "", tips: ["t"] });
});

test("CV: contact, education and languages only when returned; https-only LinkedIn link", async () => {
  const m = await load();
  const d = fx("pdf.json");
  assert.deepEqual(m.cvContact(d).map((c) => c.key), ["email", "location"]); // phone, linkedin, nationality are ""
  assert.deepEqual(m.cvEducation(d), [{ degree: "MSc Applied Statistics", institution: "Fictional University of Utrecht", period: "2016", location: "Utrecht" }]);
  assert.deepEqual(m.cvLanguages(d), ["English (C2)", "Dutch (B2)", "German (B1)"]);
  assert.equal(m.cvExperience(d).length, 3);
  assert.deepEqual(m.cvContact({ linkedin: "https://www.linkedin.com/in/example" })[0].href, "https://www.linkedin.com/in/example");
  for (const bad of ["javascript:alert(1)", "http://example.com", "linkedin.com/in/x"]) {
    const c = m.cvContact({ linkedin: bad })[0];
    assert.equal(c.href, undefined, bad);
    assert.equal(c.text, bad);
  }
  assert.deepEqual(m.cvContact({}), []);
  assert.deepEqual(m.cvContact({ contact: "a · b" }), [{ key: "contact", text: "a · b" }]);
  assert.deepEqual(m.cvEducation({ education: ["BSc X", null, {}] }).map((e) => e.degree), ["BSc X"]);
  assert.deepEqual(m.cvLanguages({ languages: ["Spanish", { language: "French" }, 4] }), ["Spanish", "French"]);
});

test("CV skills: every skills shape (CV-07) through the injected flattenSkills; copy sections", async () => {
  const m = await load();
  for (const skills of ["SQL, dbt", ["SQL", "dbt"], { proficient: ["SQL"], intermediate: ["dbt"] }]) {
    assert.deepEqual(m.cvSkills({ skills }, flat), ["SQL", "dbt"]);
  }
  assert.deepEqual(m.cvSkills({ skills: "SQL" }, null), []);
  const s = m.cvCopySections(fx("pdf-skills-object.json"), flat);
  assert.equal(s[0].label, "Profile summary");
  assert.ok(s.some((x) => x.label === "Lead Data Analyst at Quokka Logistics BV (fictional)"));
  assert.ok(s.find((x) => x.label === "Skills").text.includes("SQL, dbt"));
  assert.ok(s.some((x) => x.label === "Education") && s.some((x) => x.label === "Languages"));
  assert.ok(!s.some((x) => /\[object Object\]/.test(x.text)));
});

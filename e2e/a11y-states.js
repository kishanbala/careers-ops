// Phase 4B (#40): the state matrix the a11y audit walks. Synthetic data only (rule 15), API always mocked (rule 5).
const { expect } = require("./helpers");
const { SEED, seedState, mockApi, fixClock } = require("./phase3-helpers");

const ROLE = SEED.storage.co_pipeline[0];
const CUT = SEED.storage.co_pipeline.find((r) => r.jdComplete === false);
const PROFILE_ONLY = { name: "Mira Synthetic", target: "Senior analytics role" };
const ALL = { profile: true, pipeline: true, stories: true };
const roleTab = (tab) => ({ route: `#/role/${ROLE.id}${tab === "fit" ? "" : "/" + tab}`, seed: ALL, ready: ".role-view" });

// name, route, seed, ready selector, optional api mock and prepare(page) for the open state (dialogs, errors).
const STATES = [
  { name: "home-empty", route: "#/home", seed: {}, ready: "#view-home h1" },
  { name: "home-example", route: "#/home", seed: ALL, ready: "#view-home h1", prepare: async (p) => { await p.locator('#view-home [data-action="see-example"]').click(); await expect(p.locator("#home-example")).toBeVisible(); } },
  { name: "today-moves", route: "#/today", seed: { profile: true, pipeline: true }, ready: "#view-today .t-group" },
  { name: "today-first-job", route: "#/today", seed: { profile: PROFILE_ONLY }, ready: '#view-today [data-action="first-job"]' },
  { name: "pipeline-list", route: "#/pipeline", seed: { profile: true, pipeline: true }, ready: "#view-pipeline .p-item" },
  { name: "pipeline-detail", route: `#/pipeline/${ROLE.id}`, seed: { profile: true, pipeline: true }, ready: "#view-pipeline .p-detail" },
  { name: "pipeline-empty", route: "#/pipeline", seed: { profile: true }, ready: "#view-pipeline h1" },
  ...["fit", "cv", "research", "outreach", "interview", "negotiate"].map((t) => ({ name: `role-${t}`, ...roleTab(t) })),
  { name: "role-cut-jd", route: `#/role/${CUT.id}`, seed: ALL, ready: ".role-view" },
  { name: "role-tool-error", route: `#/role/${ROLE.id}/research`, seed: ALL, ready: ".role-view", api: { research: { status: 500 } }, prepare: async (p) => { await p.click('#view-role [data-action="run-research"]'); await expect(p.locator("#view-role .k-tool-error")).toBeVisible(); } },
  { name: "add-one", route: "#/add", seed: { profile: true, pipeline: true }, ready: "#view-add h1" },
  { name: "add-several", route: "#/add/several", seed: { profile: true, pipeline: true }, ready: "#view-add h1" },
  { name: "add-scan", route: "#/add/scan", seed: { profile: true, pipeline: true }, ready: "#view-add h1" },
  { name: "profile", route: "#/profile", seed: ALL, ready: "#view-profile h1" },
  { name: "profile-empty", route: "#/profile", seed: {}, ready: "#view-profile h1" },
  { name: "stories-list", route: "#/stories", seed: ALL, ready: "#view-stories .st-card" },
  { name: "stories-empty", route: "#/stories", seed: { profile: true }, ready: "#view-stories h1" },
  { name: "stories-modal", route: "#/stories", seed: ALL, ready: "#view-stories .st-card", prepare: async (p) => { await p.locator("#view-stories .st-card").first().click(); await expect(p.getByRole("dialog")).toBeVisible(); } },
];
const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
const THEMES = ["light", "dark"];

async function openState(page, st, { w, h, theme }) {
  await page.setViewportSize({ width: w, height: h });
  await fixClock(page);
  await seedState(page, { ...st.seed, theme });
  await mockApi(page, st.api || {});
  await page.goto("/" + st.route);
  await expect(page.locator(st.ready).first()).toBeVisible();
  if (st.prepare) await st.prepare(page);
}

module.exports = { STATES, VIEWPORTS, THEMES, openState, ROLE };

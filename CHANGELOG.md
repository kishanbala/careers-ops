# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project doesn't yet follow strict [SemVer](https://semver.org/) version-for-version, but version bumps are meaningful (breaking/major surface change → minor+, fix/hardening → patch-ish).

## [Unreleased]

## [2.0.0] - YYYY-MM-DD

Kairo v2 is the revamp of the v1 career copilot, built from the commits on `main` after v1.3.0 (`01e720b`). It adds an app shell with a hash router, Gunmetal and Brass light and dark themes, the Home, Today, Pipeline, Role workspace, Profile, Add role and Story bank screens, and storage schema v2. The schema v2 migration is additive: it only adds fields and keeps a one-time `co_backup_v1` copy of the v1 data before its first write. The v1 build still reads v2 data (`e2e/rollback.spec.js`). Security: model-derived text is escaped in the UI, Find Jobs links accept https: only, and `api/evaluate.js` has an origin check and a per-IP rate limit. Fonts and PDF.js are self-hosted, so the page makes no third-party requests on load (`e2e/network-log.spec.js`), and the privacy notice is at `/privacy.html`. Accessibility fixes come from the Phase 4B audit (`docs/a11y-audit.md`). Paused in v2 (shown as "Being rebuilt. Back soon."): Find Jobs scanning, the CV archetype choice, CV Full preview and deleting a role from Pipeline. Career Strategy is hidden until it is built. Lighthouse figures are in `docs/perf-report.md`.

### Changed
- Bronze medal chip (B+) meets AA: darkest gradient stop lightened from `#8A5229` to `#A96432` (black text 4.56:1; light and mid stops unchanged). Fixes BUG-16; per Bala's decision A on #22.
- Phase 2A (#22): Gunmetal + Brass design tokens in Light and Dark (`public/css/tokens.css`, design-decisions §4 hex values), keyed on `[data-theme]` and following `prefers-color-scheme` without JS. Legacy token names stay as aliases, so every existing screen is re-skinned, not rebuilt. Fonts are now Familjen Grotesk, Figtree and IBM Plex Mono, self-hosted woff2 (Inter and DM Mono removed). `e2e/split.spec.js` and `ci.yml` take PR labels (`visual:all`, `visual:<screen>`) to allow intentional pixel changes.
- App shell (Phase 2B, #23): header with logo and theme-toggle slot, left nav (≥768 px; menu drawer on phones), phone bottom nav (Today · Pipeline · + · Stories · Profile) shown only once a role exists. The v1 top nav, sidebar and tab bar are replaced; every v1 page is still reachable under a collapsed "Tools" group (`.nav-item[data-page]`), Career Strategy hidden until built. Legacy page sections are unchanged.
- Evaluate & Track stores the full job description (was cut at 500 characters) and a v2 role (`makeRole`).
- `public/index.html` split into a markup shell, `public/css/{tokens,base,components,pages}.css` and native ES modules under `public/js/` (`main`, `store`, `router`, `api`, `pdf`, `render/*`, `pages/*`), loaded with `<script type="module">`. No visual or behavioural change: at most 30 differing pixels per screenshot (CI renderer noise; 0 px locally) against pre-split baselines (`e2e/split.spec.js`; in CI the baselines are rendered from the PR base in the same runner by `e2e/capture-baseline.mjs`, locally `e2e/baseline/`). Inline `onclick` handlers and `window.*` helpers replaced with `addEventListener`.
- CI (#44): the `e2e` job no longer runs on draft PRs (`test` still does), and runs when a PR is marked Ready for review (`ready_for_review` trigger added). Runs are grouped per PR and a newer push or label change cancels the superseded run; runs on `main` are never cancelled. Builder workflow documented in CLAUDE.md: open as draft, add all `visual:*` labels, then mark Ready.
- PR process: CHANGELOG entries and ledger rows now go in per-PR files under `changes/` (`<branch-slug>.md` / `.csv`); the Release agent folds them with `scripts/fold-changes.mjs`. Stops parallel PRs from conflicting on `CHANGELOG.md` and `docs/build-ledger.csv`. Test: `tests/fold-changes.test.js`.
- README and `docs/ARCHITECTURE.md` describe the v2 layout: shell, hash router, store schema v2, `runTool`, UI kit, feature flags, theme, CSS hooks and test layout. Attribution text and licences are unchanged.
- Phase 4A (#39): the legacy v1 screens are retired. Every route now renders a view: the `#page-*` sections, `public/js/pages/*`, `render/{dims,gauge,eval-blocks}.js`, the "Tools" nav group, the `#/legacy/:page` route (old links now fall back to Home or Today), the legacy story and pipeline modals, the legacy PDF upload handler, `callAPI` (runTool is the only caller of `/api/evaluate`) and the CSS only those used are removed. `flattenSkills` moved unchanged to `public/js/render/skills.js` (protected-fix test repointed, assertions unchanged). The site footer (attribution, Privacy link, hidden Impressum slot) is mounted once by the shell below every screen and replaces the old global "Privacy notice" link. Nav badges are written by the shell at start-up, as before (live updates stay BUG-50). Tests that relied on the legacy pages now check the same behaviour on the new views (see the PR Risk line).
- Font preloads and an empty favicon link in `index.html` head.
- PDF.js is now loaded on first PDF import instead of on every page load.

### Fixed
- Privacy link is visible at every screen width; privacy notice wording corrected.
- BUG-40: active bottom-nav label contrast raised from 4.3:1 to 5.9:1.
- BUG-60: Home "How it works" showed the text "null" under reduced motion.
- Heading order in the fit card, missing h1 on phone pipeline detail, missing focus rings on inputs and selects.

### Added
- Theme switching: blocking `theme-boot.js` (no flash, no inline script), `theme.js` (`setTheme`, `toggleTheme`, destination-icon toggle, Light | Dark segmented control, choice saved in `co_theme`), and medal grade chips (`render/grade-chip.js`: A gold, A- silver, B+ bronze, rest steel). Tests: `tests/theme.test.js`, `tests/grade-chip.test.js`, `e2e/theme.spec.js`. The toggle is mounted by the Phase 2B shell.
- Hash router (`public/js/router.js`): `#/home`, `#/today`, `#/pipeline[/:id]`, `#/role/:id/:tab`, `#/stories`, `#/profile`, `#/add[/several|/scan]`, `#/legacy/:page`; first-run state (`home` / `today-empty` / `today`, design §3) picks the start screen. Phase 2 view stubs in `public/js/views/` (one purpose line + one action, or the matching legacy page).
- Storage schema v2 (`public/js/store.js`, build-plan §3a): additive, idempotent migration on load (`co_schema = 2`; roles gain `appliedAt`, `interviewAt`, `nextAction`, `nextActionAt`, `stageHistory[]`, `jdComplete`; stories gain `roleIds[]`), one-time `co_backup_v1` snapshot before the first write, quota-safe (no partial writes). Helpers for Phase 3: `updateRole`, `setStage`, `linkStory`, `onChange`, `exportAll` / `importAll` (backup), `storageUsage` (warns at 80%). A test loads v2 data into the v1 build (`e2e/rollback.spec.js`).
- Per-action feature flags (`public/js/features.js`) for paused actions ("Being rebuilt. Back soon.").
- Fonts (Inter, DM Mono, Source Sans Pro for the CV print window) and PDF.js are self-hosted: no third-party requests on page load. Privacy notice at `/privacy.html`; licences in `THIRD_PARTY_NOTICES.md`.
- CI `e2e` job: Playwright + axe against a static server with a mocked API (`e2e/`, `playwright.config.js`); screenshots and axe results are uploaded as artifacts.
- Agent guardrails: `CLAUDE.md`, PR and issue templates, `.claude/settings.json` deny list, and regression tests for the protected fixes (`tests/protected-fixes.test.js`).
- Phase 3 P3-0 (#27): Foundation kit for the Phase 3 screens. `runTool()` in `public/js/api.js` is the one way new screens call the model: it never throws, sends nothing for paused actions, empty or too-long input or a missing CV, retries 502/503/504 and network errors once (never 500 or other 4xx), keeps the 429/529 back-off, and reports `{raw}`, cut-off and refused replies as errors instead of blank results (`callAPI` unchanged for the legacy pages). Store helpers `addRole`, `addStory`, `removeStory`, `saveProfile` never save a blank entry. Shared UI kit `public/js/ui/{dom,score,paused,tool-state,modal,fit}.js` (bands: apply ≥ 4.0, worth a look 3.0–3.9, skip < 3.0; weighted 10-dimension strip), `extractPdfText` in `pdf.js`, `public/css/ui.css` and seven empty `public/css/views/<screen>.css` linked statically, with a scoping lint. `e2e/shell.spec.js` is view-agnostic; `e2e/split.spec.js` adds per-screen view shots.
- Phase 3C (#30): Today and Pipeline screens (`public/js/views/{today,pipeline}.js`, `public/js/ui/{today,pipeline}/`, `public/css/views/{today,pipeline}.css`). Today shows timed moves built only from dates a role really has (interview, next step, applied 7+ days with no interview, Apply-band roles not yet applied) and, before the first role, an inline job-description box that hands the text to `#/add?jd=1` through the session key `kairo:handoff-jd`. Pipeline is a list plus detail (side by side on desktop, list over detail on tablet, push navigation on phone) with the weighted strip, band, stage select (`setStage`), next step and interview date (`updateRole`), stage history and "Open workspace". Delete is shown paused ("Being rebuilt. Back soon."). Neither screen calls the model.
- Phase 3B (#29): Role workspace at `#/role/:id/:tab` (`public/js/views/role.js`, `public/js/ui/role/*`, `public/css/views/role.css`). Header with role, company, grade medal, score and band; tabs Fit · Tailored CV · Research · Outreach · Interview · Negotiate, each pre-filled from the role's JD and the profile (the JD is never asked for twice). Fit shows all 10 dimensions, the weighted strip, gaps, blocks A–F, STAR starters, red-flag questions and keywords. Tailored CV shows contact, education and languages only when returned, copy sections and Download PDF; the archetype choice and Full preview stay paused. Outreach counts the note against LinkedIn's 200 and 300 limits. Interview lists starters with "Write this story" (hand-off to `#/stories?role=&q=`) and the stories linked to the role. Roles whose JD was cut by v1 get a one-time "paste the full JD" box. Every model call goes through `runTool()`; results stay in memory only and all model text is rendered as text.
- Phase 3A (#28): Home screen at `#/home` (`public/js/views/home.js`, `public/js/ui/home/*`, `public/css/views/home.css`): hero with Start with your CV and an inline, no-API example from `public/data/example-evaluation.json`, 4-step demo (3.6 s, Pause/Play, clickable, static under reduced motion), checklist, workspace tools, apply / worth a look / skip bands and letter-grade scale, the corrected privacy line, Restore a backup (dry-run, confirm modal) and Export a backup, and the attribution footer `ui/site-footer.js` (Impressum slot hidden until `IMPRESSUM_URL` is set). Tests: `tests/view-home.test.js`, `e2e/view-home.spec.js`.
- Phase 4D (#42): README screenshots (Today, Role workspace and Home, phone and desktop, light and dark) and a short first-run GIF under `docs/img/` (WebP under 300 KB each, GIF under 2 MB), generated from synthetic data and a mocked API by `scripts/screenshots/capture.mjs`.
- Phase 4B (#40): accessibility audit (`docs/a11y-audit.md`) and whole-page axe + keyboard/landmark/focus/motion/tap-target regression specs (`e2e/a11y.spec.js`). Skip link, focus moves to the screen heading after navigation, global focus ring, global reduced-motion rule.
- `npm run perf:lighthouse` (scripts/perf/lighthouse.mjs) and `docs/perf-report.md`: reproducible Lighthouse mobile run for Home (73 -> 93 performance, 100 accessibility, 100 best practices).
- `e2e/network-log.spec.js`: logs all requests on first load of every top-level route, fails on any non-same-origin host.
- Phase 3D (#31): Profile & CV, Add role and Story bank screens replace the Phase 2 stubs. Profile: fields, PDF upload (read in the browser), CV text with a 50,000-character counter, apply line (`minscore`, 1 to 5, marks the strip but never moves the bands), Light | Dark, storage meter (warns at 80%), save through `saveProfile`. Add role: one JD with "Evaluate and track" or "Check without saving" then "Track this role"; several JDs split on `---` lines (max 5 per run, sequential, per-row status, failures shown with Try again, Track per row); Find jobs is designed in full with `scan.run` and `scan.portals` paused ("Being rebuilt. Back soon."). Story bank: list, open in a modal, delete with a confirm step, generate (`stories.generate` on; `?role=&q=` pre-fills and links the story to the role). Every model call goes through `runTool`, every save through `addRole`/`addStory`, so a `{raw}`, refused or empty reply shows an error and never saves a blank entry. Tests: `tests/view-{profile,add,stories}.test.js`, `e2e/view-{profile,add,stories}.spec.js`.

### Security
- Harden output escaping for all model-derived text in the UI; Find Jobs links accept https: URLs only; Outreach Copy no longer uses inline handlers.
- `api/evaluate.js`: origin allowlist (403) and per-IP in-memory rate limit (429).

## [1.3.0] - 2026-11-16

### Changed
- Renamed the product to Kairo: UI title and logo, prompt persona, package metadata. New domain https://www.kairoapp.eu, repo kishanbala/kairo. Upstream career-ops attribution unchanged.

### Added
- `docs/COMPARISON.md`: side-by-side with upstream career-ops (baseline 1.40.0), derived vs original, known divergences, not-ported list, licence/naming notes.
- Prompt-injection guardrail: pasted job descriptions are treated as data (`prompts/_shared.md`).
- Frontend renders gaps, red-flag questions, keywords and STAR+R stories.

### Fixed
- `api/evaluate.js` extracts the first balanced JSON object when the model appends prose (CV generation no longer returns `raw`).
- CV preview crash when `skills` is `{proficient, intermediate}`.

### Changed
- `docs/ARCHITECTURE.md` corrected: upstream prompts are English (not Spanish), block lettering (upstream G = posting legitimacy, H = draft answers), recommendation-band and LinkedIn-limit divergences, comp-location claim softened to what was verified.
- README, SECURITY.md and THIRD_PARTY_NOTICES.md: non-affiliation statement, accurate data-path wording, link to the comparison.

## [1.2.0] — 2026-11-16

### Changed
- **Prompts moved out of code into `prompts/*.md`** and aligned with the upstream career-ops architecture: shared rules for every mode, archetype-first evaluation (blocks A-G + ATS keywords + red-flag questions), STAR+R stories with Reflection, 3-sentence outreach framework, and upstream's ethics rule (below 3.0/5 = advise skipping). Built into `lib/prompts.generated.js` by `npm run build:prompts`; `npm test` fails if it is stale.
- **Scoring is now computed by the server** (`lib/scoring.js`) from 10 weighted dimensions (upstream `ofertas.md` weights). The 6-key `dimensions` object the UI renders is derived from them, so the frontend is unchanged. If the model omits `scoring`, its own legacy fields are returned as before.
- `scan` no longer presents invented postings as real: URLs are company careers pages or empty, and every result carries `verified: false`.
- Comp benchmarks moved from code into `prompts/comp-benchmarks.md` and labelled as static estimates.
- `scripts/upstream-check.mjs`: default upstream repo corrected to `santifer/career-ops` (it pointed at `career-ops-hq/career-ops`), and drift reports now name the local prompt files to review.

### Added
- `docs/ARCHITECTURE.md`: upstream-to-web-app mapping, intentional differences, and the not-yet-ported backlog.
- Responses cut off at `max_tokens` now carry `truncated: true`.
- 26 tests (54 total): prompt/schema contract, attribution, scoring maths, handler integration.

### Fixed
- `.gitignore`: removed duplicate `.vercel`; ignore `upstream-report.md`.

## [1.1.0] — 2026-11-16

### Fixed
- **Critical:** every API call was failing with `500` because `api/evaluate.js` was pinned to `claude-sonnet-4-20250514`, a retired model snapshot. Switched to `claude-sonnet-5-5`.
- Response parsing assumed `message.content[0].text`; Sonnet 5.5 can emit a leading `thinking` block before the `text` block, which would have produced the same class of failure again. Now filters `content` by `type === "text"`.

### Added
- `tests/evaluate.test.js` — 28 tests covering all 7 modes, input validation, CORS, prompt assembly, and response-parsing edge cases. Uses Node's built-in `node:test`; no new dependency, no real API calls.
- `.github/workflows/ci.yml` — runs the test suite on every push/PR to `main`.
- `.github/dependabot.yml` — weekly dependency update checks (npm + GitHub Actions).
- `README.md`, `LICENSE` (MIT), `.env.example`, `SECURITY.md`, this changelog — none of these existed before.
- `.gitattributes` — normalizes line endings across OSes.

### Changed
- `api/evaluate.js`: rejects non-string or oversized (`>50,000` chars) `content`/`cv` with `413`, to bound cost per request.
- `max_tokens` raised from `3000` to `6000` — Sonnet 5.5 uses noticeably more tokens for the same output than Sonnet 4 did.
- `package.json`: added `license`, `author`, `repository`, `engines`, and a working `test` script.
- `vercel.json`: added `maxDuration: 60` for `api/evaluate.js` (requires a Vercel Pro plan to take effect).

## [1.0.0] — 2026-09-08

Initial tracked state: offer evaluation, CV tailoring, compensation research, negotiation scripts, STAR stories, company research, outreach drafts, and job scanning, behind a single Vercel serverless function. Dashboard/UI overhaul (dark→light theme, score gauge, responsive nav) and several rendering bugs (CV skills field, nav coverage, grade recalculation) fixed in this phase.

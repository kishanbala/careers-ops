# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project doesn't yet follow strict [SemVer](https://semver.org/) version-for-version, but version bumps are meaningful (breaking/major surface change → minor+, fix/hardening → patch-ish).

## [Unreleased]

### Changed
- Bronze medal chip (B+) meets AA: darkest gradient stop lightened from `#8A5229` to `#A96432` (black text 4.56:1; light and mid stops unchanged). Fixes BUG-16; per Bala's decision A on #22.
- Phase 2A (#22): Gunmetal + Brass design tokens in Light and Dark (`public/css/tokens.css`, design-decisions §4 hex values), keyed on `[data-theme]` and following `prefers-color-scheme` without JS. Legacy token names stay as aliases, so every existing screen is re-skinned, not rebuilt. Fonts are now Familjen Grotesk, Figtree and IBM Plex Mono, self-hosted woff2 (Inter and DM Mono removed). `e2e/split.spec.js` and `ci.yml` take PR labels (`visual:all`, `visual:<screen>`) to allow intentional pixel changes.
- App shell (Phase 2B, #23): header with logo and theme-toggle slot, left nav (≥768 px; menu drawer on phones), phone bottom nav (Today · Pipeline · + · Stories · Profile) shown only once a role exists. The v1 top nav, sidebar and tab bar are replaced; every v1 page is still reachable under a collapsed "Tools" group (`.nav-item[data-page]`), Career Strategy hidden until built. Legacy page sections are unchanged.
- Evaluate & Track stores the full job description (was cut at 500 characters) and a v2 role (`makeRole`).
- `public/index.html` split into a markup shell, `public/css/{tokens,base,components,pages}.css` and native ES modules under `public/js/` (`main`, `store`, `router`, `api`, `pdf`, `render/*`, `pages/*`), loaded with `<script type="module">`. No visual or behavioural change: at most 30 differing pixels per screenshot (CI renderer noise; 0 px locally) against pre-split baselines (`e2e/split.spec.js`; in CI the baselines are rendered from the PR base in the same runner by `e2e/capture-baseline.mjs`, locally `e2e/baseline/`). Inline `onclick` handlers and `window.*` helpers replaced with `addEventListener`.

### Fixed
- Privacy link is visible at every screen width; privacy notice wording corrected.

### Added
- Theme switching: blocking `theme-boot.js` (no flash, no inline script), `theme.js` (`setTheme`, `toggleTheme`, destination-icon toggle, Light | Dark segmented control, choice saved in `co_theme`), and medal grade chips (`render/grade-chip.js`: A gold, A- silver, B+ bronze, rest steel). Tests: `tests/theme.test.js`, `tests/grade-chip.test.js`, `e2e/theme.spec.js`. The toggle is mounted by the Phase 2B shell.
- Hash router (`public/js/router.js`): `#/home`, `#/today`, `#/pipeline[/:id]`, `#/role/:id/:tab`, `#/stories`, `#/profile`, `#/add[/several|/scan]`, `#/legacy/:page`; first-run state (`home` / `today-empty` / `today`, design §3) picks the start screen. Phase 2 view stubs in `public/js/views/` (one purpose line + one action, or the matching legacy page).
- Storage schema v2 (`public/js/store.js`, build-plan §3a): additive, idempotent migration on load (`co_schema = 2`; roles gain `appliedAt`, `interviewAt`, `nextAction`, `nextActionAt`, `stageHistory[]`, `jdComplete`; stories gain `roleIds[]`), one-time `co_backup_v1` snapshot before the first write, quota-safe (no partial writes). Helpers for Phase 3: `updateRole`, `setStage`, `linkStory`, `onChange`, `exportAll` / `importAll` (backup), `storageUsage` (warns at 80%). A test loads v2 data into the v1 build (`e2e/rollback.spec.js`).
- Per-action feature flags (`public/js/features.js`) for paused actions ("Being rebuilt. Back soon.").
- Fonts (Inter, DM Mono, Source Sans Pro for the CV print window) and PDF.js are self-hosted: no third-party requests on page load. Privacy notice at `/privacy.html`; licences in `THIRD_PARTY_NOTICES.md`.
- CI `e2e` job: Playwright + axe against a static server with a mocked API (`e2e/`, `playwright.config.js`); screenshots and axe results are uploaded as artifacts.
- Agent guardrails: `CLAUDE.md`, PR and issue templates, `.claude/settings.json` deny list, and regression tests for the protected fixes (`tests/protected-fixes.test.js`).
- Phase 3 P3-0 (#27): Foundation kit for the Phase 3 screens. `runTool()` in `public/js/api.js` is the one way new screens call the model: it never throws, sends nothing for paused actions, empty or too-long input or a missing CV, retries 502/503/504 and network errors once (never 500 or other 4xx), keeps the 429/529 back-off, and reports `{raw}`, cut-off and refused replies as errors instead of blank results (`callAPI` unchanged for the legacy pages). Store helpers `addRole`, `addStory`, `removeStory`, `saveProfile` never save a blank entry. Shared UI kit `public/js/ui/{dom,score,paused,tool-state,modal,fit}.js` (bands: apply ≥ 4.0, worth a look 3.0–3.9, skip < 3.0; weighted 10-dimension strip), `extractPdfText` in `pdf.js`, `public/css/ui.css` and seven empty `public/css/views/<screen>.css` linked statically, with a scoping lint. `e2e/shell.spec.js` is view-agnostic; `e2e/split.spec.js` adds per-screen view shots.
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

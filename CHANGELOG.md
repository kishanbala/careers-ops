# Changelog

All notable changes to this project are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project doesn't yet follow strict [SemVer](https://semver.org/) version-for-version, but version bumps are meaningful (breaking/major surface change → minor+, fix/hardening → patch-ish).

## [Unreleased]

### Fixed
- Privacy link is visible at every screen width; privacy notice wording corrected.

### Added
- Fonts (Inter, DM Mono, Source Sans Pro for the CV print window) and PDF.js are self-hosted: no third-party requests on page load. Privacy notice at `/privacy.html`; licences in `THIRD_PARTY_NOTICES.md`.
- CI `e2e` job: Playwright + axe against a static server with a mocked API (`e2e/`, `playwright.config.js`); screenshots and axe results are uploaded as artifacts.
- Agent guardrails: `CLAUDE.md`, PR and issue templates, `.claude/settings.json` deny list, and regression tests for the protected fixes (`tests/protected-fixes.test.js`).

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

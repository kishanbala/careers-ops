# Architecture

This web app is built on the evaluation ideas of [santifer/career-ops](https://github.com/santifer/career-ops) (MIT, see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)). [COMPARISON.md](COMPARISON.md) is the full upstream comparison; this document covers how the app works and how each upstream piece maps onto it. Upstream baseline: reviewed 2026-11-16 (core 1.40.0, web 0.18.0).

## How a request flows

```
view (public/js/views/*.js) --runTool(mode, {content})--> public/js/api.js
   --POST {mode, content, cv, profile}--> api/evaluate.js
   system prompt = lib/prompts.generated.js[mode]      (built from prompts/*.md via prompts/modes.json)
   user message  = content + CANDIDATE CV + CANDIDATE CONTEXT
   model reply   = JSON -> (evaluate only) lib/scoring.js recomputes score/grade/dimensions -> response
```

Upstream's sources of truth (`cv.md`, `config/profile.yml`) become the request's `cv` and `profile` fields. Nothing about the candidate is stored in the prompts or on the server; history lives in the browser's `localStorage` (`co_profile`, `co_pipeline`, `co_stories`, plus `co_schema`, `co_theme` and the one-off `co_backup_v1`).

## Frontend (v2)

A static single-page app: `public/index.html` loads CSS, then `public/js/main.js` as an ES module. There is no build step and no framework. The legacy v1 pages are gone; every route renders a view.

```
public/
  index.html            app shell markup: header, left nav (>=768px), phone bottom nav, <main id="app-main">
  js/
    main.js             entry: initTheme() -> mountShell() -> start()
    theme-boot.js       classic script in <head>; sets data-theme before first paint
    router.js           hash router + first-run state
    shell.js            mounts views into #app-main, nav state, badges, footer
    store.js            localStorage, schema v2 migration, roles / stories / profile helpers, export / import
    api.js              runTool(): the only caller of /api/evaluate
    features.js         feature flags (paused actions)
    theme.js            Light / Dark
    pdf.js              CV text extraction (PDF.js, self-hosted under vendor/)
    views/              home, today, pipeline, role, stories, profile, add   (one module per route)
    ui/                 shared kit (dom, fit, score, modal, paused, tool-state, site-footer) + per-view helpers
    render/             escape.js, grade-chip.js, skills.js (flattenSkills), toast.js
  css/                  tokens, base, components, pages, shell, ui, views/<name>.css
  fonts/                self-hosted woff2 + licences; vendor/pdfjs/ self-hosted PDF.js
```

### Router (`router.js`)

Routes are hashes: `#/home`, `#/today`, `#/pipeline[/:id]`, `#/role/:id[/:tab]` (tabs: fit, cv, research, outreach, interview, negotiate), `#/stories`, `#/profile`, `#/add[/several|/scan]`. `parseHash` and `href` are pure; anything unknown falls back to the root. `firstRunState()` reads storage and returns `today` (any saved role, which always wins), `today-empty` (a profile field but no roles) or `home` (nothing yet); `resolveRoute` sends the root and a first-run `#/today` to the right screen. Views subscribe through `onRoute`; `go()` navigates and renders immediately.

### Shell (`shell.js`)

`mountShell()` mounts the site footer once, below every view, and wires the theme toggle, the phone menu button and Esc. On each route it unmounts the previous view, marks the nav item with `aria-current`, lazy-imports `views/<name>.js` and calls `mount(el, { params, state })` (the view may return a cleanup function). The shell sets `data-state` and `data-has-roles` on `.app-shell`, which the CSS uses to show or hide the phone bottom nav. Nav counts (Pipeline, Story bank) are written at start-up.

### Store (`store.js`), schema v2

Schema v2 is additive: it only adds fields, so the previous build still reads v2 data (rollback is tested in `e2e/rollback.spec.js`). `co_schema` holds the version. `migrate()` runs on import and never throws; before its first write it keeps a one-off copy of the v1 data in `co_backup_v1`. Roles gain `appliedAt`, `interviewAt`, `nextAction`, `nextActionAt`, `stageHistory` and `jdComplete`; stories gain `roleIds`. Writers are `addRole`, `updateRole`, `setStage`, `addStory`, `linkStory`, `removeStory` and `saveProfile`; `exportAll` / `importAll` back the Home backup and restore; `storageUsage` backs the Profile storage readout; `onChange(key, fn)` notifies listeners. `isUsable(mode, data)` decides whether a model reply is worth saving, so a blank role or story is never stored.

### `runTool` (`api.js`)

`runTool(mode, { content }, { flag })` never throws and returns `{ ok: true, data }` or `{ ok: false, kind, message }`. It sends no request for a paused flag, empty or over-long input (50,000 characters, the server cap) or a missing CV where the mode needs one. The payload is minimal: `research` sends only the text; other modes add the CV and five profile fields. Retries: 429/529 wait and retry twice; 502-504 and network errors retry once; 500 and 4xx never retry, so a finished answer is never billed twice. `{raw}`, refusals, truncated and unusable replies become errors (`unreadable`, `cut-off`, `refused`), shown with `toolMessage()`.

### UI kit (`ui/`)

- `dom.js`: `h()` builds DOM from text nodes; no `innerHTML`, so model and user text are always escaped.
- `score.js`: the 10 weights (mirrors `lib/scoring.js`; a test fails on drift), bands, score formatting and the weighted strip.
- `fit.js`: `renderFit()`, the fit panel used by Role, Home's example and Add role.
- `tool-state.js`: running and error states; `paused.js`: paused controls and the banner; `modal.js`: one native `<dialog>` modal; `site-footer.js`: attribution (fixed text), Privacy link and an Impressum slot that stays hidden until a URL is set.
- Per-view helpers live in `ui/<view>/` (for example `ui/role/*`, `ui/add/batch.js`).

### Feature flags (`features.js`)

One flag per action, `<area>.<action>`, `'on'` or `'paused'`. A paused action keeps its layout, is dimmed with the "Being rebuilt. Back soon." banner, uses `aria-disabled` and makes no API call. Currently paused: `scan.run`, `scan.portals`, `cv.archetype`, `cv.fullPreview`, `pipeline.delete`. Flipping a flag is a one-line change.

### Theme (`theme.js`, `theme-boot.js`)

`data-theme` on `<html>` is `light` or `dark`. `theme-boot.js` sets it before first paint from `co_theme`, else the OS preference. `theme.js` owns changes (`setTheme`, `toggleTheme`), the header toggle and the segmented control on Profile, and fires `kairo:themechange`.

### CSS hooks

`tokens.css` defines the Gunmetal and Brass colour tokens (light default, dark under `[data-theme="dark"]`, which also follows the OS when no theme is set). `base.css`, `components.css`, `pages.css`, `shell.css` and `ui.css` style the shared parts; each view has its own `css/views/<name>.css`, with class prefixes per view (for example `home-`, `role-`, `ad-`, `pf-`) and `k-` for the shared kit. Tests use stable hooks: `#view-<name>` per view, `data-action` attributes on actions, `data-dest` on nav links, `aria-current="page"` for the active destination.

### Privacy

No third-party requests on page load: fonts and PDF.js are served from `public/`, there are no trackers, and requests carry the minimum data for the mode. `e2e/gdpr.spec.js` and each view spec assert same-origin only.

### Tests

- `tests/*.test.js` (`npm test`, Node's test runner): prompts, scoring, the API handler, router, store and migration, `runTool`, theme, feature flags, UI model and CSS-scope checks, and `tests/protected-fixes.test.js` for the fixes that must not regress. Fixtures: `tests/fixtures/` (`synthetic-profile.json`, `api/`, `storage/`, `views/`); all data is synthetic and the API is mocked.
- `e2e/*.spec.js` (`npx playwright test`, chromium, local static server `scripts/static-server.mjs`): `shell`, one spec per view (`view-*`), `theme`, `gdpr`, `rollback`, and `split.spec.js` pixel checks against the PR base rendered in the same CI run (intentional changes are allowed with `visual:*` labels). Each view spec runs three viewports (390, 820, 1440 px) in both themes with axe (WCAG 2.1 AA) and no-overflow checks. Helpers: `e2e/helpers.js`, `e2e/phase3-helpers.js`.
- `scripts/screenshots/capture.mjs` regenerates the README images in `docs/img/` from the same synthetic data.
- CI (`.github/workflows/ci.yml`): `npm test`, then the Playwright suite.

## Mapping

| Upstream (`career-ops`) | Here | Status |
|---|---|---|
| `modes/_shared.md` rules (never invent, tone, language) | `prompts/_shared.md`, prepended to every mode | Ported, condensed |
| Archetypes + adaptive framing | `prompts/archetypes.md` (editable table) | Ported; **default archetypes are placeholders for data/BI roles, edit them** |
| `oferta.md` Step 0 + blocks A–F | `prompts/evaluate.md`; blocks map to `blocks.*` | Ported, condensed |
| `oferta.md` block H (draft answers, score ≥ 4.5) | `draftAnswers` (we call it "G"; server drops it below 4.5) | Ported; **lettering differs** |
| `oferta.md` block G (posting legitimacy) | None | Not ported |
| `ofertas.md` 10 weighted dimensions | `scoring` object + `lib/scoring.js` | Weights ported; server computes the total (upstream defines these for comparison mode) |
| Recommendation bands (`_shared.md`: below 3.5 recommend against) | `recommendationFor()`: skip advice below 3.0 | **Diverges**, decision pending |
| `pdf.md` ATS rules, keyword injection, summary bridge | `prompts/pdf.md` (+ web-app hard rules) | Ported as rewrite rules; rendering is done by the frontend |
| `contacto.md` three-sentence framework | `prompts/contacto.md` | Framework ported; **300-char limit diverges** (upstream default 200, 300 on Premium/Sales Navigator) |
| `deep.md` research | `prompts/research.md` | Adapted: upstream generates a prompt for another tool, here the model answers directly (no live data) |
| Negotiation scripts (`_shared.md`) | `prompts/negotiate.md` | Ported |
| STAR+R with Reflection | `prompts/story.md`, `starStories[].reflection` | Ported; stories stored in the browser |
| `scan.md` portal scanning | `prompts/scan.md` | **Degraded by design:** no browser, so results are suggestions with `verified: false` |
| Tracker, `templates/states.yml`, dedup/merge scripts | Browser pipeline table, six statuses | Partial; no dedup, no sync |
| `ofertas` (compare), `training`, `project`, `apply`, `pipeline`, `batch`, `tracker`, `followup`, `patterns` modes | Not ported | Backlog |
| Playwright liveness / PDF rendering | Not possible in a serverless function | Backlog (needs a separate worker) |
| WebSearch for comp/company data | Not available to this endpoint | Backlog |

## Intentional differences (web-app originals)

- **Hosted, stateless server** with one endpoint, request size caps and CORS; upstream is local-first with files as the source of truth.
- **Fixed model** (`claude-sonnet-5-5`); upstream is model-agnostic.
- **Server-side scoring**: the model scores 10 dimensions, the server computes the total, grade and recommendation. Upstream's global score is holistic model judgment; its tracker score defaults to the average of block scores. Grade letters and recommendation labels are this project's own.
- **Comp uses the job's location, not the candidate's** (`prompts/comp-benchmarks.md`); upstream's Block D, as reviewed, does not state a benchmark location.
- **`pdf` never drops a role, keeps nationality and contact details** (hard rules in `prompts/pdf.md`).
- **Gap analysis names the specific missing skill** with severity and a concrete bridge.
- **Untrusted-input rule**: pasted job descriptions are treated as data, not instructions (`prompts/_shared.md`).
- **Static comp ranges** are reference data labelled as estimates, not live market data.

## Keeping in sync with upstream

`npm run upstream:check` compares upstream `modes/` against `.upstream-sync.json` and lists which local `prompts/*.md` files derive from whatever changed. Review, port what you want, `npm run build:prompts`, then `npm run upstream:accept`. No baseline file is committed yet; do not run `upstream:accept` until the chosen items are ported, or it will report "in sync" falsely.

## Backlog (not yet implemented)

1. Align recommendation bands and the LinkedIn note limit with upstream (see COMPARISON.md → Known divergences).
2. ~~Show the 10 scoring dimensions in the UI~~ Done: `ui/fit.js` renders all 10.
3. `compare` mode (upstream `ofertas`) and `training` / `project` evaluations; they need new UI.
4. Live comp/company data: the Messages API offers a web search tool; adding it changes cost and latency, so it needs a decision first.
5. Canonical application states and tracker dedup for the in-browser history.
6. Offer verification (is the posting still live?) needs a browser; not possible inside this function.

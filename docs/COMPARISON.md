# Comparison with upstream career-ops

This project is a hosted web app built on the evaluation ideas of [career-ops](https://github.com/santifer/career-ops) by Santiago Fernández de Valderrama (MIT). It is **not** a fork, **not** affiliated with or endorsed by the upstream project or its maintainer, and does not reuse upstream's runtime. This page states exactly what is shared, what differs, and what is missing, so each claim can be checked.

**Baseline:** upstream `santifer/career-ops` `main` as reviewed on 2026-11-16 (release manifest: core 1.40.0, web 0.18.0). Upstream moves fast; re-check before relying on any row. A repository `career-ops-hq/career-ops` also exists (manifest 1.36.0 when checked); its relationship to the author's repo was not verified, and this project tracks `santifer/career-ops`.

## In one paragraph

Upstream is a local-first toolkit: Markdown "modes" that an AI coding CLI executes against files on your machine, plus scripts, a tracker and a PDF pipeline. This project keeps a slice of upstream's evaluation logic (archetype-first evaluation, weighted scoring, STAR+R stories, outreach and CV-tailoring rules) and puts it behind one serverless endpoint and a browser UI. It trades upstream's breadth, file-based data and model-agnosticism for zero-install access, a fixed model and a stateless server.

## Side by side

| | Upstream career-ops | This web app |
|---|---|---|
| Form | Local toolkit run inside an AI CLI (Claude Code, Codex, OpenCode, Gemini, others) | Hosted web app: static page + one Vercel function (`api/evaluate.js`) |
| Install | `npx @santifer/career-ops init`, Node, Playwright/Chromium for PDFs | None for the user; deploy needs a Vercel project and `ANTHROPIC_API_KEY` |
| Logic lives in | `modes/*.md` + `.mjs` scripts | `prompts/*.md` → `lib/prompts.generated.js`, `lib/scoring.js` |
| Model | Any supported CLI/provider; none hardcoded | Anthropic only, `claude-sonnet-5-5` pinned in `api/evaluate.js` |
| Source of truth | Human-readable files (`cv.md`, `config/profile.yml`, `data/`, `reports/`) | Request fields `cv` and `profile`; history in browser `localStorage` (`co_profile`, `co_pipeline`, `co_stories`) |
| Data path | Your machine → your chosen AI provider; upstream states there is no backend | Browser → our Vercel function → Anthropic API. The function does not persist or log request bodies (see `api/evaluate.js`); Vercel's own platform logging is outside this code |
| Auth / multi-user | Single user, local | Single user; **no auth, no rate limit** (see README → Known limitations) |
| Modes | Many (`scan`, `pipeline`, `oferta`, `pdf`, `cover`, `email`, `contacto`, `apply`, `interview-prep`, `tracker`, `followup`, `patterns`, `batch`, …) | Seven: `evaluate`, `pdf`, `research`, `negotiate`, `story`, `scan`, `contacto` |
| Job scanning | Scripts query public job APIs; liveness checks | Model suggestions only, every result `verified: false` (no browsing here) |
| CV output | Playwright renders PDF/HTML/LaTeX | Model returns JSON; the browser renders it, prints to PDF, and offers copy-by-section |
| Tracker | `data/applications.md`, canonical states, dedup, follow-ups, pattern analysis | Pipeline table in the browser with six statuses; no dedup, no sync across devices |
| Scoring | Holistic model judgment; tracker score defaults to the average of block scores | Model scores 10 dimensions; **server computes** total, grade and recommendation (`lib/scoring.js`) |
| Applying | Prepares/fills; user presses Submit; never auto-submits | No apply feature; nothing is submitted |
| Interface | CLI + optional Go terminal dashboard; separate experimental local web UI (below) | Browser UI is the product |

## What is derived from upstream

Each prompt file carries a `derived-from` header; `prompts/modes.json` is the machine-readable map.

| Our file | Upstream source | Nature |
|---|---|---|
| `prompts/_shared.md` | `modes/_shared.md` | Condensed: never-invent rules, archetype adaptation, tone, ethics |
| `prompts/evaluate.md` | `modes/oferta.md`, `modes/ofertas.md` | Adapted: Step 0 archetype, blocks A–F, draft answers, STAR+R, keywords |
| `lib/scoring.js` | `modes/ofertas.md` | The ten dimension weights (25/15/15/10/10/5/5/5/5/5) |
| `prompts/pdf.md` | `modes/pdf.md` | Adapted: ATS rules, keyword injection, summary bridge |
| `prompts/contacto.md` | `modes/contacto.md` | Adapted: three-sentence outreach framework |
| `prompts/research.md` | `modes/deep.md` | Adapted: upstream builds a research prompt; here the model answers directly |
| `prompts/scan.md` | `modes/scan.md` | Degraded by design (no browser) |
| `prompts/negotiate.md`, `prompts/story.md` | `modes/_shared.md`, `modes/oferta.md` | Extracted from shared/evaluation rules |

The prompt text is English adaptation, not verbatim copy. `lib/scoring.js` uses upstream's weights, which upstream defines for its offer-comparison mode (`ofertas.md`); applying them to a single-offer evaluation is a choice made here.

## What is original to this project

- Hosted architecture: single serverless handler, API contract (`{mode, content, cv, profile}`), size caps, CORS, error model.
- Server-side scoring, grade letters (A to D) and recommendation labels. Upstream's `ofertas.md` defines no grade cutoffs.
- Browser UI: dashboard, pipeline table, score gauge, grade guide, copy-by-section CV view, PDF.js CV upload, profile form.
- `pdf` hard rules: never drop or merge a role, keep nationality and contact details.
- Comp benchmarks use the job's location and are labelled static estimates (`prompts/comp-benchmarks.md`). Upstream's Block D, as reviewed, does not state which location benchmarks use.
- Named-gap analysis with severity and bridge; `scan` no-fabrication rules; untrusted-input guardrail for pasted job descriptions.
- Prompt build pipeline (`scripts/build-prompts.mjs`), drift tooling (`scripts/upstream-check.mjs`), 54 tests, CI.

## Known divergences from upstream's current text

These are places where our prompts do not match upstream today. They are open items, not claims of equivalence.

| Topic | Upstream (reviewed 2026-11-16) | This project |
|---|---|---|
| Recommendation bands | 4.5+ apply immediately; 4.0–4.4 worth applying; 3.5–3.9 only with a specific reason; below 3.5 recommend against | Skip advice below 3.0 (`lib/scoring.js`, `prompts/_shared.md`). Bands not yet aligned |
| Block lettering | A–F, **G = posting legitimacy**, **H = draft answers** (score ≥ 4.5) | Draft answers are our "G"; upstream's G is not ported |
| LinkedIn connection note | 200 characters default (free); 300 for Premium/Sales Navigator | Prompt and UI counter assume 300 |
| Output language | `language.output` from `config/profile.yml` | Follows the job description's language, English by default |
| STAR+R stories | 6–10 | 3–6 |
| Work-authorization check, advertised-figure-first comp table, base/variable split | Present in Blocks A and D | Not ported |

## Not ported (deliberate scope)

Posting-legitimacy block, risk summary, cover-letter draft, offer comparison (`ofertas`), `training`, `project`, `apply`, `batch` workers, liveness checks, live web search for comp/company data, canonical states and tracker dedup, plugins, multi-CLI support, local file-based data. Reasons are architectural (serverless, no browser, no filesystem) or scope (stay on the core evaluation idea). See [ARCHITECTURE.md](ARCHITECTURE.md) for the backlog.

## Upstream also has a web UI

Upstream ships an experimental, opt-in web dashboard in its `web/` folder (Next.js, labelled alpha). It runs locally, binds to loopback by default, and is a view over the same local files the CLI uses; its README mentions no hosted version. This project is a different thing: a hosted, stateless web front end for a subset of the evaluation logic, with no access to local files.

## Licence, attribution and naming

- Upstream is MIT, copyright Santiago Fernández de Valderrama. Derived portions are covered by the notice in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md); this repository's own code is MIT under [LICENSE](../LICENSE).
- Upstream publishes a Trademark Policy: code forks are permitted, but product names that include "career-ops" or close variants, and claims of endorsement or official status, need written permission. This project claims no affiliation or endorsement.
- Upstream's manifesto invites others to build their own implementations and says job seekers should never pay. This project is free, personal and non-commercial.

## How to re-verify

1. `npm run upstream:check` lists upstream `modes/` files that changed since the recorded baseline and names the local prompts to review.
2. Compare the table above with upstream `modes/_shared.md`, `oferta.md`, `ofertas.md`, `contacto.md`, `pdf.md`, `scan.md` and `ARCHITECTURE.md`.
3. Local claims: `lib/scoring.js` (weights, grades), `prompts/modes.json` (provenance), `api/evaluate.js` (data path), `public/index.html` (storage keys).

Provenance in git: first commit 2026-04-12 (web UI); prompt and scoring alignment with upstream architecture in commit `d3c3797`, 2026-11-16.

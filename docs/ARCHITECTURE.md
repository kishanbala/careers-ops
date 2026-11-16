# Architecture

This web app is built on the evaluation ideas of [santifer/career-ops](https://github.com/santifer/career-ops) (MIT, see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)). [COMPARISON.md](COMPARISON.md) is the full upstream comparison; this document covers how the app works and how each upstream piece maps onto it. Upstream baseline: reviewed 2026-11-16 (core 1.40.0, web 0.18.0).

## How a request flows

```
public/index.html --POST {mode, content, cv, profile}--> api/evaluate.js
   system prompt = lib/prompts.generated.js[mode]      (built from prompts/*.md via prompts/modes.json)
   user message  = content + CANDIDATE CV + CANDIDATE CONTEXT
   model reply   = JSON -> (evaluate only) lib/scoring.js recomputes score/grade/dimensions -> response
```

Upstream's sources of truth (`cv.md`, `config/profile.yml`) become the request's `cv` and `profile` fields. Nothing about the candidate is stored in the prompts or on the server; history lives in the browser's `localStorage` (`co_profile`, `co_pipeline`, `co_stories`).

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
2. Show the 10 scoring dimensions in the UI (the API returns them in `scoring`; the UI renders only the 6 legacy ones).
3. `compare` mode (upstream `ofertas`) and `training` / `project` evaluations; they need new UI.
4. Live comp/company data: the Messages API offers a web search tool; adding it changes cost and latency, so it needs a decision first.
5. Canonical application states and tracker dedup for the in-browser history.
6. Offer verification (is the posting still live?) needs a browser; not possible inside this function.

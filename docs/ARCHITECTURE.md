# Architecture

Career Ops is a web app built on the evaluation architecture of [santifer/career-ops](https://github.com/santifer/career-ops) (MIT, see [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)). This document says what was kept, what was changed on purpose, and what is not ported yet.

## How a request flows

```
public/index.html --POST {mode, content, cv, profile}--> api/evaluate.js
   system prompt = lib/prompts.generated.js[mode]      (built from prompts/*.md via prompts/modes.json)
   user message  = content + CANDIDATE CV + CANDIDATE CONTEXT
   model reply   = JSON -> (evaluate only) lib/scoring.js recomputes score/grade/dimensions -> response
```

Upstream's "sources of truth" (`cv.md`, `config/profile.yml`) become the request's `cv` and `profile` fields. Nothing about the candidate is stored in the prompts.

## Mapping

| Upstream (`career-ops`) | Here | Status |
|---|---|---|
| `modes/_shared.md` rules (never invent, ethics, tone, language) | `prompts/_shared.md`, prepended to every mode | Ported, condensed |
| Archetypes + adaptive framing | `prompts/archetypes.md` (editable table) | Ported; **default archetypes are placeholders for data/BI roles, edit them** |
| `oferta.md` blocks A-F + G (draft answers if score >= 4.5) | `prompts/evaluate.md`; blocks map to `blocks.*`, G to `draftAnswers` (server drops it below 4.5) | Ported |
| `ofertas.md` 10 weighted dimensions | `scoring` object + `lib/scoring.js` | Ported; server computes the total |
| Ethics: below 3.0 = advise skipping | `recommendationFor()`, shared rules | Ported |
| `pdf.md` ATS rules, keyword injection, summary bridge | `prompts/pdf.md` (+ web-app hard rules) | Ported as rewrite rules; HTML/PDF rendering is done by the frontend |
| `contacto.md` 3-sentence framework, 300 chars | `prompts/contacto.md` | Ported |
| `deep.md` 6-axis research | `prompts/research.md` | Adapted: upstream generates a prompt for another tool, here the model answers directly (no live data) |
| Negotiation scripts (`_shared.md`) | `prompts/negotiate.md` | Ported |
| STAR+R with Reflection, story bank | `prompts/story.md`, `starStories[].reflection` | Ported; the bank itself lives in the browser (localStorage) |
| `scan.md` portal scanning | `prompts/scan.md` | **Degraded by design:** no browser here, so results are suggestions with `verified: false` |
| `templates/states.yml`, tracker, dedup/merge scripts | Not ported | Backlog |
| `ofertas` (compare), `training`, `project`, `apply`, `pipeline`, `batch`, `tracker` modes | Not ported | Backlog |
| Playwright offer verification | Not possible in a serverless function | Backlog (needs a separate worker) |
| WebSearch for comp/company data | Not available to this endpoint | Backlog (see below) |

## Intentional differences (web-app originals)

- **Comp uses the job's location, not the candidate's** (`prompts/comp-benchmarks.md`). Upstream has no such rule.
- **`pdf` never drops a role, keeps nationality and contact details** (hard rules in `prompts/pdf.md`).
- **Gap analysis names the specific missing skill** and a concrete bridge, with `severity`.
- **Server-side scoring**: upstream lets the model total its own score.
- **English prompts**; upstream's are Spanish.
- **Static comp ranges** are reference data, labelled as estimates, not live market data.

## Keeping in sync with upstream

`npm run upstream:check` compares upstream `modes/` against `.upstream-sync.json` and lists which local `prompts/*.md` files derive from whatever changed. Review, port what you want, `npm run build:prompts`, then `npm run upstream:accept`.

## Backlog (not yet implemented)

1. Show the 10 scoring dimensions in the UI (the API already returns them in `scoring`; the UI renders only the 6 legacy ones).
2. `compare` mode (upstream `ofertas`) and `training` / `project` evaluations; they need new UI.
3. Live comp/company data: the Messages API offers a web search tool; adding it changes cost and latency, so it needs a decision before it is wired in.
4. Canonical application states (`states.yml`) and tracker dedup for the in-browser history.
5. Offer verification (is the posting still live?) needs a browser; not possible inside this function.

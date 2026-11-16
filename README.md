# Career Ops

[![CI](https://github.com/kishanbala/careers-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/kishanbala/careers-ops/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/kishanbala/careers-ops)](LICENSE)

A personal, AI-powered job-search and career-management tool. Paste a job description and your CV, and get an offer evaluation, a tailored CV rewrite, company research, a negotiation script, STAR interview stories, LinkedIn outreach copy, and a role scanner — all from one Claude-backed API.

**Live:** https://careers-ops-ui.vercel.app/
**Repo:** https://github.com/kishanbala/careers-ops

<!--
  TODO: add 2-3 screenshots or a short GIF here before linking this repo from a
  resume/LinkedIn — e.g.:
  ![Dashboard](docs/screenshot-dashboard.png)
  ![Offer evaluation](docs/screenshot-evaluate.png)
  A reviewer who can't run the app will judge it on this section alone.
-->

## Features

| Mode | What it does |
|---|---|
| `evaluate` | Scores a job offer against your CV across 6 dimensions (role impact, CV match, compensation, growth, team culture, mission fit), with a letter grade, salary benchmark by job location, personalization hooks, STAR story starters, and named gaps with a bridging narrative. |
| `pdf` | Rewrites your CV tailored to a specific JD — keyword injection, bullet reframing, no invented experience, every original role preserved. |
| `research` | Company research brief: stage, funding, headcount, culture, interview process, red flags, comp, verdict. |
| `negotiate` | A negotiation script — opening, anchor, fallback, close — plus a ready-to-send email. |
| `story` | Generates a STAR-format interview answer from a prompt and your CV. |
| `scan` | Suggests realistic open roles matching a focus area. |
| `contacto` | LinkedIn connection note + InMail draft for outreach. |

All seven modes are driven by **one serverless function** (`api/evaluate.js`); the frontend just changes the `mode` field.

## Stack

- **Frontend:** a single static page, `public/index.html` (vanilla JS, no build step). PDF.js for CV text extraction.
- **Backend:** one Vercel serverless function, `api/evaluate.js`, calling the Anthropic Claude API.
- **Persistence:** `localStorage` in the browser — no database.
- **Model:** `claude-sonnet-5-5` (see [Model updates](#model-updates) below).

## Setup

### Prerequisites
- Node.js ≥ 20
- [Vercel CLI](https://vercel.com/docs/cli) (`npm i -g vercel`) for local dev and deploys
- An [Anthropic API key](https://console.anthropic.com/settings/keys)

### Local development

```bash
git clone https://github.com/kishanbala/careers-ops.git
cd careers-ops
npm install
cp .env.example .env.local   # fill in ANTHROPIC_API_KEY
npm run dev                  # runs `vercel dev`, serves on http://localhost:3000
```

### Deploy

```bash
npm run deploy                # runs `vercel --prod`
```

In the Vercel dashboard, set `ANTHROPIC_API_KEY` under **Project Settings → Environment Variables** (Production, and Preview if you want preview deployments to work).

## API contract

`POST /api/evaluate`

```json
{
  "mode": "evaluate",        // one of: evaluate | pdf | research | negotiate | story | scan | contacto
  "content": "string",       // required — job description, research target, prompt, etc.
  "cv": "string",            // optional — appended as candidate CV context
  "profile": {                // optional — appended as candidate context if `name` is set
    "name": "string",
    "target": "string",
    "salary": "string",
    "location": "string",
    "story": "string"
  }
}
```

Response:
```json
{ "success": true, "data": { /* mode-specific JSON */ }, "mode": "evaluate" }
```
If the model's output isn't valid JSON, `data` falls back to `{ "raw": "<model text>" }` rather than erroring — the request still returns `200`.

Errors: `400` (no/invalid content), `413` (content over 50,000 characters), `405` (non-POST), `500` (missing API key, or the upstream Claude API call failed — see `message` for details).

## Testing

```bash
npm test
```

Runs `tests/evaluate.test.js` on Node's built-in test runner (`node:test`) — no test framework dependency. The Anthropic SDK is mocked via `require.cache`, so the suite makes zero real API calls and costs nothing to run. It covers:

- Transport: CORS headers, `OPTIONS`/method handling, missing/invalid/oversized `content`
- The retired-model regression this fix addressed (asserts the exact model ID sent, and that it's never the old one)
- All 7 modes individually, including that each selects its own system prompt
- `cv` / `profile` context injection into the prompt
- Response parsing: leading `thinking` blocks, markdown-fenced JSON, non-JSON fallback, empty model output
- Upstream API failures surfacing as `500` with the underlying message, CORS headers included

## Model updates

The model ID lives in one place — `MODEL` in `api/evaluate.js`. Anthropic retires model snapshots on a published schedule; when `claude-sonnet-5-5` is deprecated, check the [model deprecations page](https://platform.claude.com/docs/en/about-claude/model-deprecations) for the replacement, update `MODEL`, and re-run `npm test` plus a manual check against each of the 7 modes before deploying.

## Known limitations

- `Access-Control-Allow-Origin: *` — the API accepts requests from any origin. Acceptable for a single-user personal tool; would need an origin allowlist or auth before sharing more broadly.
- No auth — anyone with the URL can call the API and spend your Anthropic credits. The 50,000-character content cap limits damage per request but doesn't rate-limit.
- `vercel.json` sets `maxDuration: 60` for the API function. **This requires a Vercel Pro plan** — on the Hobby plan, functions are capped at 10s regardless of this setting, which can cause timeouts on longer CV rewrites. Either upgrade the plan or lower expectations for `pdf`/`evaluate` mode on Hobby.
- No database — all evaluation history lives in the browser's `localStorage` and doesn't sync across devices.

## Roadmap

- Phase 2: remaining CV/UX polish
- Phase 3: migrate `localStorage` to Supabase (deferred until it's a real blocker)

## Contributing / history

This is a solo personal project; see [CHANGELOG.md](CHANGELOG.md) for what's changed and [SECURITY.md](SECURITY.md) for how API keys and request limits are handled. CI (`.github/workflows/ci.yml`) runs the test suite on every push and PR to `main`.

## Credits

Built on top of [career-ops](https://github.com/santifer/career-ops) by [Santiago Fernández de Valderrama](https://github.com/santifer), MIT licensed. This fork reworks it into a single Vercel-hosted web app (static frontend + one serverless function) rather than a CLI-driven tool, with its own UI, API contract, and test suite.

## License

MIT — see [LICENSE](LICENSE).

# Security

This is a personal project, not a hosted service with other users' data — but it does talk to the Anthropic API, so a few practices apply:

- `ANTHROPIC_API_KEY` is never committed. It's read from an environment variable on Vercel (or `.env.local`, which is gitignored) and used only server-side in `api/evaluate.js`. It is never sent to the browser.
- The API endpoint caps request size (50,000 characters per field) to bound cost from a malformed or malicious request.
- The endpoint has no authentication and no rate limiting (see [README → Known limitations](README.md#known-limitations)). Anyone with the URL can call it and consume API credits. Don't point this at a key you can't afford to have abused, and rotate the key immediately if usage spikes unexpectedly.
- User-supplied data (CV text, job descriptions, profile) is stored only in the browser's `localStorage`. Each request sends it to the serverless function, which relays it to the Anthropic API; `api/evaluate.js` does not persist or log it. Vercel's platform logs and Anthropic's own data handling are outside this repository's control. (Upstream career-ops, by contrast, runs locally with no backend; see [docs/COMPARISON.md](docs/COMPARISON.md).)
- `api/evaluate.js` logs only token counts and mode per request to Redis (never CV/job-description content) for the usage dashboard at `/admin/usage.html`. That endpoint (`api/usage.js`) is gated by a single shared secret (`ADMIN_DASHBOARD_KEY`) — a lock, not a multi-user auth system; anyone with that key and the URL sees the aggregate numbers. If Redis isn't configured, logging is a silent no-op.

## Reporting an issue

This repo doesn't currently have other contributors or users, so there's no formal disclosure process. If you spot a problem, open a GitHub issue or reach out directly.

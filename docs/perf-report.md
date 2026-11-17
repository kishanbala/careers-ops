# Performance report (Phase 4C, #41)

Reproduce: `npm ci && npm run perf:lighthouse` (starts `scripts/static-server.mjs` on port 4181, runs Lighthouse 13 with the default mobile profile: emulated phone, simulated slow 4G, 4x CPU slowdown; Chromium from `CHROME_PATH` or `/opt/pw-browsers/chromium`). Writes `perf-results/lighthouse-home.json` and exits 1 if any category is below 90. Target page: `#/home`.

## Results (local, Home, mobile)

| Category | Before | After |
|---|---|---|
| Performance | 73 | 93 |
| Accessibility | 100 | 100 |
| Best practices | 96 | 100 |

| Metric | Before | After |
|---|---|---|
| FCP | 3257 ms | 1365 ms |
| LCP | 4611 ms | 2583 ms |
| TBT | 33 ms | 0 ms |
| CLS | 0.110 | 0.110 (see BUG-70) |

Scores vary a few points between runs; the Home page was run three to five times per change.

## What Lighthouse flagged and what changed

- **Render and bandwidth contention from `pdf.min.js` (320 KB, synchronous in the body):** it delayed first paint and LCP on the simulated 4G link. It is now loaded on demand by `extractPdfText` in `public/js/pdf.js` (same origin, same file), so nothing changes for the user except a short wait on the first CV PDF import. Loading it after `load` instead (idle) was tried: it moved the cost into TBT (1.4 s) and scored 57.
- **Console error:** `/favicon.ico` returned 404. `<link rel="icon" href="data:,">` in the head (no request).
- **Fonts:** four above-the-fold woff2 files (Figtree 400/600, Familjen Grotesk 600/700) are preloaded with `as=font crossorigin`; `fonts.css` already uses `font-display: swap`.
- **Request chain:** `modulepreload` for `main.js`, `store.js`, `router.js`, `shell.js`, `views/home.js`.

Not changed (out of 4C scope, not needed for 90): CLS 0.11 from the footer (BUG-70), unused JS, 16 separate CSS files, cache headers.

## Network log (GDPR)

`e2e/network-log.spec.js` loads every top-level route on a fresh load (`#/`, home, today, pipeline, stories, profile, add, add/several, add/scan, role) with a synthetic profile, records every request at context level and fails on any non-same-origin host. Logs are written to `e2e-results/network-log/<route>.json`, uploaded by CI in the existing `e2e-screenshots-and-axe` artifact.

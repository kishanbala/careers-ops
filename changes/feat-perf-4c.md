### Added
- `npm run perf:lighthouse` (scripts/perf/lighthouse.mjs) and `docs/perf-report.md`: reproducible Lighthouse mobile run for Home (73 -> 93 performance, 100 accessibility, 100 best practices).
- `e2e/network-log.spec.js`: logs all requests on first load of every top-level route, fails on any non-same-origin host.

### Changed
- Font preloads, `modulepreload` hints and an empty favicon link in `index.html` head.
- PDF.js is now loaded on first PDF import instead of on every page load.

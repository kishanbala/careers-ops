### Fixed
- `README.md` "Known limitations" and `SECURITY.md`: corrected claims that the API has "no authentication and no rate limiting." `api/evaluate.js` has had an `Origin`/`Referer` allowlist and a 20-req/10-min per-IP rate limiter since Phase 0S (`[2.0.0]` entry, CHANGELOG.md); the docs were never updated to say so. No code changed.

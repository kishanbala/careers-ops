### Changed
- PR process: CHANGELOG entries and ledger rows now go in per-PR files under `changes/` (`<branch-slug>.md` / `.csv`); the Release agent folds them with `scripts/fold-changes.mjs`. Stops parallel PRs from conflicting on `CHANGELOG.md` and `docs/build-ledger.csv`. Test: `tests/fold-changes.test.js`.

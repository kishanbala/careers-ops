# changes/

Every PR adds its CHANGELOG entry and ledger row here as new files, never by editing `CHANGELOG.md` or `docs/build-ledger.csv`. Unique file names mean parallel PRs never conflict.

- `<branch-slug>.md`: Keep a Changelog headings (`### Added` / `### Changed` / `### Fixed`) with `- ` bullets.
- `<branch-slug>.csv`: ledger row(s), same columns as `docs/build-ledger.csv`, no header.

`<branch-slug>` is the branch name with `/` replaced by `-` (e.g. `feat-today-pipeline-3c`).

The Release agent runs `node scripts/fold-changes.mjs` in its release PR to fold everything into `CHANGELOG.md` and `docs/build-ledger.csv`. Run it before reading the full cost ledger.

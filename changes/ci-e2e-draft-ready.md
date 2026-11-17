### Changed
- CI (#44): the `e2e` job no longer runs on draft PRs (`test` still does), and runs when a PR is marked Ready for review (`ready_for_review` trigger added). Runs are grouped per PR and a newer push or label change cancels the superseded run; runs on `main` are never cancelled. Builder workflow documented in CLAUDE.md: open as draft, add all `visual:*` labels, then mark Ready.

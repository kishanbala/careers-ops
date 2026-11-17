Closes #

## What changed
<!-- 3 plain lines -->

## How to check
<!-- one link (preview) -->

## Screenshots
<!-- phone + desktop, before/after -->

## Checks
<!-- ✅/❌ test · e2e · a11y -->

## Cost
<!-- ledger rows added -->

## Risk / anything unusual
<!-- name any changed/deleted test or baseline here (rule 14) -->

## Definition of Done
- [ ] `npm test` green incl. protected-fix tests
- [ ] No unescaped model output, secrets or new third-party requests
- [ ] Matches design-decisions doc
- [ ] Paused actions make no API call; bugs logged in `KNOWN-BUGS.md` without duplicates
- [ ] `changes/<branch-slug>.md` + `.csv` added (no direct edits to CHANGELOG.md / build-ledger.csv)

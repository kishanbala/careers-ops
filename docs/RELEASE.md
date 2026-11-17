# Release runbook: Kairo v2.0.0

Owner: Bala. The Release agent prepares the release PR (version, CHANGELOG fold, this runbook, `npm run smoke`). It does not tag, deploy, merge or roll back.

Production: https://www.kairoapp.eu (Vercel). The repo is `kishanbala/kairo`.

## a) Pre-release checklist

Agent-prepared (done in the release PR):
- [x] `node scripts/fold-changes.mjs` run; fragments folded into `CHANGELOG.md` and `docs/build-ledger.csv`.
- [x] `package.json` and `package-lock.json` version set to `2.0.0`; no dependency changes.
- [x] `npm run smoke` and `tests/smoke.test.js` in `npm test`.
- [ ] Release PR is green in CI (`test` and `e2e`) and merged by Bala.

Before tagging (Bala):
- [ ] Set the date in `CHANGELOG.md` (`## [2.0.0] - YYYY-MM-DD`) to the release date.
- [ ] Confirm the release commit on `main` is the one to tag, and its CI run is green.

Bala-only items, all required before the release is announced:
1. Answer the Impressum question on issue #14 (DDG section 5).
2. Device QA on a real iPhone (Safari), an iPad, and Windows (Chrome and Edge), in light and dark.
3. README Roadmap lines 158-159: update them to the current status (option A) or leave them (option B).
4. Change the bronze hex in `docs/revamp/design-decisions.md` section 4 to `#A96432`.
5. VoiceOver and NVDA pass; see the open items in `docs/a11y-audit.md`.
6. Confirm the production environment variables on Vercel and the Anthropic spend limit.

## b) Deploy (Vercel production)

1. Bala merges the release PR to `main`. Nothing deploys from the agent side.
2. In the Vercel dashboard, confirm a production deployment exists for the merge commit and that it is Ready. Whether a push to `main` deploys automatically depends on the Vercel project's Git settings, which are not in this repo; check them before merging.
3. `npm run deploy` runs `vercel --prod` and is the manual route if a production deploy is needed. Use it only when Bala asks for it.
4. The serverless function `api/evaluate.js` uses `maxDuration: 60` (`vercel.json`). The production environment variables are the item 6 check above.

## c) Production smoke test

1. Run `npm run smoke`. It defaults to `https://www.kairoapp.eu`; pass another base URL as an argument or set `SMOKE_BASE_URL`. It exits 0 when every check passes.
   - It makes GET requests only, to the site's own pages and assets. It never requests `/api/*`, so it makes no model call and spends no API budget.
   - It fails on a non-200 page or asset, a wrong content type, an empty asset, a redirect off the site, or any resource loaded from another host.
   - It checks headers only as far as the content type and charset of `/`. It does not check security headers.
2. Open https://www.kairoapp.eu/ in a private window. Home renders in light and dark, and the theme toggle works.
3. Open DevTools, Network tab, on a fresh load: every request is to `www.kairoapp.eu`. Console has no errors.
4. Open https://www.kairoapp.eu/privacy.html. The page loads and the text matches the privacy notice.
5. Do not click Evaluate or any model action in production unless Bala asks; each one is a real API call.

## d) Rollback

Who decides: Bala. The agent does not roll back.

Triggers: a failed smoke test, a P1 regression (a data loss or a core flow that is broken), or a privacy problem.

Step 1, instant (minutes): Vercel dashboard, Deployments, choose the deployment that was live before the v2 deploy (the v1.3.0 build), and use Instant Rollback (promote it to production). Vercel changes which deployment serves the site. It does not touch any user's data.

After a rollback, `npm run smoke` is not a valid check: it expects v2 view modules and will report them missing. Check the v1 site by hand with step c.2 to c.4 instead.

Step 2, code: the `pre-revamp` tag is the code rollback point. It is commit `df2b19a` (`git rev-parse pre-revamp` to confirm). It is an ancestor of `main` and includes the Phase 0S security fixes, so it is not identical to v1.3.0. The v1.3.0 release commit is `01e720b`. To rebuild from old code, branch from the tag or the commit and deploy that branch through Vercel. Do not force-push `main`; this runbook does not do that.

Step 3, data: nothing to restore on the server. See the data-safety notes below before any action that touches a user's browser.

## e) Data-safety notes

These are checked against `docs/ARCHITECTURE.md`, `public/js/store.js` and `e2e/rollback.spec.js`.

- Where data lives: the user's data is in the browser's `localStorage` for the site's origin (`co_profile`, `co_pipeline`, `co_stories`, plus `co_schema`, `co_theme` and `co_backup_v1`). The server keeps no user data. A Vercel rollback does not change or delete it.
- Schema v2 is additive. The migration (`migrate()` in `public/js/store.js`) only adds fields. It never renames or removes one. Roles gain `appliedAt`, `interviewAt`, `nextAction`, `nextActionAt`, `stageHistory` and `jdComplete`; stories gain `roleIds`. Old roles get `null`, never an invented date. The migration is idempotent and never throws.
- Backup: before its first write, the migration stores a one-off copy of the v1 data in `co_backup_v1` (`takeBackup`). It is written once and kept. A rollback does not remove it. It is a copy in the browser, not a server backup, and the app has no button to restore from it; restoring from it would be a manual step.
- Rollback to v1 reads v2 data: `e2e/rollback.spec.js` loads v2 data into the v1 build (the CI reference build is `0241f13`) and checks that the data still reads. It also checks that a v1 status change keeps the other v2 fields, and that a v1-shaped row added after migration loads in v2. Other v1 writes are not covered by that spec, so they are not proven to keep every v2 field.
- Storage limit: the browser allows about 5 MB per origin. The backup copy takes space, so the Profile storage meter (warns at 80%) matters more after the upgrade. The migration does not write partial data when the quota is hit.
- Server side: `api/evaluate.js` does not log or store request content (`/privacy.html`). Its per-IP rate limit is held in memory and resets when the instance restarts. The origin check can be forged by non-browser clients; the Anthropic spend limit is the backstop (see item 6).
- Real user data never reaches the agent or the repo (CLAUDE.md rule 15). The migration dry run on real data is done by Bala in his own browser.

## f) Tag commands (Bala only)

DO NOT RUN BY AGENT. Bala runs these after the release commit is on `main`, is green, and is deployed. Replace `<sha>` with the merge commit SHA.

```sh
# DO NOT RUN BY AGENT
git fetch origin main
git tag -a v2.0.0 <sha> -m "Kairo v2.0.0"
git push origin v2.0.0
```

Do not move or delete `pre-revamp`, `pre-align`, `pre-kairo` or `v1.1.0`.

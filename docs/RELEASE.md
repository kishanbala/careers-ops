# Release runbook: Kairo v2.0.0

Owner: Bala. The Release agent prepares the release PR (version, CHANGELOG fold, this runbook, `npm run smoke`). It does not tag, deploy, merge or roll back.

Production: https://www.kairoapp.eu (Vercel). The repo is `kishanbala/kairo`.

Where things stand: production already serves v2 code. Vercel deploys `main`, and `https://www.kairoapp.eu/js/views/home.js` returns 200 (a v1 build has no such file). So v2 went live phase by phase as each PR merged; the `v2.0.0` tag and the release PR do not deploy anything new. Confirm the Git settings (production branch) in the Vercel dashboard, Project, Settings, Git.

## a) Pre-release checklist

Agent-prepared (done in the release PR and its follow-up #54):
- [x] `node scripts/fold-changes.mjs` run; fragments folded into `CHANGELOG.md` and `docs/build-ledger.csv`.
- [x] `package.json` and `package-lock.json` version set to `2.0.0`; no dependency changes.
- [x] `npm run smoke` and `tests/smoke.test.js` in `npm test`.
- [x] Cost per phase: see section g.
- [ ] Release PRs are green in CI (`test` and `e2e`) and merged by Bala.

Before tagging (Bala):
- [ ] Set the date in `CHANGELOG.md` (`## [2.0.0] - YYYY-MM-DD`) to the release date. Also decide where the `[Unreleased]` entry above it goes (a BUG-60 docs fix, #50).
- [ ] Confirm the release commit on `main` is the one to tag, and its CI run is green.

Bala-only items, all required before the release is announced:
1. Answer the Impressum question on issue #14 (DDG section 5).
2. Device QA on a real iPhone (Safari), an iPad, and Windows (Chrome and Edge), in light and dark.
3. README Roadmap lines 158-159: update them to the current status (option A) or leave them (option B).
4. Change the bronze hex in `docs/revamp/design-decisions.md` section 4 to `#A96432`.
5. VoiceOver and NVDA pass; see the open items in `docs/a11y-audit.md`.
6. Confirm the production environment variable on Vercel and the Anthropic spend limit. `api/evaluate.js` reads one variable, `ANTHROPIC_API_KEY` (checked: it is the only `process.env` use under `api/`). It must be set for Production in Vercel, Project, Settings, Environment Variables. If it is missing the function answers HTTP 500 "ANTHROPIC_API_KEY not configured" instead of calling the model. Check the Anthropic Console for the spend limit that backs the per-IP rate limit.

## b) Deploy (Vercel production)

1. Production follows `main`. A merge to `main` builds a new production deployment of that commit. Nothing deploys from the agent side. Merging a docs-only or release PR redeploys the same app.
2. After each merge, check in the Vercel dashboard (Deployments) that the deployment for the merge commit is Ready and marked Production. If it is not, the project's Git settings are not what this runbook assumes; stop and check them before tagging.
3. A branch or PR deployment is only a Preview. It gets its own URL and does not serve www.kairoapp.eu. To make one serve production it must be promoted (dashboard: open the deployment, promote it to production) or deployed with `vercel --prod`. Do not treat a green Preview as "released".
4. `npm run deploy` runs `vercel --prod`. It deploys the folder you run it in, so run it only from a clean checkout of the exact commit or tag you mean (`git status` shows nothing, `git rev-parse HEAD` is the commit). Use it only when Bala asks for it, or for step d, option 3.
5. The serverless function `api/evaluate.js` uses `maxDuration: 60` (`vercel.json`). The production environment variable is the item 6 check above.

## c) Production smoke test

1. Run `npm run smoke`. It defaults to `https://www.kairoapp.eu`; pass another base URL as an argument or set `SMOKE_BASE_URL`. It exits 0 when every check passes. A run against production on 2026-11-17 passed all checks (237 checks, 75 GET requests).
   - It makes GET requests only (never HEAD or POST), to the site's own pages and assets. It never requests `/api/*`, so it makes no model call and spends no API budget.
   - Pages: `/` and `/privacy.html` must return 200 as `text/html; charset=utf-8` with their expected text.
   - It builds the asset list from what the pages actually reference: `<script src>`, `<link href>` (any `rel` quoting, case or order), `<img>`, `srcset`, `<source>`, inline `<style>` and `style=""` (`@import`, `url()`), CSS files (`@import`, `url()`, `@font-face`), JS modules (static `import`/`export from`, `import()`, literal `fetch(...)` and asset paths, such as `/fonts/print.css`), then the fonts and PDF.js files those reference. It also fails if it cannot find `main.js`, `fonts.css`, `print.css`, the Source Sans and Figtree fonts, or the PDF.js files that way.
   - It fails on a non-200 status, a content type that is not the exact expected one (an extension it does not know also fails), an empty body, a page-load reference to `/api/`, and any reference to another host in any of the places above. A redirect is not followed blindly: the `Location` is checked first, a redirect to another host is a failure, and that host is never contacted. Same-site redirects are followed (at most 5).
   - Limits: it reads text, not a running page, so a URL built at run time is not seen (`e2e/network-log.spec.js` watches a real browser for that, and step 3 below does it by hand). Links to other sites (`<a href>`) are not page loads and are ignored. It does not check security headers or `/api/`.
2. Open https://www.kairoapp.eu/ in a private window. Home renders in light and dark, and the theme toggle works.
3. Open DevTools, Network tab, on a fresh load: every request is to `www.kairoapp.eu`. Console has no errors.
4. Open https://www.kairoapp.eu/privacy.html. The page loads and the text matches the privacy notice.
5. Do not click Evaluate or any model action in production unless Bala asks; each one is a real API call.

## d) Rollback

Who decides: Bala. The agent does not roll back, tag or deploy.

Triggers: a failed smoke test, a P1 regression (a data loss or a core flow that is broken), or a privacy problem.

### What "previous deployment" means today

Production is on v2 and follows `main`, so the deployment before the current one is the build of the previous commit on `main`. That is still v2 code (for example a Phase 4C build), not v1.3.0. Instant Rollback to "the previous deployment" is therefore the right tool only to undo the newest change while staying on v2 (`git log --first-parent main` lists the order). It does not return the site to v1.

### Returning to a v1-era build

First choose the target commit. All of these are on `main` (`git log --oneline` shows them):

| Commit | What it is | Caveat |
|---|---|---|
| `df2b19a` (tag `pre-revamp`, full SHA `df2b19a4dbeea203f8056bff6d40616d65887744`, checked with `git ls-remote --tags origin`) | v1.3.x plus the Phase 0S security fixes and the agent guardrails. The last merge before the revamp work started | `public/index.html` there loads Google Fonts and cdnjs (6 references), and there is no `/privacy.html`. Rolling back to it brings third-party requests on page load back (CLAUDE.md rule 8, GDPR). Older v1 commits (`01e720b` is v1.3.0, `ecd078e` is the Node pin; there is no `v1.3.0` tag) have the same problem and also lack the 0S fixes |
| `c48b9ee` (PR #19) | The last single-file v1 build, with self-hosted fonts and PDF.js and the privacy page | No third-party requests (0 references in `public/index.html`). Not covered by the rollback e2e |
| `0241f13` (PR #21, Phase 1) | The module split with zero visual change. It is the v1 reference build the CI rollback spec runs against | No third-party requests. This is the build the data-safety claims in section e are tested on |

Bala decides which one. `c48b9ee` or `0241f13` avoid the third-party problem; `df2b19a` is the tagged rollback point but needs Bala's explicit acceptance of the Google Fonts and cdnjs requests (and no privacy page) for as long as it is live.

Option 1, promote an existing deployment (minutes, no build). Vercel dashboard, Deployments. Each deployment shows its Git commit message and short SHA, so find the row for the chosen commit (check in the Vercel dashboard which filters and search exist). Those commits were built from `main`, so they are production deployments. Before promoting, open that deployment's own URL and check it is the old build: `/js/views/home.js` must return 404 on it. Then use Instant Rollback / promote to production on that deployment (check the exact button names in the Vercel dashboard). If the row is missing (retention, or never built), use option 2 or 3.

Option 2, deploy the commit through a branch. `git switch -c rollback/v1 <commit>` and `git push -u origin rollback/v1` (never force-push `main`). A branch deployment is only a Preview. Open it in the dashboard, check it as above, then promote it to production, or use option 3.

Option 3, deploy from a checkout with the CLI. `git fetch --tags origin`, `git switch --detach <commit or pre-revamp>`, make sure `git status` is clean, then run `vercel --prod` (at `df2b19a` `npm run deploy` is the same command). It needs the Vercel CLI logged in and linked to the Kairo project (`vercel whoami`; check the link in the dashboard). It uploads the folder you are in, so a dirty tree or wrong commit ships the wrong thing.

Whatever the option, then:
- Verify production: `https://www.kairoapp.eu/js/views/home.js` returns 404, and do steps c.2 to c.4 by hand. `npm run smoke` is not a valid check on a v1 build: it expects v2 view modules and will report them missing.
- Vercel may stop auto-promoting new `main` deployments after a manual rollback until a deployment is promoted again. Check how the dashboard shows this before the next merge to `main`, so a later merge does not silently stay unpromoted (or promote v2 by surprise).
- Rolling forward again is the same promote step, on the deployment of the fixed `main` commit.

An alternative that keeps `main` as the one source of truth is a revert PR (`git revert` of the bad merge), merged by Bala, which Vercel then deploys like any other change. It is slower than a promote.

The `v2.0.0` tag is not a rollback tool and does not exist until Bala creates it; `pre-revamp` is the tagged rollback point. Do not move or delete tags.

Data: nothing to restore on the server. See section e before any action that touches a user's browser.

## e) Data-safety notes

These are checked against `docs/ARCHITECTURE.md`, `public/js/store.js` and `e2e/rollback.spec.js`.

- Where data lives: the user's data is in the browser's `localStorage` for the site's origin (`co_profile`, `co_pipeline`, `co_stories`, plus `co_schema`, `co_theme` and `co_backup_v1`). The server keeps no user data. A Vercel rollback does not change or delete it.
- v1 and the keys: the v1 build (checked at `df2b19a`) reads and writes only `co_profile`, `co_pipeline` and `co_stories`. It never touches `co_schema`, `co_theme` or `co_backup_v1`, so those stay as they were.
- Schema v2 is additive. The migration (`migrate()` in `public/js/store.js`) only adds fields. It never renames or removes one. Roles gain `appliedAt`, `interviewAt`, `nextAction`, `nextActionAt`, `stageHistory` and `jdComplete`; stories gain `roleIds`. Old roles get `null`, never an invented date. The migration is idempotent and never throws.
- Backup: before its first write, the migration stores a one-off copy of the v1 data in `co_backup_v1` (`takeBackup`). It is written once and kept. A rollback does not remove it. It is a copy in the browser, not a server backup, and the app has no button to restore from it; restoring from it would be a manual step. After a rollback it is out of date: it holds the data as it was before the first migration, not any edits made since.
- Rollback to v1 reads v2 data: `e2e/rollback.spec.js` loads v2 data into a v1 build and checks that the data still reads. It also checks that a v1 status change keeps the other v2 fields, and that a v1-shaped row added after migration loads in v2. The reference build in CI is `0241f13` (Phase 1, the module split with zero visual change), not v1.3.0 or `df2b19a`. Phase 1 changed no behaviour, so it is a fair stand-in, but a rollback to `df2b19a` or older is not itself covered by a test: it uses the same three keys, and that a v1 write keeps every v2 field is proven only for `0241f13`. Other v1 writes are not covered by that spec either. After any rollback, Bala checks in his own browser that his data is still there before telling anyone else.
- Storage limit: the browser allows about 5 MB per origin. The backup copy takes space, so the Profile storage meter (warns at 80%) matters more after the upgrade. The migration does not write partial data when the quota is hit.
- Server side: `api/evaluate.js` does not log or store request content (`/privacy.html`). Its per-IP rate limit is held in memory and resets when the instance restarts. The origin check can be forged by non-browser clients; the Anthropic spend limit is the backstop (see item 6).
- Real user data never reaches the agent or the repo (CLAUDE.md rule 15). The migration dry run on real data is done by Bala in his own browser.

## f) Tag commands (Bala only)

DO NOT RUN BY AGENT. Bala runs these after the release commit is on `main`, is green, and is deployed (it deploys by itself when merged; see section b). Replace `<sha>` with the merge commit SHA.

```sh
# DO NOT RUN BY AGENT
git fetch origin main
git tag -a v2.0.0 <sha> -m "Kairo v2.0.0"
git push origin v2.0.0
```

Do not move or delete `pre-revamp`, `pre-align`, `pre-kairo` or `v1.1.0`. (Tags on the remote today: `pre-align` 23884bb, `pre-kairo` ceff8e5, `pre-revamp` df2b19a, `v1.1.0` cf51249.)

## g) Cost per phase (plan section 3c)

Counted from `docs/build-ledger.csv` (25 rows, one per agent session or follow-up). The ledger is the only source here. Agents cannot measure their own usage, so every token, plan-usage and dollar figure is not measured by agents: Bala confirms from dashboards (Anthropic Console usage by date, Claude usage page, GitHub Actions, Vercel). The totals have not been reconciled. The ledger's `ci_minutes` and `bala_hours` columns hold 0 on every row; read those as unknown, not as zero.

| Phase | Ledger rows | Models (rows) | Real API calls | Tokens and dollars |
|---|---|---|---|---|
| 0 (0A audit, 0S, 0B-1, 0B-2, 0B-3, 0B-3b, 0B-3c) | 7 | claude-sonnet-5-5 (6), not recorded (1) | 19 (the 0A audit; budget was 40), spend not recorded | not measured by agents: Bala confirms from dashboards |
| 1 | 1 | claude-opus-5-5 (1) | 0 | not measured by agents: Bala confirms from dashboards |
| 2 (2A twice, 2B) | 3 | claude-sonnet-5-5 (2), claude-opus-5-5 (1) | 0 | not measured by agents: Bala confirms from dashboards |
| 3 (P3-0, 3A, 3B, 3C, 3D) | 5 | claude-sonnet-5-5 (3), claude-opus-5-5 (2) | 0 | not measured by agents: Bala confirms from dashboards |
| 4 (4A, 4B, 4C, 4D) | 4 | claude-sonnet-5-5 (3), claude-opus-5-5 (1) | 0 | not measured by agents: Bala confirms from dashboards |
| Process, CI and docs (changes/ fragments, CI draft rule, BUG-60 docs fix) | 3 | claude-opus-5-5 (1), claude-sonnet-5-5 (1), claude-haiku-5-5 (1) | 0 | not measured by agents: Bala confirms from dashboards |
| 5 (release prep #53, this fix #54) | 2 | claude-haiku-5-5 (1), claude-sonnet-5-5 (1) | 0 | not measured by agents: Bala confirms from dashboards |

Cost per merged PR is not computed: it needs the reconciled dollar figures. Rework: the ledger notes mark five rows as review fixes or follow-ups to earlier PRs (0B-3b, 0B-3c, the 2A BUG-16 row, the BUG-60 docs fix #50, and #54), which is 5 of 25 rows.

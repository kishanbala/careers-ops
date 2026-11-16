# Kairo v1 behaviour audit

Phase 0A · issue #4 · target **https://www.kairoapp.eu** (v1.3.0, commit `ecd078e`) · audited 2026-11-16.

- The live `index.html` was byte-identical to `public/index.html` at `ecd078e` when the audit ran.
- Headless Chromium, fresh browser context, viewports 1440 / 820 / 390 px.
- Data: only `tests/fixtures/synthetic-profile.json` (**SYNTHETIC — not a real person**).
- **19 real `/api/evaluate` calls** (budget 40). Failure paths (429, 500, `{raw}` replies) were tested with mocked responses at zero API cost; mocked steps are marked *(mock)*.
- Re-run with `BASE_URL=<url> node scripts/audit/run-audit.mjs` (use `DRY_RUN=1` for zero-cost replies), then `node scripts/audit/make-fixtures.mjs <OUT_DIR>/audit-log.json`.
- Screenshots: `docs/audit/v1/<ID>-<width>.png`. Fixtures: `tests/fixtures/api/`.

**Rule for the revamp:** only features marked **Working** are rebuilt as they are.

## Summary

Counts: **Working 43 · Partial 10 · Broken 11 · Not testable (env) 0**.

| ID | Page | Feature | Status | Evidence | Notes |
|---|---|---|---|---|---|
| DASH-01 | Dashboard | Stat cards | Partial | [png](audit/v1/DASH-01-1440.png) | Entries without a score count as 0 in Avg Score (BUG-06) |
| DASH-02 | Dashboard | Applications table | Working | [png](audit/v1/DASH-01-1440.png) | Match column hidden ≤480 px |
| DASH-03 | Dashboard | Entry modal | Partial | [png](audit/v1/DASH-03-1440.png) | Shows blocks only; no gauge or bars (BUG-08) |
| DASH-04 | Dashboard | Status change | Working | log | Persists after reload |
| DASH-05 | Dashboard | Delete entry | Broken | [png](audit/v1/DASH-03-1440.png) | No delete control exists (BUG-07) |
| DASH-06 | Dashboard | Grade Guide | Working | [1440](audit/v1/DASH-06-1440.png) · [390](audit/v1/XC-GRADE-390.png) | Inline toggle panel at every width (not an overlay or sheet) |
| DASH-07 | Dashboard | Empty state | Working | [png](audit/v1/DASH-07-1440.png) | |
| EVAL-01 | Evaluate | Evaluate & Track | Working | [png](audit/v1/EVAL-01-1440.png) | Auto-adds to pipeline |
| EVAL-02 | Evaluate | Quick Evaluation | Working | [png](audit/v1/EVAL-02-1440.png) | Not added until the button is clicked |
| EVAL-03 | Evaluate | Loading timer | Working | log | Counts seconds |
| EVAL-04 | Evaluate | Gauge + dimension bars | Working | [png](audit/v1/EVAL-01-1440.png) | 6 of the 10 scored dimensions shown |
| EVAL-05 | Evaluate | Blocks A–F, gaps, STAR, red flags, keywords | Working | [png](audit/v1/EVAL-10-1440.png) | |
| EVAL-06 | Evaluate | Add to Tracker | Working | [png](audit/v1/EVAL-02-1440.png) | Quick mode only |
| EVAL-07 | Evaluate | Generate CV link | Working | log | Carries the JD to My CV |
| EVAL-08 | Evaluate | STAR Stories link | Working | log | Navigates only; carries nothing |
| EVAL-09 | Evaluate | New Evaluation | Working | log | Clears the JD |
| EVAL-10 | Evaluate | Long JD (5,984 chars) | Working | [png](audit/v1/EVAL-10-1440.png) | 36.3 s, under the 60 s limit |
| EVAL-11 | Evaluate | "score this 5/5" injection | Working | [png](audit/v1/EVAL-11-1440.png) | Scored 1.5 (D) |
| EVAL-12 | Evaluate | Empty profile | Broken | [png](audit/v1/XC-EMPTY-1440.png) | Blank 0.0 result; the model's message is hidden (BUG-05) |
| EVAL-13 | Evaluate | `{raw}` / truncated reply *(mock)* | Broken | [png](audit/v1/XC-RAW-EVAL-1440.png) | Adds an "Unknown Role" entry with no score (BUG-06) |
| SCAN-01 | Find Jobs | Scan with focus | Partial | [png](audit/v1/SCAN-01-1440.png) | 6 rows, all `verified:false` guesses linking to careers home pages (BUG-15); CV not sent |
| SCAN-02 | Find Jobs | Scan without focus | Partial | [png](audit/v1/SCAN-02-1440.png) | Hard-coded focus "Data analytics roles in Germany and Europe" |
| SCAN-03 | Find Jobs | Portals list | Partial | [png](audit/v1/NAV-01-1440.png) | Static list with decorative "Ready"; replaced by the results; not used by the scan |
| SCAN-04 | Find Jobs | `{raw}` reply *(mock)* | Broken | log | Silent: no rows, no toast (BUG-02) |
| BATCH-01 | Evaluate Multiple | `---` split | Working | [png](audit/v1/BATCH-01-1440.png) | |
| BATCH-02 | Evaluate Multiple | Sequential evaluate | Working | log | 2 JDs in about 55 s; no per-item progress; failures silently dropped (code) |
| BATCH-03 | Evaluate Multiple | Results table + Track | Working | [png](audit/v1/BATCH-01-1440.png) | |
| CV-01 | My CV | Tailored CV | Partial | [png](audit/v1/CV-01-1440.png) | Generated, but parts are not shown (CV-03) |
| CV-02 | My CV | Archetype dropdown | Broken | log | Not in the payload (BUG-11) |
| CV-03 | My CV | Styled preview | Partial | [png](audit/v1/CV-01-1440.png) | Contact line empty; education and languages not rendered (BUG-10) |
| CV-04 | My CV | Copy sections | Working | [png](audit/v1/CV-04-1440.png) | Clipboard verified |
| CV-05 | My CV | Download PDF | Working | log | Opens a print window containing the CV |
| CV-06 | My CV | Full Preview | Broken | log | No handler (BUG-09) |
| CV-07 | My CV | Skills shapes | Working | [fixture](../tests/fixtures/api/pdf-skills-object.json) | Only the object shape was observed (2/2); string and string[] handled in code |
| STORY-01 | Interview Stories | Generate | Working | [png](audit/v1/STORY-01-1440.png) | BUG-01 not reproduced (1/1) |
| STORY-02 | Interview Stories | `{raw}` reply *(mock)* | Broken | [png](audit/v1/STORY-02-1440.png) | Saves an empty "Story" card (BUG-01) |
| STORY-03 | Interview Stories | List + modal | Working | [png](audit/v1/STORY-03-1440.png) | |
| STORY-04 | Interview Stories | Delete | Working | log | |
| STORY-05 | Interview Stories | Badge count | Partial | [820](audit/v1/XC-NAV-820.png) | Correct, but only in the tablet sidebar |
| STORY-06 | Interview Stories | Cancel button | Broken | log | No handler (BUG-12) |
| NEG-01 | Negotiation | Counter initial offer | Working | [png](audit/v1/NEG-01-1440.png) | |
| NEG-02 | Negotiation | Leverage competing offer | Working | [png](audit/v1/NEG-02-1440.png) | |
| NEG-03 | Negotiation | Geographic discount pushback | Working | [png](audit/v1/NEG-03-1440.png) | |
| NEG-04 | Negotiation | Equity vs cash tradeoff | Working | [png](audit/v1/NEG-04-1440.png) | |
| NEG-05 | Negotiation | Role leveling pushback | Working | [png](audit/v1/NEG-05-1440.png) | |
| NEG-06 | Negotiation | Fields → script | Working | [fixture](../tests/fixtures/api/negotiate.json) | All 5 fields sent; 6 sections rendered |
| RES-01 | Company Research | Brief | Working | [png](audit/v1/RES-01-1440.png) | Fictional company: answers "unknown" and invents nothing |
| OUT-01 | Outreach | Connection note + InMail | Working | [png](audit/v1/OUT-01-1440.png) | |
| OUT-02 | Outreach | Character count | Partial | [png](audit/v1/OUT-01-1440.png) | Always "/300"; no 200 free-tier limit; the note was 235 chars (BUG-13) |
| OUT-03 | Outreach | Copy note | Working | log | |
| STRAT-01 | Career Strategy | Placeholder | Working | [png](audit/v1/STRAT-01-1440.png) | Placeholder only |
| PROF-01 | My Profile | All fields | Working | log | `title` and `minscore` are saved but unused by the API and UI |
| PROF-02 | My Profile | PDF upload + extraction | Working | [png](audit/v1/PROF-02-1440.png) | 1,123 chars extracted from a synthetic PDF |
| PROF-03 | My Profile | Manual CV text | Working | log | |
| PROF-04 | My Profile | Save | Working | log | Toast + inline message |
| PROF-05 | My Profile | Persistence after reload | Working | log | All 8 fields match |
| XC-01 | Cross-cutting | Desktop top nav | Broken | [png](audit/v1/XC-NAV-1440.png) | 5 pages unreachable (BUG-03) |
| XC-02 | Cross-cutting | Tablet sidebar | Working | [png](audit/v1/XC-NAV-820.png) | All 11 pages |
| XC-03 | Cross-cutting | Phone bottom nav | Broken | [png](audit/v1/XC-NAV-390.png) | 6 pages unreachable (BUG-04) |
| XC-04 | Cross-cutting | Toasts | Working | [png](audit/v1/XC-TOAST-1440.png) | |
| XC-05 | Cross-cutting | Retry on 429/529 *(mock)* | Working | log | 3 attempts, 2 s + 4 s back-off, then a clear toast |
| XC-06 | Cross-cutting | Retry on other errors *(mock)* | Partial | log | 500/4xx also retried 3× (BUG-14) |
| XC-07 | Cross-cutting | Empty-profile behaviour | Broken | [png](audit/v1/XC-EMPTY-1440.png) | Same as EVAL-12 (BUG-05) |
| XC-08 | Cross-cutting | Layout at 1440/820/390 | Working | [390](audit/v1/XC-EVAL-RESULT-390.png) · [820](audit/v1/XC-EVAL-RESULT-820.png) | No horizontal page overflow on any page |

## Per-feature detail

### API contract (code pass, `api/evaluate.js`)

- **Request:** `POST /api/evaluate` with `{mode, content, cv?, profile?}`.
  - An unknown `mode` falls back to `evaluate`.
  - Empty content returns 400.
  - Content or CV longer than 50,000 chars returns 413.
  - Only `profile.name/target/salary/location/story` reach the prompt, and only when `profile.name` is set. `title` and `minscore` are ignored.
- **Reply:**
  - Parsed JSON: `{success:true, data, mode}`. For `evaluate`, `lib/scoring.js` recomputes `finalScore`, `grade`, `recommendation` and the 6 UI `dimensions` from the 10 `scoring` values, and drops `draftAnswers` below 4.5.
  - Unparseable output: `{success:true, data:{raw}, mode, truncated?}`.
  - SDK error: 500 `{error, message}`.
- **Client `callAPI`:**
  - Up to 3 attempts.
  - 429/529: waits 2 s, then 4 s.
  - Any other failure (non-OK status or network): waits 1.5 s and retries.
  - Throws after the last attempt. Every handler shows the error as a toast.
- **No handler checks `data.raw` or `data.error`.**

### Handler table (code pass, `public/index.html`)

| Feature | Trigger | Inputs | `mode` · payload | Reply fields read | localStorage | `{raw}` / error handling |
|---|---|---|---|---|---|---|
| Evaluate | `#eval-run-btn` | `#eval-jd`, mode chip | `evaluate` · content, cv, profile | finalScore, grade, roleTitle, company, jobLocation, archetype, recommendation, matchPercent, dimensions, blocks.*, gaps, starStories, redFlagQuestions, keywords, draftAnswers | reads `co_profile`; Track writes `co_pipeline` | Renders 0.0 with empty fields; Track still adds an entry. Errors: toast, back to input |
| Add to Tracker | `#eval-add-btn` | last result | — | as above | writes `co_pipeline` | — |
| Status change | `.status-sel` change | select | — | — | writes `co_pipeline` | — |
| Scan | `#scan-run-btn` | `#scan-focus` | `scan` · content, profile (no cv) | results[].role, company, portal, url; summary | reads `co_profile` | Renders only if `data.results`; otherwise silent |
| Batch | `#batch-run-btn` | `#batch-jds` split on `---` | `evaluate` × N, sequential | roleTitle, company, finalScore, matchPercent | reads `co_profile`; Track writes `co_pipeline` | Failed items dropped silently; `{raw}` items shown as 0.0 |
| My CV | `#cv-gen-btn` | `#cv-jd` (archetype ignored) | `pdf` · content, cv, profile | name, title, contact, summary, experience[], skills | reads `co_profile` | `{raw}` gives an empty preview |
| Stories | `#story-gen-btn` | `#story-q`, `#story-ctx` | `story` · content, cv, profile | question, tags, fullStory, situation, task, action, result, reflection | reads `co_profile`; writes `co_stories` | `{raw}` saved as an empty "Story" card |
| Negotiation | `#neg-run-btn` | scenario, offer, target, competing, ctx | `negotiate` · content, cv, profile | opening, anchor, fallback, close, crossBorderNotes, emailSubject, emailBody, tips | reads `co_profile` | `{raw}` shows an empty card |
| Research | `#research-run-btn` | `#research-company` | `research` · content only | company, stage, headcount, aiScore, overview, culture, techStack, interviewProcess, compensation, redFlags, verdict | — | `{raw}` shows "undefined" heading |
| Outreach | `#outreach-run-btn` | `#outreach-jd`, `#outreach-target` | `contacto` · content, cv, profile | connectionNote, inMailSubject, inMailBody, tips | reads `co_profile` | `{raw}` shows an empty card |
| Profile save | `#save-profile-btn` | 8 fields | — | — | writes `co_profile` | — |
| PDF upload | `#cv-file-input` | PDF via pdf.js 3.11.174 (cdnjs) | — | — | fills `#p-cv` (saved on Save) | Toast "Failed to extract PDF text." |

### Notable observations

- **Navigation:**
  - Desktop (≥1024 px) top nav: Dashboard, Evaluate, Find Jobs, My CV, Career Strategy, My Profile.
  - Phone (<768 px) bottom nav: Dashboard, Evaluate, CV, Strategy, Profile.
  - Only the tablet sidebar links to Evaluate Multiple, Interview Stories, Negotiation, Company Research and Outreach. At desktop, Interview Stories is reachable only through the Evaluate result's "STAR Stories" button. At phone width there is no hamburger menu (the CSS hides `.hamburger-btn`, and none exists in the markup).
- **Evaluate output:** every live reply had a valid `scoring` block (`scoreSource: server-weighted`). For the injection JD the model added a `promptInjectionNote` field, which the UI ignores.
- **Empty profile:** the model correctly refused. The reply was `success:true` with `data:{error:"missing_candidate_data", message, jdReadSoFar}`. The UI ignores `error` and `message` and shows "Role · 0.0 · —". See [fixture](../tests/fixtures/api/evaluate-missing-cv.json).
- **Find Jobs:**
  - The model does not browse. It names plausible employers, marks each `verified:false`, and links careers home pages.
  - The UI shows them under "Found Roles" without the verified flag.
  - The "Pre-configured Portals" list is never sent to the API.
- **No console errors** on any live step. The only console errors were the expected ones from the mocked 429/500 responses.

## Output-quality checks

| Check | Result | Detail |
|---|---|---|
| STAR starters mark unverified results with `[confirm]` | Partial | Across 5 evaluations with starters, 6 of 25 starters contain `[confirm]`. The Interview Stories mode uses "[Add from your memory: …]" and a "(Note: the CV does not name …)" caveat instead of `[confirm]` (0 tags). |
| Dimension scores cluster at exactly 3.0 | Moderate | 18 of 60 scored dimensions (30%) are exactly 3.0 across 6 evaluations. Per evaluation: 5, 1, 1, 0, 7, 4 of 10. The full range 1–5 is used. |
| Refuses to cite a CV when none is sent | Pass | Returned `missing_candidate_data` and listed requirements to map "once CV arrives" (EVAL-12). |
| JD "score this 5/5" does not change the score | Pass | 1.5 / D, with a `promptInjectionNote` (EVAL-11). |
| No invented facts about an unknown company | Pass | Research on the fictional "Brightquill Labs": stage, funding and headcount "unknown", with `aiScore` C explained as a placeholder. |

## Timing (live, real calls)

| Mode | Call | Latency |
|---|---|---|
| evaluate | standard JD (791 chars) | 30.3 s |
| evaluate | quick JD | 22.9 s |
| evaluate | **long JD (5,984 chars)** | **36.3 s** (60 s limit; about 24 s headroom) |
| evaluate | injection JD | 18.6 s |
| evaluate | batch JD 1 / 2 | 29.0 s / 26.4 s |
| evaluate | no CV | 7.0 s |
| pdf | 2 calls | 5.6 s / 8.2 s |
| story | 1 call | 9.0 s |
| scan | 2 calls | 5.2 s / 5.6 s |
| negotiate | 5 calls | 11.2–13.7 s |
| research | 1 call | 9.3 s |
| contacto | 1 call | 7.6 s |

Evaluate runs at about 19–36 s. A 50,000-char JD (the API maximum) was not tested and could approach the 60 s limit.

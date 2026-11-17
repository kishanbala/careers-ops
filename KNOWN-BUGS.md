# Known bugs

Format: ID · Severity (P1–P3) · Version · Feature ID · Environment · Steps · Expected / Actual · Evidence · Suspected cause (unconfirmed) · Status.

- Before adding a bug, search this file by feature ID and symptom.
- If the bug is already listed, add `Seen: +1` with new evidence instead of a new entry.
- Feature IDs and evidence refer to `docs/BEHAVIOUR-AUDIT.md`.

Default environment for all v1 audit entries: https://www.kairoapp.eu, v1.3.0 (`ecd078e`), headless Chromium, fresh context, synthetic profile, 2026-11-16.

---

### BUG-01 · P2 · v1 · STORY-01 / STORY-02
- **Environment:** v1 audit default.
- **Steps:**
  1. Open Interview Stories.
  2. Enter a question.
  3. Click Generate STAR+R Story.
- **Expected:** a story is added. If the model reply cannot be parsed, the user sees an error.
- **Actual:**
  - The live attempt (1 of 1) generated, saved and opened a story correctly, so "story does not generate" was **not reproduced**.
  - With a `{success:true,data:{raw}}` reply *(mocked)*, the app saves a card titled "Story" whose modal contains only "Delete Story". There is no error toast.
- **Evidence:** `docs/audit/v1/STORY-01-1440.png`, `docs/audit/v1/STORY-02-1440.png`, `tests/fixtures/api/story.json`, `tests/fixtures/api/raw-failure.json`.
- **Suspected cause (unconfirmed):** the handler checks only `res.success && res.data` and never `data.raw`. A real `{raw}` reply would produce the empty card a user may report as "does not generate".
- **Status:** Open. The original symptom was not reproduced; the `{raw}` mechanism is confirmed.

### BUG-02 · P2 · v1 · SCAN-01 / SCAN-04
- **Environment:** v1 audit default.
- **Steps:**
  1. Save the profile.
  2. Open Find Jobs.
  3. Click Start Scan, once with a focus and once without.
- **Expected:** results based on the profile. When the reply cannot be used, the user sees an error.
- **Actual:**
  - Live: 6 rows rendered in both runs, so "no results" was **not reproduced**.
  - Confirmed: the payload contains `content` and `profile` but **never `cv`**.
  - With a `{raw}` reply *(mocked)*, nothing renders and no toast appears. The button just becomes "⟳ Rescan".
- **Evidence:** `docs/audit/v1/SCAN-01-1440.png`, `docs/audit/v1/SCAN-02-1440.png`, `tests/fixtures/api/scan.json`.
- **Suspected cause (unconfirmed):** results render only when `data.results` exists. Any `{raw}` reply or other shape is a silent no-op, which matches the reported symptom.
- **Status:** Open. The rendering condition and the missing CV are confirmed; the symptom was not reproduced live.

### BUG-03 · P1 · v1 · XC-01
- **Environment:** v1 audit default, viewport 1440 px (any width ≥1024 px).
- **Steps:** open the site and look at the top nav.
- **Expected:** every page is reachable.
- **Actual:** there are no links to Evaluate Multiple, Interview Stories, Negotiation, Company Research or Outreach. Interview Stories can be reached only through the Evaluate result's "STAR Stories" button.
- **Evidence:** `docs/audit/v1/XC-NAV-1440.png`, `docs/audit/v1/NAV-01-1440.png`.
- **Suspected cause (unconfirmed):** `.top-nav-links` lists only 6 of the 11 pages.
- **Status:** Open.

### BUG-04 · P1 · v1 · XC-03
- **Environment:** v1 audit default, viewport 390 px (any width <768 px).
- **Steps:** open the site and look at the bottom nav.
- **Expected:** every page is reachable.
- **Actual:** only Dashboard, Evaluate, CV, Strategy and Profile are reachable. Find Jobs, Evaluate Multiple, Interview Stories, Negotiation, Company Research and Outreach cannot be reached, and there is no menu.
- **Evidence:** `docs/audit/v1/XC-NAV-390.png`.
- **Suspected cause (unconfirmed):** `.mobile-bottom-nav` has 5 tabs, and `.hamburger-btn` is hidden by CSS and absent from the markup.
- **Status:** Open.

### BUG-05 · P2 · v1 · EVAL-12 / XC-07
- **Environment:** v1 audit default, fresh context with no saved profile.
- **Steps:**
  1. Open Evaluate Offer.
  2. Paste a JD.
  3. Run Quick Evaluation.
- **Expected:** a message asking the user to add a CV or profile first.
- **Actual:**
  - The model refuses correctly with `data:{error:"missing_candidate_data", message, jdReadSoFar}`.
  - The UI shows "Role", a 0.0 gauge, grade "—" and "Match: 0%", and does not show the message.
  - In Evaluate & Track mode the same reply would be added to the pipeline (same path as BUG-06).
- **Evidence:** `docs/audit/v1/XC-EMPTY-1440.png`, `tests/fixtures/api/evaluate-missing-cv.json`.
- **Suspected cause (unconfirmed):** the client never checks `data.error` or `data.message`, and it sends the request even when the profile is empty.
- **Status:** Open.

### BUG-06 · P2 · v1 · EVAL-13 / DASH-01
- **Environment:** v1 audit default (`{raw}` reply mocked).
- **Steps:** run Evaluate & Track and receive `{success:true,data:{raw},truncated:true}`.
- **Expected:** an error such as "evaluation failed or was cut off", and no pipeline entry.
- **Actual:**
  - A 0.0 result is shown.
  - An entry "Unknown Role / Unknown Company" with no score or grade is added to the pipeline.
  - Avg Score then counts it as 0. At 390 px this showed 2.0 instead of 2.7.
- **Evidence:** `docs/audit/v1/XC-RAW-EVAL-1440.png`, `docs/audit/v1/XC-NAV-390.png`, `tests/fixtures/api/raw-failure.json`.
- **Suspected cause (unconfirmed):** `addToPipeline` runs on any `success:true` reply, and `updateBadges` averages `p.score || 0`.
- **Status:** Open.

### BUG-07 · P2 · v1 · DASH-05
- **Environment:** v1 audit default.
- **Steps:** add an evaluation, then look for a delete action in the table and in the entry modal.
- **Expected:** the entry can be removed.
- **Actual:** there is no delete control anywhere. Entries can only change status.
- **Evidence:** `docs/audit/v1/DASH-01-1440.png`, `docs/audit/v1/DASH-03-1440.png`.
- **Suspected cause (unconfirmed):** not implemented. The code has no pipeline delete function.
- **Status:** Open.

### BUG-08 · P3 · v1 · DASH-03
- **Environment:** v1 audit default.
- **Steps:** click a pipeline row.
- **Expected:** the modal shows the gauge, the dimension bars and the blocks.
- **Actual:** the modal shows the evaluation blocks only. There is no gauge and no bars.
- **Evidence:** `docs/audit/v1/DASH-03-1440.png`.
- **Suspected cause (unconfirmed):** `openPipelineModal` calls only `renderEvalBlocks`.
- **Status:** Open.

### BUG-09 · P3 · v1 · CV-06
- **Environment:** v1 audit default.
- **Steps:** generate a CV, then click "⛶ Full Preview".
- **Expected:** a full-screen preview.
- **Actual:** nothing happens. No window opens and the DOM does not change.
- **Evidence:** audit log step CV-06.
- **Suspected cause (unconfirmed):** `#cv-fullscreen-btn` has no event listener.
- **Status:** Open.

### BUG-10 · P3 · v1 · CV-03
- **Environment:** v1 audit default.
- **Steps:** generate a tailored CV.
- **Expected:** the preview shows contact details, education and languages.
- **Actual:**
  - The contact line under the title is empty.
  - Education, languages and interests are returned by the API but not rendered.
- **Evidence:** `docs/audit/v1/CV-01-1440.png`, `tests/fixtures/api/pdf.json`.
- **Suspected cause (unconfirmed):** the UI reads `data.contact`, but the `pdf` prompt returns `email/phone/location/linkedin`. The other sections have no renderer.
- **Status:** Open.

### BUG-11 · P3 · v1 · CV-02
- **Environment:** v1 audit default.
- **Steps:** pick a Role Archetype on My CV, then generate.
- **Expected:** the archetype influences the CV.
- **Actual:** the payload contains only `mode, content, cv, profile`, and the archetype is not sent. This was already known from the inventory.
- **Evidence:** audit log steps CV-01 and CV-02 (`payloadKeys`).
- **Suspected cause (unconfirmed):** the `cv-gen-btn` handler never reads `#cv-archetype`.
- **Status:** Open.

### BUG-12 · P3 · v1 · STORY-06
- **Environment:** v1 audit default.
- **Steps:** on Interview Stories, type a question and click Cancel.
- **Expected:** the form clears or closes.
- **Actual:** nothing happens.
- **Evidence:** code pass (`#story-cancel-btn` has no listener).
- **Suspected cause (unconfirmed):** the handler was never wired.
- **Status:** Open.

### BUG-13 · P3 · v1 · OUT-02
- **Environment:** v1 audit default.
- **Steps:** generate outreach messages.
- **Expected:** the count reflects LinkedIn limits: 200 characters for free accounts, 300 for Premium.
- **Actual:** the counter is always "/300". The generated note was 235 characters, which is over the free-tier limit, and there is no warning.
- **Evidence:** `docs/audit/v1/OUT-01-1440.png`, `tests/fixtures/api/contacto.json`.
- **Suspected cause (unconfirmed):** the limit is hard-coded at 300 in both the UI and the prompt.
- **Status:** Open.

### BUG-14 · P3 · v1 · XC-06
- **Environment:** v1 audit default (500 mocked).
- **Steps:** trigger any API error other than 429/529.
- **Expected:** non-retryable errors (400/413) fail at once, and 5xx errors are retried cautiously.
- **Actual:** every failure is retried 3 times (observed: 3 attempts on a 500). Each retry of a 500 or a 504 timeout is another billed model call.
- **Evidence:** audit log step XC-500.
- **Suspected cause (unconfirmed):** the `catch` in `callAPI` retries every error, including the ones it throws itself.
- **Status:** Open.

### BUG-15 · P2 · v1 · SCAN-01 / SCAN-03
- **Environment:** v1 audit default.
- **Steps:** run Find Jobs.
- **Expected:** real, current listings, or results clearly marked as suggestions.
- **Actual:**
  - Results are the model's guesses (`verified:false`) and link to careers home pages.
  - The UI labels them "Found Roles" and hides the verified flag.
  - The "Pre-configured Portals" list is not sent to the API and is replaced by the results.
- **Evidence:** `docs/audit/v1/SCAN-01-1440.png`, `tests/fixtures/api/scan.json`.
- **Suspected cause (unconfirmed):** the `scan` mode has no browsing or tool access, and the UI drops `verified`.
- **Status:** Open.

### BUG-16 · P3 · v2 · medal chip B+ (found in review, PR #24)
- **Environment:** any viewport, Light and Dark, Chromium.
- **Steps:**
  1. Render a B+ grade with `gradeChip('B+')` (`public/js/render/grade-chip.js`).
  2. Measure the text contrast against the bronze gradient (`--medal-bronze`, design-decisions §4).
- **Expected:** text contrast of at least 4.5:1 (WCAG AA) across the whole chip.
- **Actual:**
  - Black text (`#000000`) on the darkest gradient stop `#8A5229` is 3.32:1. Contrast is higher towards the mid stop `#A8693A` and the light stop `#E2A777`.
  - The gradient stops are fixed by design §4, so the chip text colour alone cannot reach 4.5:1 at the dark end.
- **Evidence:** computed from the §4 hex values; chip markup in `tests/grade-chip.test.js`.
- **Suspected cause (unconfirmed):** the §4 bronze gradient is too dark at its end stop for any single text colour. Decision for Bala: lighten the end stop, drop the gradient behind text, or accept the limit for a 13 px mono label.
- **Status:** fixed in PR #25 (end stop lightened from `#8A5229` to `#A96432`; black text 4.56:1 on it, 4.75:1 on the mid stop).

### BUG-50 · P3 · v2 · STORY-05 / DASH-01 (found in 3D build, PR for #31)
- **Environment:** any viewport, Light and Dark, Chromium.
- **Steps:**
  1. Open `#/stories` and generate a story (or open `#/add` and track a role).
  2. Look at the "Story bank" or "Pipeline" badge in the nav.
- **Expected:** the count goes up as soon as the story or role is saved.
- **Actual:** the badges (`#sb-stories-badge`, `#sb-badge`) are only written by the legacy `updateBadges()` in `pages/dashboard.js`, which the new views do not call. The count stays at its old value until a reload.
- **Evidence:** code reading: `shell.js` subscribes `onChange` only to `updateState()`; nothing else writes the badges.
- **Suspected cause (unconfirmed by a test):** the shell (Foundation) has no badge subscription; the legacy function is the only writer. Fix belongs in the shell, not in a screen.
- **Status:** Open.
- **Note (Phase 4A, #39):** `pages/dashboard.js` is retired; `shell.js` now writes both badges once at start-up (same behaviour as before), still not on change. Fix stays in the bug track.

### BUG-51 · P3 · v2 · design tokens (found in 3D build)
- **Environment:** any.
- **Steps:** build an error state in a Phase 3 view with canonical tokens only (`tests/ui-css-scope.test.js` rejects `--weak`, `--strong`, `--review`).
- **Expected:** a canonical error colour token exists.
- **Actual:** tokens.css defines no canonical error or warning colour; the only red is the legacy alias `--weak`. 3D shows errors with `--text`, bold, and a `--primary-border` outline plus a plain sentence, so colour is never the only signal.
- **Evidence:** `public/css/tokens.css`, `tests/ui-css-scope.test.js` LEGACY_ALIASES.
- **Suspected cause (unconfirmed):** design-decisions §4 lists no error colour. Decision for Bala: add one (both themes, AA).
- **Status:** Open.
### BUG-40 · P3 · v2 · shell bottom nav (found in review, PR #35)
- **Environment:** 390 px, Light, Chromium.
  1. Seed one role and open `#/today` at 390 px.
  2. Measure the contrast of the active bottom-nav label (`.shell-tab[aria-current="page"]`, `--accent` on `--nav-bg`).
- **Expected:** at least 4.5:1 (WCAG AA) for the 10 px label.
- **Actual:** about 4.3:1. The same on main.
- **Evidence:** review comment on PR #35; styles in `public/css/shell.css`.
- **Suspected cause (unconfirmed):** brass `--accent` on the ink bar is just under AA for small text.
- **Status:** fixed in Phase 4B (#40): active label colour `#C9A66B` (5.9:1), covered by `e2e/a11y.spec.js`.

### BUG-90 · P3 · v2 · test infra, e2e/split.spec.js view shots (found in 4A build, #39)
- **Environment:** local dev container, headless Chromium, `CI=true`, 820 px, Light, group "view shots, populated".
- **Steps:**
  1. `node e2e/capture-baseline.mjs <main>/public <dir>` (or the full `npx playwright test` against that baseline).
  2. Watch `views 820px light › view shots, populated`.
- **Expected:** every shot stabilises (two identical consecutive screenshots).
- **Actual:** now and then "screenshot did not stabilise after 6 shots". Seen once rendering main@03b7b68 (capture) and once on the 4A branch; the re-run passed both times.
- **Evidence:** `e2e/split.spec.js` `shot()`; same failure on the PR base, so not caused by the 4A change.
- **Suspected cause (unconfirmed):** a still-moving element in one populated view at 820 px (a transition or the running clock) outlasts the 400 ms settle.
- **Status:** open. Test-infra item; ID taken outside the reserved blocks because Phase 4A has none.

### BUG-60 · P3 · v2 · HOME-02 / how it works demo (found in review of the docs PR)
- **Environment:** any width, Light and Dark, Chromium with `prefers-reduced-motion: reduce`.
- **Steps:**
  1. Open `#/home` with reduced motion on.
  2. Look under "How it works".
- **Expected:** the four steps and the panel only; no Play/Pause button.
- **Actual:** the text "null" appears after the panel (`public/js/ui/home/demo.js` passed the absent toggle, `null`, to `replaceChildren`).
- **Evidence:** `e2e/a11y.spec.js` "BUG-60".
- **Suspected cause (unconfirmed):** `replaceChildren(null)` stringifies null; the toggle is null when reduced motion is on.
- **Status:** fixed in Phase 4B (#40), PR number below once opened.

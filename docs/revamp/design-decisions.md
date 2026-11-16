# Kairo — Locked design decisions (2026-11-16, rev 4)

Source of truth for the UI/UX revamp. Canvas: https://claude.ai/artifact/DDxEwMNsmTcddz5bgsPE8D (row 10 = locked palette, row 06 = first-run home). Agents implement this; changes need Bala's sign-off.
Rev 2: corrected the privacy line (it was inaccurate), added §6 Compliance and the audit scope rule.

## 0. Scope
- The revamp builds only features that `docs/BEHAVIOUR-AUDIT.md` marks **Working**.
- Broken actions (known: generating a STAR story, Find Jobs/Scan, plus any the audit finds) are **designed in full but paused**.
  - They keep their nav item and layout.
  - The action is dimmed, with a small banner: "Being rebuilt. Back soon."
  - It makes no API call, and its controls use `aria-disabled`.
- What still works stays usable (e.g. reading saved stories). Stored data stays intact.
- Flags are per action in `js/features.js`. Turning one on after a fix doesn't move the layout.

## 1. Information architecture
- The **role** is the unit of work. Top-level: **Today**, **Pipeline**, **Story bank**, **Profile & CV**, plus **Add role** (paste one JD, paste several separated by `---`, or scan).
- **Role workspace** tabs: Fit · Tailored CV · Research · Outreach · Interview · Negotiate. Every tool is pre-filled with that role's JD, CV and profile; the JD is never pasted twice.
- Career Strategy is hidden until built. The Grade Guide panel is removed; grades get an inline tooltip and the home page shows the grade scale.
- All 10 scoring dimensions are shown (not the 6 legacy bars).

## 2. Layout per device
- Desktop / laptop / iPad landscape: Ledger structure (left nav, list + detail side by side). It reflows to list-over-detail on iPad portrait and push navigation on phone.
- Phone: Coach structure. Today feed of timed moves, bottom nav (Today · Pipeline · + · Stories · Profile). The **bottom nav appears only after the first role exists**.
- No data tables on phone; use cards and lists.

## 3. First run and empty states
| State (from localStorage) | Screen |
|---|---|
| No `co_profile` | **Home**: hero, animated 4-step demo, 3-step checklist, workspace tools, grade scale, footer |
| Profile saved, `co_pipeline` empty | **Today** with an inline JD box ("Evaluate your first job") |
| Roles exist | **Today** with timed moves |
- Home hero: "Know which jobs are worth your time." CTAs: **Start with your CV** (primary) and **See an example first** (opens a pre-built evaluation: no CV, no API call).
- Demo: 4 steps (Add your CV → Paste a job → Get a verdict → Act on it), auto-advances every 3.6 s, has Pause/Play and clickable steps, and stays static when `prefers-reduced-motion` is set.
- Checklist: 1 Add your CV (2 min) · 2 Say what you are after (1 min, optional) · 3 Evaluate your first job (**under a minute**).
- Privacy line (corrected): "Your CV and roles stay in this browser. When you run a tool, the text goes through our server to Anthropic's AI to produce the result. We don't store it." It links to the privacy notice.
  - Why the change: the earlier "never to anyone else" was wrong, because Vercel (hosting) and Anthropic (AI) both process the request. `api/evaluate.js` does not log or store content, which supports "we don't store it".
- "Restore a backup" is a real button (export/import JSON).
- Every empty page: one line on its purpose plus one action. Never only "No applications yet".
- Footer keeps the attribution: "Evaluation method adapted from santifer/career-ops (MIT)", plus links to Privacy (and Impressum if required).

## 4. Visual system: Gunmetal + Brass (locked)
Type: Familjen Grotesk (display, 500–700) · Figtree (body, 400–600) · IBM Plex Mono (scores and numbers), **all self-hosted as woff2**. Radius: cards 22px, pills 999px. Touch targets ≥ 44px. WCAG AA contrast.

| Token | Light | Dark |
|---|---|---|
| bg | #ECEEF0 | #111316 |
| surface | #FFFFFF | #1A1D21 |
| surface-sub | #F6F7F8 | #15181B |
| border | #D5D9DE | #2C3137 |
| text | #1E2227 | #E8EAED |
| muted | #545B64 | #A2A9B2 |
| primary (brass) | #B08D57, sheen 180° #D4B47A→#B08D57→#9A7743, border #8F6F3C, on-primary #1E2227 | #C9A66B, sheen #E3C68E→#C9A66B→#A88548, on-primary #111316 |
| ink (highlight card) | #2B3036, sheen 135° #3A4048→#2B3036→#1E2227, on-ink #FFFFFF, ink-muted #C3C8CF | #2A2F35, sheen #3A4047→#262A30→#1D2025, on-ink #F4F5F7, ink-muted #B4BAC2 |
| chip | #E4E7EA / #1E2227 | #262B31 / #D9DDE2 |
| strip strong / mid / track | #A6834E / #9AA1AA / #E4E7EA | #C9A66B / #5C646E / #24282E |
| apply line text / border | #7A5C2E / #B08D57 | #D9BC85 / #C9A66B |

- **Metal sheen only on:** the primary button, the highlight card, the A-grade chip and the medals. Everything else is flat.
- **Grades are medals:** A = gold (#F3D98A→#C9A227→#A8841A), A- = silver (#F4F5F7→#B9BEC6→#9AA0A9), B+ = bronze (#E2A777→#A8693A→#8A5229). B, C and D are plain steel.
- **Score visual:** weighted strip, where segment width = dimension weight and fill = score.

## 5. Theme switching
- Two options only: **Light** and **Dark**.
- First visit follows `prefers-color-scheme`. Once the user switches, the choice is saved in localStorage `co_theme` and wins from then on.
- An inline script in `<head>` sets `data-theme` before first paint, so there is no flash.
- Header and phone: one icon button that **shows the destination** (moon + "Dark" in light mode, sun + "Light" in dark mode), with tooltip and aria-label "Switch to dark/light mode". Colours transition over 200–250 ms.
- Profile settings: a "Light | Dark" segmented control with the active option highlighted.
- All colours are CSS custom properties keyed on `[data-theme]`.

## 6. Compliance: GDPR and EU rules (always)
- **No third-party requests on page load.** Fonts and PDF.js (library and worker) are self-hosted. Today both load from Google Fonts and cdnjs.cloudflare.com, which sends each visitor's IP to those hosts (cf. LG München I, 3 O 17493/20).
- No analytics, trackers or cookies without consent. If Vercel Web Analytics is ever enabled, check its consent requirements first.
- A privacy notice page names the processors: Vercel (hosting) and Anthropic (AI model; transfer to the US). It also explains that data lives in the user's browser, and how to delete it.
- Data minimisation: each API mode receives only the fields it needs.
- Check whether an Impressum is required for the public site (DDG § 5) before v2.0.0.
- Any new external service needs Bala's sign-off.

## 7. Open (not locked)
- Recommendation bands (upstream: apply ≥ 4.0, < 3.5 against; ours: skip < 3.0). This affects the grade-scale copy and the apply-line default.
- Surface tint for Gunmetal light mode: neutral #ECEEF0 (rendered) vs blue-steel #DCE2E8 (proposed, not yet reviewed).
- ~~How Broken features appear~~ → decided: designed but paused, with the "Being rebuilt. Back soon." banner (see §0). The phone bottom nav keeps all 5 items.

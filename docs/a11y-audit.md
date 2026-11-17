# Accessibility audit (Phase 4B, issue #40)

Target: WCAG 2.1 AA for every v2 screen and state. Method: axe-core (`@axe-core/playwright`, tags wcag2a, wcag2aa, wcag21a, wcag21aa and best-practice) on the **whole page** (shell, nav, footer, dialogs, not one view), plus scripted keyboard, landmark, focus, motion and tap-target checks, plus the manual checks listed at the end. Synthetic data only; the API is mocked.

Matrix: 21 states x 390 / 820 / 1440 px x light / dark = 126 axe runs (`e2e/a11y-states.js`): Home (empty, example open), Today (moves, first job), Pipeline (list, detail, empty), Role (six tabs, cut JD, tool error), Add (one, several, scan), Profile (filled, empty), Story bank (list, empty, open dialog).

## Findings and fixes

| # | Finding | WCAG | Where | Fix |
|---|---|---|---|---|
| 1 | Active bottom-nav label 4.3:1 (BUG-40) | 1.4.3 | `shell.css` `.shell-tab[aria-current]` | `#C9A66B` (the dark-theme brass), 5.9:1 on both inks. Checked in both themes by test. |
| 2 | Heading order jumps h1 to h3 ("Gaps" in the fit card) on Home example | 1.3.1 | `ui/fit.js` | `h3` to `h2` (class and look unchanged). |
| 3 | Pipeline detail on a phone has no visible h1 (the list h1 is hidden) | 2.4.6 / best practice | `views/pipeline.js`, `pipeline.css` | A visually hidden `h1` ("Pipeline: <role>") inside the detail, hidden again from 768 px where the list h1 shows. |
| 4 | No skip link | 2.4.1 | `index.html`, `shell.css`, `shell.js` | First tab stop, visible on focus, moves focus to `main` without touching the hash (the router owns it). `main` has `tabindex="-1"`. |
| 5 | After a route change focus stayed on the old link | 2.4.3 | `shell.js` | Focus moves to the new screen's `h1` (not on first load, so the skip link stays first). |
| 6 | Text inputs, selects and date fields lost their ring (`outline: none`; only the border colour changed) | 2.4.7 | `components.css` | Keyboard focus ring on `.form-input/.form-textarea/.form-select` and date/time fields. |
| 7 | No baseline focus ring outside the screens that had one (modal buttons, footer links, role tools) | 2.4.7 | `base.css` | Low-specificity `:focus-visible` ring; per-view rings still win. |
| 8 | Reduced motion handled only in Home, Role and the running dot | 2.3.3 | `base.css` | Global `prefers-reduced-motion` rule cuts animations and transitions. |
| 9 | Home "How it works" showed the text "null" under reduced motion (BUG-60) | 1.3.1 | `ui/home/demo.js` | The absent Play/Pause button is no longer passed as a child. |

## Checked and already fine

- Colour contrast in every state at both themes (axe), apart from finding 1.
- Landmarks: one `header`, two named `nav`s (Main, Primary), one `main`, footer inside `main`; one visible `h1` per screen.
- Modal (`<dialog>`): labelled, Esc closes, focus returns to the opener, Tab never reaches the page behind.
- Phone menu: `aria-expanded` follows, Esc closes.
- Accessible names for every button, link, input and select in every state; errors and status messages are in `role=alert` / `role=status` regions.
- Tap targets 44 px or more on a phone for buttons, inputs, selects, nav and footer links.
- No horizontal scroll at 390 px with 200% text size (Role).
- Colour is never the only signal (bands and stages carry text).

## Manual checks (not automatable here)

Done by reading the DOM order and the accessibility tree in Chromium, not with a real screen reader (VoiceOver, NVDA): reading order follows visual order; icons are `aria-hidden`; dialogs announce their title. A real-reader pass is still worth doing before launch (listed under Open).

## Open

- Real screen-reader pass (VoiceOver iOS, NVDA) on Home, Add and the Role tabs.
- Live nav badge counts are announced only on reload (BUG-50, bug track).

## Regression coverage

`e2e/a11y.spec.js` (whole-page axe over the matrix, BUG-40 contrast, landmarks and headings, skip link, focus after navigation, dialog, focus rings on every tab stop, reduced motion, tap targets, names, 200% text, BUG-60).

### Added
- Phase 4B (#40): accessibility audit (`docs/a11y-audit.md`) and whole-page axe + keyboard/landmark/focus/motion/tap-target regression specs (`e2e/a11y.spec.js`). Skip link, focus moves to the screen heading after navigation, global focus ring, global reduced-motion rule.
### Fixed
- BUG-40: active bottom-nav label contrast raised from 4.3:1 to 5.9:1.
- BUG-60: Home "How it works" showed the text "null" under reduced motion.
- Heading order in the fit card, missing h1 on phone pipeline detail, missing focus rings on inputs and selects.

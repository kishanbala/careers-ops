// ===== FEATURE FLAGS (design §0; Phase 2 spec §6) =====
// One flag per action, `<area>.<action>`: 'on' | 'paused'. A paused action keeps its layout,
// is dimmed with the banner, uses aria-disabled and makes no API call. Flipping one is a one-line PR.

export const PAUSED_BANNER = 'Being rebuilt. Back soon.';

export const FLAGS = Object.freeze({
  'stories.view': 'on',
  'stories.generate': 'on', // STORY-01 Working in the audit
  'scan.run': 'paused', // SCAN-* / BUG-02
  'scan.portals': 'paused',
  'cv.archetype': 'paused', // CV-02 / BUG-11
  'cv.fullPreview': 'paused', // CV-06 / BUG-09
  'pipeline.delete': 'paused', // DASH-05 / BUG-07
});

export function flag(key) {
  if (!Object.prototype.hasOwnProperty.call(FLAGS, key)) throw new Error(`Unknown feature flag: ${key}`);
  return FLAGS[key];
}

export const isOn = key => flag(key) === 'on';

export function pausedAttrs(key) {
  return isOn(key) ? {} : { 'aria-disabled': 'true', class: 'is-paused' };
}

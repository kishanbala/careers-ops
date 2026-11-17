// Phase 3 shared kit (spec §5): bands, score formatting and the weighted score strip (design §4).
// WEIGHTS mirrors lib/scoring.js (server-side scoring); tests/ui-score.test.js fails CI if they drift.
import { h } from './dom.js';

export const WEIGHTS = Object.freeze({
  northStar: 0.25,
  cvMatch: 0.15,
  level: 0.15,
  comp: 0.1,
  growth: 0.1,
  remote: 0.05,
  companyReputation: 0.05,
  techStack: 0.05,
  speedToOffer: 0.05,
  cultureSignals: 0.05,
});

export const DIM_LABELS = Object.freeze({
  northStar: 'Fit with your goal',
  cvMatch: 'CV match',
  level: 'Level',
  comp: 'Pay',
  growth: 'Growth',
  remote: 'Remote and location',
  companyReputation: 'Company reputation',
  techStack: 'Tech stack',
  speedToOffer: 'Speed to offer',
  cultureSignals: 'Culture signals',
});

// Bala's decision on #27: apply >= 4.0, worth a look 3.0-3.9, skip < 3.0.
export const BAND_COPY = Object.freeze({ apply: 'Apply', look: 'Worth a look', skip: 'Skip', none: 'Not scored' });
export const DEFAULT_APPLY_LINE = 4.0;

const num = v => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v);
const finite = v => typeof v === 'number' && Number.isFinite(v);

export function band(score) {
  const n = num(score);
  if (!finite(n)) return 'none';
  if (n >= 4.0) return 'apply';
  if (n >= 3.0) return 'look';
  return 'skip';
}

export function fmtScore(n) {
  const v = num(n);
  return finite(v) ? v.toFixed(1) : '—';
}

// The user's apply line (Profile "min score"), 1-5; anything else falls back to 4.0. It marks the strip, never moves the bands.
export function applyLine(profile) {
  const v = num(profile && typeof profile === 'object' ? profile.minscore : undefined);
  return finite(v) && v >= 1 && v <= 5 ? v : DEFAULT_APPLY_LINE;
}

const pct = n => `${Math.round(n * 10000) / 100}%`;

// Weighted strip: one segment per dimension, width = weight, fill height = score / 5; a line marks the apply line.
export function scoreStrip(scoring, { applyLine: line } = {}) {
  const sc = scoring && typeof scoring === 'object' ? scoring : {};
  const mark = finite(line) && line >= 1 && line <= 5 ? line : DEFAULT_APPLY_LINE;
  const parts = [];
  const segs = Object.entries(WEIGHTS).map(([k, w]) => {
    const s = finite(sc[k]) ? Math.min(5, Math.max(0, sc[k])) : null;
    parts.push(`${DIM_LABELS[k]} ${s === null ? 'not scored' : `${fmtScore(s)} of 5`} (weight ${Math.round(w * 100)}%)`);
    const fill = s === null ? null : h('span', {
      class: `k-strip-fill ${s >= 4 ? 'k-strip-fill--strong' : 'k-strip-fill--mid'}`,
      style: { height: pct(s / 5) },
    });
    return h('span', { class: 'k-strip-seg', dataset: { dim: k }, style: { 'flex-grow': String(w) } }, fill);
  });
  const label = `Score by dimension, apply line ${fmtScore(mark)}: ${parts.join('; ')}.`;
  return h('div', { class: 'k-strip', role: 'img', 'aria-label': label },
    segs,
    h('span', { class: 'k-strip-line', 'aria-hidden': 'true', style: { bottom: pct(mark / 5) } }));
}

export function bandPill(score) {
  const b = band(score);
  return h('span', { class: `k-band k-band--${b}`, dataset: { band: b } }, BAND_COPY[b]);
}

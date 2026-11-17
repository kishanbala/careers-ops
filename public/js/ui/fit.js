// Phase 3 shared kit (spec §5): minimal Fit view. P3-0 ships it; 3B (Role workspace) owns it afterwards.
// Signature is fixed: renderFit(el, evalData, { role?, compact? }). 3A's example and 3D's quick check use it as is.
// Shows grade medal, score, band, the weighted strip, all 10 dimensions and the gaps. Text only, no innerHTML.
import { h } from './dom.js';
import { WEIGHTS, DIM_LABELS, fmtScore, bandPill, scoreStrip, applyLine } from './score.js';
import { gradeTier } from '../render/grade-chip.js';
import { profile } from '../store.js';

const str = v => (typeof v === 'string' ? v.trim() : '');

function gradeMedal(grade) {
  const g = str(grade);
  return h('span', { class: `grade-chip grade-chip--${gradeTier(g)} grade-chip--lg`, 'aria-label': `Grade ${g || 'not given'}` }, g || '—');
}

export function renderFit(el, evalData, { role, compact = false } = {}) {
  const d = evalData && typeof evalData === 'object' ? evalData : {};
  const sc = d.scoring && typeof d.scoring === 'object' ? d.scoring : {};
  const title = str(d.roleTitle) || str(role && role.role);
  const company = str(d.company) || str(role && role.company);
  const score = typeof d.finalScore === 'number' ? d.finalScore : (role ? role.score : undefined);

  const head = h('div', { class: 'k-fit-head' },
    gradeMedal(d.grade || (role && role.grade)),
    h('div', { class: 'k-fit-score' },
      h('span', { class: 'k-fit-num' }, fmtScore(score)),
      h('span', { class: 'k-fit-of' }, ' / 5')),
    bandPill(score));
  const heading = title || company
    ? h('p', { class: 'k-fit-role' }, title, title && company ? ' · ' : '', company)
    : null;

  const parts = [head, heading, scoreStrip(sc, { applyLine: applyLine(profile) })];

  if (!compact) {
    parts.push(h('ul', { class: 'k-fit-dims', 'aria-label': 'All 10 dimensions' },
      Object.entries(WEIGHTS).map(([k, w]) => h('li', { class: 'k-fit-dim', dataset: { dim: k } },
        h('span', { class: 'k-fit-dim-label' }, DIM_LABELS[k]),
        h('span', { class: 'k-fit-dim-weight' }, `${Math.round(w * 100)}%`),
        h('span', { class: 'k-fit-dim-score' }, fmtScore(sc[k]))))));
    const gaps = Array.isArray(d.gaps) ? d.gaps.filter(g => g && typeof g === 'object' && str(g.gap)) : [];
    if (gaps.length) {
      parts.push(h('h2', { class: 'k-fit-subhead' }, 'Gaps'));
      parts.push(h('ul', { class: 'k-fit-gaps' }, gaps.map(g => h('li', { class: 'k-fit-gap' },
        h('p', { class: 'k-fit-gap-title' }, str(g.gap), str(g.severity) ? h('span', { class: 'k-fit-gap-sev' }, ` · ${str(g.severity)}`) : null),
        str(g.why) ? h('p', { class: 'k-fit-gap-why' }, str(g.why)) : null,
        str(g.bridge) ? h('p', { class: 'k-fit-gap-bridge' }, str(g.bridge)) : null))));
    }
  }
  el.replaceChildren(h('section', { class: `k-fit${compact ? ' k-fit--compact' : ''}`, 'aria-label': 'Fit' }, parts));
}

// Phase 3B (#29): role workspace header (title, company, grade medal, score, band), the one-time
// "paste the full JD" box for roles whose JD was cut by v1 (schema v2 jdComplete === false), and the tab bar.
import { h } from '../dom.js';
import { fmtScore, bandPill, BAND_COPY, band } from '../score.js';
import { gradeTier } from '../../render/grade-chip.js';
import { href } from '../../router.js';
import { roleHeading, TABS } from './model.js';

export function gradeMedal(grade, score) {
  const g = grade || '—';
  const tip = grade ? `Grade ${grade}: ${BAND_COPY[band(score)]}. A is the best grade, D the lowest.` : 'Not graded';
  return h('span', { class: `grade-chip grade-chip--${gradeTier(grade)} grade-chip--lg role-grade`, title: tip, 'aria-label': grade ? `Grade ${grade}` : 'Not graded' }, g);
}

export function roleHeader(role) {
  const r = roleHeading(role);
  return h('header', { class: 'role-head' },
    h('div', { class: 'role-head-text' },
      h('h1', { class: 'page-title role-title' }, r.title),
      r.company || r.location ? h('p', { class: 'role-sub' }, [r.company, r.location].filter(Boolean).join(' · ')) : null),
    h('div', { class: 'role-head-verdict' },
      gradeMedal(r.grade, r.score),
      h('p', { class: 'role-head-score' }, h('span', { class: 'role-head-num' }, fmtScore(r.score)), h('span', { class: 'role-head-of' }, ' / 5')),
      bandPill(r.score)));
}

// onSave(text) persists the JD; returns an error message string, or '' when saved.
export function fullJdBox(onSave) {
  const id = 'role-full-jd';
  const ta = h('textarea', { id, class: 'form-textarea role-textarea', rows: 6, 'aria-describedby': `${id}-hint` });
  const msg = h('p', { class: 'role-inline-msg', role: 'status', 'aria-live': 'polite' });
  const save = h('button', { type: 'button', class: 'btn btn-primary role-btn', dataset: { action: 'save-full-jd' } }, 'Save full job description');
  save.addEventListener('click', () => {
    const err = onSave(ta.value);
    msg.textContent = err;
    if (err) ta.focus();
  });
  return h('section', { class: 'card role-card role-jd-box', 'aria-labelledby': `${id}-title` },
    h('h2', { class: 'role-card-title', id: `${id}-title` }, 'Paste the full job description'),
    h('p', { class: 'role-hint', id: `${id}-hint` }, 'An older version of Kairo kept only the first 500 characters of this job. Paste the whole text once, and every tool here will use it.'),
    h('label', { class: 'form-label', for: id }, 'Full job description'),
    ta,
    h('div', { class: 'role-actions' }, save),
    msg);
}

export function roleTabs(roleId, active) {
  return h('nav', { class: 'role-tabs', 'aria-label': 'Role tools' },
    h('ul', { class: 'role-tab-list' }, TABS.map(t => h('li', null,
      h('a', {
        class: `role-tab${t.id === active ? ' is-active' : ''}`,
        href: href('role', { id: roleId, tab: t.id }),
        'aria-current': t.id === active ? 'page' : null,
        dataset: { tab: t.id },
      }, t.label)))));
}

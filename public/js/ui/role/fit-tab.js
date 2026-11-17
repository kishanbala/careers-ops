// Phase 3B (#29): Fit tab (EVAL-04/05). renderFit + blocks A-F + STAR starters + red flags + keywords (+ draft answers).
// Everything comes from the role's saved evaluation; no API call.
import { h } from '../dom.js';
import { renderFit } from '../fit.js';
import { roleEval, hasFullEval, evalBlocks, starStarters, redFlags, keywords, draftAnswers, storyHref } from './model.js';
import { textSection } from './parts.js';

export function starterList(role, items, { withLinks = true } = {}) {
  return h('ol', { class: 'role-qa' }, items.map(s => h('li', { class: 'role-qa-item' },
    h('p', { class: 'role-qa-q' }, s.question),
    s.starter ? h('p', { class: 'role-text' }, s.starter) : null,
    s.reflection ? h('p', { class: 'role-text role-qa-r' }, h('span', { class: 'role-qa-tag' }, 'Reflection: '), s.reflection) : null,
    withLinks ? h('a', { class: 'btn btn-outline role-qa-link', href: storyHref(role.id, s.question) }, 'Write this story') : null)));
}

export function redFlagList(items) {
  return h('ol', { class: 'role-qa' }, items.map(q => h('li', { class: 'role-qa-item' },
    h('p', { class: 'role-qa-q' }, q.question),
    q.answer ? h('p', { class: 'role-text' }, q.answer) : null)));
}

export function renderFitTab(el, role) {
  const data = roleEval(role);
  const fitBox = h('div', { class: 'role-fit' });
  renderFit(fitBox, data, { role });

  const parts = [h('section', { class: 'card role-card' }, h('h2', { class: 'role-card-title' }, 'Score and fit'), fitBox)];
  if (!hasFullEval(role)) {
    parts.push(h('p', { class: 'role-note' }, 'This role was saved without its full evaluation, so only the score is shown. Evaluate the job again in Add role to see every dimension.'));
  }

  const blocks = evalBlocks(data);
  if (blocks.length) {
    parts.push(h('section', { class: 'card role-card' },
      h('h2', { class: 'role-card-title' }, 'Evaluation'),
      blocks.map(b => textSection(`${b.letter} · ${b.title}`, b.text))));
  }

  const stars = starStarters(data);
  if (stars.length) {
    parts.push(h('section', { class: 'card role-card' },
      h('h2', { class: 'role-card-title' }, 'STAR+R story starters'),
      starterList(role, stars, { withLinks: false })));
  }

  const flags = redFlags(data);
  if (flags.length) {
    parts.push(h('section', { class: 'card role-card' },
      h('h2', { class: 'role-card-title' }, 'Red-flag questions to ask'),
      redFlagList(flags)));
  }

  const kw = keywords(data);
  if (kw.length) {
    parts.push(h('section', { class: 'card role-card' },
      h('h2', { class: 'role-card-title' }, 'ATS keywords'),
      h('ul', { class: 'role-chips', 'aria-label': 'Keywords from the job description' }, kw.map(k => h('li', { class: 'role-chip' }, k)))));
  }

  const drafts = draftAnswers(data);
  if (drafts.length) {
    parts.push(h('section', { class: 'card role-card' },
      h('h2', { class: 'role-card-title' }, 'G · Draft application answers'),
      redFlagList(drafts)));
  }
  el.replaceChildren(...parts);
}

// Phase 3C: Today. Empty profile+pipeline state: an inline JD box that hands off to #/add (spec §6).
// With roles: timed moves built only from dates the roles really have (ui/today/moves.js).
import { h } from '../ui/dom.js';
import { fmtScore } from '../ui/score.js';
import { buildMoves, countMoves, summary, fmtWhen, fmtDay, GROUPS } from '../ui/today/moves.js';
import { href } from '../router.js';
import { pipeline, profile, onChange } from '../store.js';

export const HANDOFF_KEY = 'kairo:handoff-jd'; // session key named in the spec (§6, rule 6)
const MAX_JD = 50_000; // the same limit the model calls enforce

function firstJob(el) {
  const err = h('p', { class: 't-error', role: 'alert', id: 't-jd-error' });
  const ta = h('textarea', {
    id: 't-jd', class: 'form-textarea t-jd', rows: '8', 'aria-describedby': 't-jd-hint t-jd-error',
    placeholder: 'Paste the full job description here',
  });
  const noCv = !(typeof profile.cv === 'string' && profile.cv.trim());
  const form = h('form', { class: 't-first', novalidate: true, onSubmit: e => {
    e.preventDefault();
    const jd = ta.value;
    err.textContent = '';
    if (!jd.trim()) { err.textContent = 'Paste a job description first.'; ta.focus(); return; }
    if (jd.length > MAX_JD) { err.textContent = `That is too long (${jd.length.toLocaleString('en-GB')} characters). The limit is ${MAX_JD.toLocaleString('en-GB')}.`; ta.focus(); return; }
    try { sessionStorage.setItem(HANDOFF_KEY, jd); } catch {
      err.textContent = 'Your browser blocked the hand-off. Open Add role and paste the job description there.';
      return;
    }
    location.hash = '#/add?jd=1';
  } },
  h('label', { class: 'form-label', for: 't-jd' }, 'Job description'),
  ta,
  h('p', { class: 't-hint', id: 't-jd-hint' }, 'You get a verdict in under a minute. Nothing is sent until you run the evaluation.'),
  err,
  noCv ? h('p', { class: 't-note' }, 'Your CV is not saved yet. ', h('a', { href: href('profile') }, 'Add it in Profile'), ' so the verdict can be checked against it.') : null,
  h('div', { class: 't-actions' },
    h('button', { type: 'submit', class: 'btn btn-primary t-btn', dataset: { action: 'first-job' } }, 'Evaluate your first job'),
    h('a', { class: 'btn btn-outline t-btn', href: href('add', { mode: 'several' }) }, 'Paste several jobs')));
  el.append(
    h('div', { class: 'page-header' },
      h('h1', { class: 'page-title' }, 'Today'),
      h('p', { class: 'page-subtitle view-purpose' }, 'Paste a job description and get a verdict in under a minute.')),
    h('section', { class: 'card t-card', 'aria-label': 'Evaluate your first job' }, form));
}

const KIND_LABEL = { interview: 'Interview', next: 'Next step', undated: 'Next step', waiting: 'Waiting', ready: 'Ready to apply' };

function moveCard(m, now) {
  const when = m.kind === 'ready' || m.kind === 'undated' ? '' : (m.kind === 'waiting' ? `Applied ${fmtDay(m.at)}` : fmtWhen(m.at, now));
  const title = m.company ? `${m.role} at ${m.company}` : m.role;
  return h('li', { class: `t-move t-move--${m.kind}`, dataset: { kind: m.kind } },
    h('p', { class: 't-move-kind' }, KIND_LABEL[m.kind] || 'Move'),
    h('a', { class: 't-move-link', href: href('pipeline', { id: m.roleId }) }, title),
    m.kind === 'interview' ? null : h('p', { class: 't-move-text' }, m.kind === 'ready' ? `${m.text} (score ${fmtScore(m.score)})` : m.text),
    when ? h('p', { class: 't-move-when' }, when) : null);
}

function stat(label, value) {
  return h('div', { class: 't-stat' }, h('dt', { class: 't-stat-label' }, label), h('dd', { class: 't-stat-num' }, String(value)));
}

function moves(el) {
  const now = Date.now();
  const m = buildMoves(pipeline, now);
  const n = countMoves(m);
  const s = summary(pipeline);
  const parts = [
    h('div', { class: 'page-header' },
      h('h1', { class: 'page-title' }, 'Today'),
      h('p', { class: 'page-subtitle view-purpose' }, new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
        n ? ` · ${n} ${n === 1 ? 'move' : 'moves'} for you` : '')),
    h('dl', { class: 't-stats', 'aria-label': 'Pipeline summary' },
      stat('Open roles', s.open), stat('In the Apply band', s.apply), stat('Interviewing', s.interviewing)),
  ];
  for (const g of GROUPS) {
    if (!m[g.key].length) continue;
    const id = `t-g-${g.key}`;
    parts.push(h('section', { class: 't-group', 'aria-labelledby': id, dataset: { group: g.key } },
      h('h2', { class: 't-group-title', id }, g.title, h('span', { class: 't-count' }, ` ${m[g.key].length}`)),
      h('ul', { class: 't-moves' }, m[g.key].map(x => moveCard(x, now)))));
  }
  if (!n) {
    parts.push(h('section', { class: 'card t-card t-none', 'aria-label': 'No moves' },
      h('h2', { class: 't-group-title' }, 'Nothing is scheduled'),
      h('p', { class: 't-hint' }, 'Set a next action or an interview date on a role and it shows up here.'),
      h('a', { class: 'btn btn-primary t-btn', href: href('pipeline') }, 'Open the pipeline')));
  } else {
    parts.push(h('p', { class: 't-more' }, h('a', { class: 't-more-link', href: href('pipeline') }, `See all ${s.total} ${s.total === 1 ? 'role' : 'roles'} in the pipeline`)));
  }
  el.replaceChildren(...parts);
}

export function mount(el, { state } = {}) {
  if (state === 'today-empty' && pipeline.length === 0) { el.replaceChildren(); firstJob(el); return () => {}; }
  moves(el);
  const off = onChange('co_pipeline', () => { if (el.isConnected) moves(el); });
  return () => off();
}

// Phase 3C: Pipeline. Desktop: list + detail side by side. Tablet: list over detail. Phone: the list, or
// (push navigation) the detail alone with a back link. Stage changes go through setStage, next action through
// updateRole. Delete is rendered paused (pipeline.delete) through the shared pauseControl/pausedBanner.
import { h } from '../ui/dom.js';
import { fmtScore, bandPill, scoreStrip, applyLine } from '../ui/score.js';
import { pauseControl, pausedBanner } from '../ui/paused.js';
import { openModal } from '../ui/modal.js';
import { FILTERS, filterRoles, findRole, stageLabel, stageOptions, stageKey, toLocalInput, nextActionPatch, historyRows, nextLine } from '../ui/pipeline/model.js';
import { fmtDay, fmtTime, toMs } from '../ui/today/moves.js';
import { gradeTier } from '../render/grade-chip.js';
import { href } from '../router.js';
import { pipeline, profile, onChange, setStage, updateRole } from '../store.js';

let filter = 'all'; // remembered while the app is open

const str = v => (typeof v === 'string' ? v.trim() : '');
const when = iso => { const ms = toMs(iso); return ms === null ? 'Not recorded' : `${fmtDay(ms)}, ${fmtTime(ms)}`; };

function chip(grade, size) {
  const g = str(grade);
  return h('span', { class: `grade-chip grade-chip--${gradeTier(g)} grade-chip--${size}`, role: 'img', 'aria-label': `Grade ${g || 'not given'}` }, g || '—');
}

function listItem(r, selectedId) {
  const sel = selectedId !== null && String(r.id) === String(selectedId);
  const next = nextLine(r);
  return h('li', { class: 'p-li' },
    h('a', { class: `p-item${sel ? ' is-selected' : ''}`, href: href('pipeline', { id: r.id }), 'aria-current': sel ? 'true' : null, dataset: { fk: `item-${r.id}` } },
      chip(r.grade, 'sm'),
      h('span', { class: 'p-item-main' },
        h('span', { class: 'p-item-title' }, str(r.role) || 'Untitled role'),
        h('span', { class: 'p-item-co' }, str(r.company)),
        h('span', { class: 'p-item-meta' },
          h('span', { class: 'p-item-score' }, fmtScore(r.score)),
          bandPill(r.score),
          h('span', { class: 'p-item-stage' }, stageLabel(r.status))),
        next ? h('span', { class: 'p-item-next' }, `Next: ${next}`) : null)));
}

function listPane(selectedId) {
  const shown = filterRoles(pipeline, filter);
  const select = h('select', { id: 'p-filter', class: 'form-select p-select', dataset: { fk: 'filter' }, onChange: e => { filter = e.target.value; ctx.render(); } },
    FILTERS.map(f => h('option', { value: f.key, selected: f.key === filter }, f.label)));
  let body;
  if (!pipeline.length) {
    body = h('div', { class: 'card p-empty' },
      h('p', { class: 'p-empty-title' }, 'No roles yet'),
      h('p', { class: 'p-hint' }, 'Paste one job description and Kairo scores it against your CV.'),
      h('a', { class: 'btn btn-primary p-btn', href: href('add') }, 'Add a role'));
  } else if (!shown.length) {
    body = h('p', { class: 'p-hint p-none' }, 'No roles in this stage.');
  } else {
    body = h('ul', { class: 'p-list' }, shown.map(r => listItem(r, selectedId)));
  }
  return h('section', { class: 'p-list-pane', 'aria-labelledby': 'p-title' },
    h('div', { class: 'page-header' },
      h('h1', { class: 'page-title', id: 'p-title' }, 'Pipeline'),
      h('p', { class: 'page-subtitle view-purpose' }, `${pipeline.length} ${pipeline.length === 1 ? 'role' : 'roles'} tracked. Pick one to change its stage or next step.`)),
    pipeline.length ? h('div', { class: 'p-filter' }, h('label', { class: 'form-label', for: 'p-filter' }, 'Show'), select) : null,
    body);
}

function historyModal(r) {
  const rows = historyRows(r);
  const body = rows.length
    ? h('ol', { class: 'p-history' }, rows.map(x => h('li', {}, h('strong', {}, x.label), x.at ? ` · ${when(x.at)}` : '')))
    : h('p', {}, 'No stage changes are recorded for this role yet.');
  openModal({ title: 'Stage history', body, actions: [{ label: 'Close', primary: true }] });
}

function fact(label, value) {
  return h('div', { class: 'p-fact' }, h('dt', {}, label), h('dd', {}, value));
}

function detailPane(selectedId) {
  if (selectedId === null) {
    return h('section', { class: 'p-detail-pane', 'aria-label': 'Role detail' },
      h('div', { class: 'card p-placeholder' }, h('p', { class: 'p-hint' }, pipeline.length ? 'Pick a role to see its score, stage and next step.' : 'Roles you add show up here.')));
  }
  const r = findRole(pipeline, selectedId);
  if (!r) {
    return h('section', { class: 'p-detail-pane', 'aria-label': 'Role detail' },
      h('div', { class: 'card p-placeholder' },
        h('h2', { class: 'p-d-title' }, 'Role not found'),
        h('p', { class: 'p-hint' }, 'It may have been removed, or the link is old.'),
        h('a', { class: 'btn btn-primary p-btn', href: href('pipeline') }, 'Back to the pipeline')));
  }
  const status = h('p', { class: 'p-status', role: 'status', 'aria-live': 'polite' }, ctx.msg || '');
  const scoring = r.fullData && typeof r.fullData === 'object' ? r.fullData.scoring : null;
  const hasStrip = scoring && typeof scoring === 'object' && Object.values(scoring).some(v => typeof v === 'number');

  const stageSel = h('select', { id: 'p-stage', class: 'form-select p-select', dataset: { fk: 'stage' }, onChange: e => {
    const next = e.target.value;
    if (next === stageKey(r.status)) return;
    try { setStage(r.id, next); ctx.msg = `Stage set to ${stageLabel(next)}.`; } catch { ctx.msg = 'Could not save: the browser storage is full or blocked. Nothing was changed.'; }
    ctx.render();
  } }, stageOptions(r.status).map(o => h('option', { value: o.key, selected: o.key === stageKey(r.status) }, o.label)));

  const actionIn = h('input', { id: 'p-next', class: 'form-input p-input', type: 'text', maxlength: '200', value: str(r.nextAction), dataset: { fk: 'next' } });
  const nextAtIn = h('input', { id: 'p-next-at', class: 'form-input p-input', type: 'datetime-local', value: toLocalInput(r.nextActionAt) });
  const interviewIn = h('input', { id: 'p-interview', class: 'form-input p-input', type: 'datetime-local', value: toLocalInput(r.interviewAt) });
  const form = h('form', { class: 'p-form', onSubmit: e => {
    e.preventDefault();
    try { updateRole(r.id, nextActionPatch({ text: actionIn.value, nextAt: nextAtIn.value, interviewAt: interviewIn.value })); ctx.msg = 'Saved.'; } catch { ctx.msg = 'Could not save: the browser storage is full or blocked. Nothing was changed.'; }
    ctx.render();
  } },
  h('h3', { class: 'p-sub' }, 'Next step'),
  h('div', { class: 'p-field' }, h('label', { class: 'form-label', for: 'p-next' }, 'What to do next'), actionIn),
  h('div', { class: 'p-two' },
    h('div', { class: 'p-field' }, h('label', { class: 'form-label', for: 'p-next-at' }, 'Due'), nextAtIn),
    h('div', { class: 'p-field' }, h('label', { class: 'form-label', for: 'p-interview' }, 'Interview'), interviewIn)),
  h('button', { type: 'submit', class: 'btn btn-outline p-btn', dataset: { action: 'save-next' } }, 'Save next step'));

  const del = h('button', { type: 'button', class: 'btn btn-outline p-btn p-delete', dataset: { action: 'delete-role' } }, 'Delete role');
  pauseControl(del, 'pipeline.delete');

  return h('section', { class: 'p-detail-pane', 'aria-label': 'Role detail' },
    h('div', { class: 'card p-detail' },
      h('h1', { class: 'p-sr-title' }, `Pipeline: ${str(r.role) || 'Untitled role'}`),
      h('a', { class: 'p-back', href: href('pipeline') }, '← All roles'),
      h('div', { class: 'p-d-head' },
        chip(r.grade, 'lg'),
        h('div', {},
          h('h2', { class: 'p-d-title' }, str(r.role) || 'Untitled role'),
          h('p', { class: 'p-d-co' }, [str(r.company), str(r.location)].filter(Boolean).join(' · ')))),
      h('div', { class: 'p-d-score' },
        h('span', { class: 'p-d-num' }, fmtScore(r.score)), h('span', { class: 'p-d-of' }, ' / 5'), bandPill(r.score)),
      hasStrip ? scoreStrip(scoring, { applyLine: applyLine(profile) }) : h('p', { class: 'p-hint' }, 'No dimension scores are saved for this role.'),
      r.jdComplete === false ? h('p', { class: 'p-note' }, 'Only part of the job description is saved. ', h('a', { href: href('role', { id: r.id }) }, 'Paste the full text in the workspace.')) : null,
      h('div', { class: 'p-field' }, h('label', { class: 'form-label', for: 'p-stage' }, 'Stage'), stageSel,
        h('button', { type: 'button', class: 'btn btn-ghost p-btn', onClick: () => historyModal(r) }, 'Stage history')),
      status,
      h('dl', { class: 'p-facts' }, fact('Evaluated', when(r.date)), fact('Applied', when(r.appliedAt)), fact('Interview', when(r.interviewAt))),
      form,
      h('div', { class: 'p-actions' },
        h('a', { class: 'btn btn-primary p-btn', href: href('role', { id: r.id }) }, 'Open workspace'),
        del),
      pausedBanner('pipeline.delete')));
}

const ctx = { msg: '', render: () => {} };

export function mount(el, { params } = {}) {
  const selectedId = params && params.id !== undefined ? params.id : null;
  ctx.msg = '';
  const root = h('div', { class: 'p-wrap', dataset: { detail: selectedId === null ? 'false' : 'true' } });
  el.replaceChildren(root);
  ctx.render = () => {
    if (!root.isConnected) return;
    const key = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.fk : null;
    root.replaceChildren(listPane(selectedId), detailPane(selectedId));
    if (key) { const t = [...root.querySelectorAll('[data-fk]')].find(n => n.dataset.fk === key); if (t) t.focus(); }
  };
  ctx.render();
  const off = onChange('co_pipeline', ctx.render);
  return () => { off(); ctx.render = () => {}; };
}

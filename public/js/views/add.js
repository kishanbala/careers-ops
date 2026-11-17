// Phase 3D: Add role. #/add (one JD) · #/add/several (BATCH-01..03) · #/add/scan (designed in full, paused).
// One JD -> runTool('evaluate') -> addRole -> role workspace. "Check without saving" (EVAL-02) shows the fit first.
// Model calls go through runTool only; roles are saved through addRole only (never a blank entry). No innerHTML.
import { h } from '../ui/dom.js';
import { runTool, toolMessage } from '../api.js';
import { addRole } from '../store.js';
import { go, href } from '../router.js';
import { renderFit } from '../ui/fit.js';
import { fmtScore, bandPill } from '../ui/score.js';
import { showRunning, showToolError } from '../ui/tool-state.js';
import { pauseControl, pausedBanner } from '../ui/paused.js';
import { MAX_BATCH, STOP_KINDS, SAVE_FAILED, planBatch, snippet, batchSummary, takeHandoff } from '../ui/add/batch.js';

let uid = 0;
const text = v => (typeof v === 'string' ? v.trim() : '');

const MODES = [
  { mode: undefined, label: 'One job', key: 'one' },
  { mode: 'several', label: 'Several jobs', key: 'several' },
  { mode: 'scan', label: 'Find jobs', key: 'scan' },
];

function header(mode) {
  const intro = {
    one: 'Paste one job description. Kairo scores it against your CV and goals.',
    several: 'Paste several job descriptions, one after another, with a line of --- between them.',
    scan: 'Look for roles that match your goals.',
  }[mode];
  return [
    h('div', { class: 'page-header' },
      h('h1', { class: 'page-title' }, 'Add a role'),
      h('p', { class: 'page-subtitle' }, intro)),
    h('nav', { class: 'ad-modes', 'aria-label': 'How to add roles' },
      MODES.map(m => h('a', {
        class: 'ad-mode', href: href('add', { mode: m.mode }),
        'aria-current': m.key === mode ? 'page' : null,
      }, m.label))),
  ];
}

function jdField(id, { rows = 12, hint } = {}) {
  const ta = h('textarea', { class: 'form-textarea ad-jd', id, rows, name: 'jd' });
  if (hint) ta.setAttribute('aria-describedby', `${id}-hint`);
  return { ta, wrap: [h('label', { class: 'form-label', for: id }, hint ? 'Job descriptions' : 'Job description'), ta, hint ? h('p', { class: 'ad-hint', id: `${id}-hint` }, hint) : null] };
}

const errorBox = (msg) => h('div', { class: 'k-tool-error', role: 'alert' }, h('p', { class: 'k-tool-error-text' }, msg));

// ===== one job =====
function mountOne(el, ctx) {
  const id = `ad-jd-${++uid}`;
  const { ta, wrap } = jdField(id, { rows: 14 });
  ta.value = takeHandoff(typeof location !== 'undefined' ? location.hash : '', typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const status = h('div', { class: 'ad-status', 'aria-live': 'polite' });
  const result = h('div', { class: 'ad-result' });
  const trackBtn = (jd, data) => h('button', { type: 'button', class: 'btn btn-primary ad-track', dataset: { action: 'track-role' }, onClick: e => {
    e.currentTarget.disabled = true;
    let role = null;
    try { role = addRole(data, jd); } catch { role = null; }
    if (!role) { e.currentTarget.disabled = false; status.replaceChildren(errorBox(SAVE_FAILED)); return; }
    if (ctx.alive) go('role', { id: role.id });
  } }, 'Track this role');

  let busy = false;
  const buttons = [];
  const setBusy = b => { busy = b; for (const x of buttons) x.disabled = b; };

  async function run(save) {
    if (busy) return;
    const jd = ta.value;
    result.replaceChildren();
    if (!text(jd)) { showToolError(status, { ok: false, kind: 'empty-input' }); ta.focus(); return; }
    setBusy(true);
    const stop = showRunning(status, 'Evaluating the job…');
    const r = await runTool('evaluate', { content: jd });
    stop();
    if (!r.ok) {
      setBusy(false);
      if (ctx.alive && el.isConnected) showToolError(status, r, { retry: () => run(save) });
      return;
    }
    if (save) {
      // A finished call still saves, even if the person has left this screen.
      let role = null;
      try { role = addRole(r.data, jd); } catch { role = null; }
      setBusy(false);
      if (!role) { if (ctx.alive && el.isConnected) status.replaceChildren(errorBox(SAVE_FAILED)); return; }
      if (ctx.alive && el.isConnected) go('role', { id: role.id });
      return;
    }
    setBusy(false);
    if (!ctx.alive || !el.isConnected) return;
    status.replaceChildren();
    const fit = h('div', { class: 'ad-fit' });
    renderFit(fit, r.data);
    result.replaceChildren(h('section', { class: 'card ad-card', 'aria-labelledby': `${id}-res` },
      h('h2', { class: 'card-title', id: `${id}-res` }, 'Result (not saved)'),
      fit,
      h('div', { class: 'ad-actions' }, trackBtn(jd, r.data),
        h('span', { class: 'ad-hint' }, 'Nothing is saved until you track the role.'))));
  }

  const evalBtn = h('button', { type: 'button', class: 'btn btn-primary ad-run', dataset: { action: 'evaluate-track' }, onClick: () => run(true) }, 'Evaluate and track');
  const checkBtn = h('button', { type: 'button', class: 'btn btn-outline ad-run', dataset: { action: 'check-only' }, onClick: () => run(false) }, 'Check without saving');
  buttons.push(evalBtn, checkBtn);
  el.append(
    h('section', { class: 'card ad-card', 'aria-label': 'One job' },
      h('div', { class: 'ad-field' }, wrap),
      h('div', { class: 'ad-actions' }, evalBtn, checkBtn),
      h('p', { class: 'ad-hint' }, 'Evaluate and track saves the role and opens its workspace. Check without saving only shows the score.'),
      status),
    result);
  if (ta.value) ta.focus();
}

// ===== several =====
function mountSeveral(el, ctx) {
  const id = `ad-jds-${++uid}`;
  const { ta, wrap } = jdField(id, { rows: 14, hint: `Up to ${MAX_BATCH} jobs per run.` });
  const countEl = h('p', { class: 'ad-count', id: `${id}-count` });
  const status = h('div', { class: 'ad-status', 'aria-live': 'polite' });
  const summary = h('p', { class: 'ad-summary', role: 'status' });
  const list = h('ol', { class: 'ad-rows', 'aria-label': 'Evaluations' });
  ta.setAttribute('aria-describedby', `${id}-hint ${countEl.id}`);
  const showCount = () => {
    const p = planBatch(ta.value);
    countEl.textContent = p.total === 0 ? 'No jobs found yet.'
      : `${p.total} ${p.total === 1 ? 'job' : 'jobs'} found.${p.skipped ? ` Only the first ${MAX_BATCH} run each time; the last ${p.skipped} will be left out. Run them in a second batch.` : ''}`;
  };
  showCount();
  ta.addEventListener('input', showCount);

  let busy = false;
  let rows = [];
  const runBtn = h('button', { type: 'button', class: 'btn btn-primary ad-run', dataset: { action: 'evaluate-several' } }, 'Evaluate all');

  const STATUS_TEXT = { waiting: 'Waiting', running: 'Evaluating…', done: 'Done', failed: 'Failed', skipped: 'Not run' };

  function renderRow(row) {
    const d = row.data;
    const title = d ? [text(d.roleTitle), text(d.company)].filter(Boolean).join(' · ') : snippet(row.jd);
    const body = [
      h('div', { class: 'ad-row-main' },
        h('p', { class: 'ad-row-title' }, title || `Job ${row.n}`),
        h('p', { class: `ad-row-status ad-row-status--${row.status}` }, STATUS_TEXT[row.status], row.message ? ` · ${row.message}` : '')),
    ];
    if (d) {
      body.push(h('div', { class: 'ad-row-score' },
        h('span', { class: 'ad-row-num' }, fmtScore(d.finalScore)), bandPill(d.finalScore),
        typeof d.matchPercent === 'number' ? h('span', { class: 'ad-row-match' }, `Match ${d.matchPercent}%`) : null));
      const fit = h('div', { class: 'ad-fit' });
      let drawn = false;
      const det = h('details', { class: 'ad-row-more' }, h('summary', {}, 'See the fit'), fit);
      det.addEventListener('toggle', () => { if (det.open && !drawn) { drawn = true; renderFit(fit, d); } });
      body.push(det);
      body.push(row.tracked
        ? h('p', { class: 'ad-row-tracked' }, 'Tracked. ', h('a', { href: href('role', { id: row.tracked }) }, 'Open the role'))
        : h('button', { type: 'button', class: 'btn btn-outline ad-track', 'aria-label': `Track ${text(d.roleTitle) || 'this role'}`, dataset: { action: 'track-row' }, onClick: () => track(row) }, 'Track this role'));
    }
    if (row.status === 'failed' && !busy) {
      body.push(h('button', { type: 'button', class: 'btn btn-outline ad-retry', dataset: { action: 'retry-row' }, 'aria-label': `Try job ${row.n} again`, onClick: () => retry(row) }, 'Try again'));
    }
    return h('li', { class: `ad-row ad-row--${row.status}`, dataset: { status: row.status } }, body);
  }
  const draw = () => {
    if (!ctx.alive || !el.isConnected) return;
    list.replaceChildren(...rows.map(renderRow));
    summary.textContent = rows.length ? batchSummary(rows) : '';
  };

  function track(row) {
    let role = null;
    try { role = addRole(row.data, row.jd); } catch { role = null; }
    if (!role) { status.replaceChildren(errorBox(SAVE_FAILED)); return; }
    row.tracked = role.id;
    draw();
  }

  async function evalRow(row) {
    row.status = 'running'; row.message = ''; draw();
    const r = await runTool('evaluate', { content: row.jd });
    if (r.ok) { row.status = 'done'; row.data = r.data; row.message = ''; }
    else { row.status = 'failed'; row.message = toolMessage(r); row.kind = r.kind; }
    draw();
    return r;
  }

  async function retry(row) {
    if (busy) return;
    busy = true; runBtn.disabled = true;
    const r = await evalRow(row);
    busy = false; runBtn.disabled = false;
    if (!r.ok && ctx.alive && el.isConnected) showToolError(status, r);
    draw();
  }

  runBtn.addEventListener('click', async () => {
    if (busy) return;
    const plan = planBatch(ta.value);
    status.replaceChildren();
    if (plan.items.length === 0) { showToolError(status, { ok: false, kind: 'empty-input' }); ta.focus(); return; }
    busy = true; runBtn.disabled = true;
    rows = plan.items.map((jd, i) => ({ n: i + 1, jd, status: 'waiting', message: '', data: null, tracked: null }));
    draw();
    for (let i = 0; i < rows.length; i++) {
      if (!ctx.alive) break; // left the screen: stop spending calls
      const r = await evalRow(rows[i]);
      if (!r.ok && STOP_KINDS.includes(r.kind)) {
        for (const rest of rows.slice(i + 1)) { rest.status = 'skipped'; rest.message = 'stopped after the error above'; }
        if (ctx.alive && el.isConnected) showToolError(status, r);
        break;
      }
    }
    busy = false; runBtn.disabled = false;
    draw();
    if (ctx.alive && el.isConnected && rows.some(r => r.status === 'done')) runBtn.textContent = 'Evaluate all again';
  });

  el.append(
    h('section', { class: 'card ad-card', 'aria-label': 'Several jobs' },
      h('div', { class: 'ad-field' }, wrap, countEl),
      h('div', { class: 'ad-actions' }, runBtn),
      status),
    h('section', { class: 'ad-results', 'aria-label': 'Results' }, summary, list));
}

// ===== scan (designed in full; paused) =====
// Both actions go through pauseControl()/pausedBanner(): aria-disabled, no handler, no request.
const PORTALS = [
  { name: 'Anthropic', meta: 'Greenhouse · AI safety' },
  { name: 'OpenAI', meta: 'Careers page · Research' },
  { name: 'ElevenLabs', meta: 'Ashby · Voice AI' },
  { name: 'Mistral AI', meta: 'Lever · Research' },
  { name: 'Retool', meta: 'Greenhouse · Platform' },
  { name: 'Vercel', meta: 'Greenhouse · Engineering' },
];

function mountScan(el) {
  const id = `ad-focus-${++uid}`;
  const focus = h('input', { class: 'form-input', type: 'text', id, name: 'focus', autocomplete: 'off', placeholder: 'For example: analytics engineer, remote in Europe' });
  const run = h('button', { type: 'button', class: 'btn btn-primary ad-run', dataset: { action: 'scan-run' } }, 'Find jobs');
  const runActions = h('div', { class: 'ad-actions' }, run);
  const runBox = h('div', { class: 'ad-scan-run' },
    h('div', { class: 'ad-field' }, h('label', { class: 'form-label', for: id }, 'What are you looking for?'), focus),
    runActions);
  pauseControl(runActions, 'scan.run'); // the text box stays editable; only the action is paused

  const addPortal = h('button', { type: 'button', class: 'btn btn-outline ad-run', dataset: { action: 'add-portal' } }, 'Add a portal');
  const portalActions = h('div', { class: 'ad-actions' }, addPortal);
  const portalBox = h('div', { class: 'ad-portals' },
    h('ul', { class: 'ad-portal-list' }, PORTALS.map(p => h('li', { class: 'ad-portal' },
      h('span', { class: 'ad-portal-name' }, p.name), h('span', { class: 'ad-portal-meta' }, p.meta)))),
    portalActions);
  pauseControl(portalActions, 'scan.portals');

  el.append(
    h('section', { class: 'card ad-card', 'aria-labelledby': `${id}-h1` },
      h('h2', { class: 'card-title', id: `${id}-h1` }, 'Search'),
      runBox, pausedBanner('scan.run')),
    h('section', { class: 'card ad-card', 'aria-labelledby': `${id}-h2` },
      h('h2', { class: 'card-title', id: `${id}-h2` }, 'Portals to search'),
      portalBox, pausedBanner('scan.portals')),
    h('section', { class: 'card ad-card', 'aria-labelledby': `${id}-h3` },
      h('h2', { class: 'card-title', id: `${id}-h3` }, 'Found roles'),
      h('p', { class: 'ad-hint' }, 'Matches will appear here, each with a link to the real posting and a Track button.')));
}

export function mount(el, { params } = {}) {
  const mode = params && params.mode === 'several' ? 'several' : params && params.mode === 'scan' ? 'scan' : 'one';
  const ctx = { alive: true };
  el.replaceChildren(...header(mode));
  if (mode === 'several') mountSeveral(el, ctx);
  else if (mode === 'scan') mountScan(el);
  else mountOne(el, ctx);
  return function unmount() { ctx.alive = false; };
}

// Phase 3D: Profile & CV (#/profile). PROF-01 fields, PROF-02 PDF upload, PROF-03 CV text, PROF-04 save, PROF-05 persistence.
// Plus the apply line (minscore), Light | Dark, and the storage meter (build-plan §3a, warn at 80%).
// No model call here. All text goes in through h() (no innerHTML).
import { h } from '../ui/dom.js';
import { profile, saveProfile, storageUsage, onChange } from '../store.js';
import { extractPdfText } from '../pdf.js';
import { mountThemeSegmented } from '../theme.js';
import { href } from '../router.js';
import { showToast } from '../render/toast.js';
import { applyLine, fmtScore } from '../ui/score.js';
import { TEXT_FIELDS, buildPatch, cvCount, pdfProblem, describeUsage } from '../ui/profile/form.js';

const str = v => (typeof v === 'string' ? v : '');
let uid = 0;

function field({ label, hint, control, id, error }) {
  const hintId = hint ? `${id}-hint` : null;
  control.id = id;
  const described = [hintId, error ? error.id : null].filter(Boolean).join(' ');
  if (described) control.setAttribute('aria-describedby', described);
  return h('div', { class: 'pf-field' },
    h('label', { class: 'form-label', for: id }, label),
    control,
    hint ? h('p', { class: 'pf-hint', id: hintId }, hint) : null,
    error);
}

export function mount(el) {
  const n = ++uid;
  const id = k => `pf-${k}-${n}`;
  const cur = profile && typeof profile === 'object' ? profile : {};
  const cleanups = [];
  let alive = true;

  // ---- fields ----
  const inputs = {};
  const fieldEls = TEXT_FIELDS.map(f => {
    const input = h('input', { class: 'form-input', type: 'text', name: f.key, autocomplete: f.autocomplete || 'off' });
    input.value = str(cur[f.key]);
    inputs[f.key] = input;
    return field({ label: f.label, hint: f.hint, control: input, id: id(f.key) });
  });

  const minErr = h('p', { class: 'pf-error', id: `${id('minscore')}-err`, role: 'alert', hidden: true });
  const minInput = h('input', { class: 'form-input pf-narrow', type: 'text', inputmode: 'decimal', name: 'minscore', autocomplete: 'off' });
  minInput.value = str(cur.minscore);
  inputs.minscore = minInput;
  const lineNow = h('span', { class: 'pf-line-now' });
  const showLine = () => { lineNow.textContent = `Current apply line: ${fmtScore(applyLine({ minscore: minInput.value }))}`; };
  showLine();
  minInput.addEventListener('input', showLine);
  const minField = field({
    label: 'Apply line (minimum score)', control: minInput, id: id('minscore'), error: minErr,
    hint: 'Marked on score strips and lists, from 1.0 to 5.0. Empty means 4.0. The bands stay fixed: Apply 4.0 and up, Worth a look 3.0 to 3.9, Skip below 3.0.',
  });

  const story = h('textarea', { class: 'form-textarea pf-story', name: 'story', rows: 4 });
  story.value = str(cur.story);
  inputs.story = story;
  const storyField = field({ label: 'Your story in a few lines', control: story, id: id('story'), hint: 'What you do, what you want next, and what matters to you in a job. Kairo uses it to judge fit.' });

  // ---- CV ----
  const cv = h('textarea', { class: 'form-textarea pf-cv', name: 'cv', rows: 14 });
  cv.value = str(cur.cv);
  inputs.cv = cv;
  const count = h('p', { class: 'pf-count', id: `${id('cv')}-count` });
  const showCount = () => {
    const c = cvCount(cv.value);
    count.textContent = c.label;
    count.classList.toggle('pf-count--over', c.over);
  };
  showCount();
  cv.addEventListener('input', showCount);
  const cvField = h('div', { class: 'pf-field' },
    h('label', { class: 'form-label', for: id('cv') }, 'CV text'),
    cv, count);
  cv.id = id('cv');
  cv.setAttribute('aria-describedby', count.id);

  const pdfStatus = h('p', { class: 'pf-status', role: 'status' });
  const fileInput = h('input', { class: 'pf-file', type: 'file', accept: 'application/pdf,.pdf', tabindex: '-1', 'aria-hidden': 'true', hidden: true });
  const pickBtn = h('button', { type: 'button', class: 'btn btn-outline pf-pick', dataset: { action: 'upload-cv' } }, 'Upload a PDF');
  pickBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    const problem = pdfProblem(file);
    if (problem) { pdfStatus.textContent = problem; pdfStatus.classList.add('pf-status--error'); return; }
    pdfStatus.classList.remove('pf-status--error');
    pdfStatus.textContent = 'Reading the PDF in your browser…';
    pickBtn.disabled = true;
    try {
      const text = await extractPdfText(file);
      if (!alive) return;
      if (!text.trim()) throw new Error('empty');
      cv.value = text;
      showCount();
      pdfStatus.textContent = 'CV text read from the PDF. Check it, then save. The file itself never leaves your browser.';
    } catch {
      if (!alive) return;
      pdfStatus.classList.add('pf-status--error');
      pdfStatus.textContent = 'Could not read text from this PDF (a scanned image has none). Paste your CV text below instead.';
    }
    pickBtn.disabled = false;
  });

  // ---- save ----
  const saveStatus = h('p', { class: 'pf-status pf-save-status', role: 'status' });
  const saveBtn = h('button', { type: 'submit', class: 'btn btn-primary pf-save', dataset: { action: 'save-profile' } }, 'Save profile');
  const clearErrors = () => { minErr.hidden = true; minErr.textContent = ''; minInput.removeAttribute('aria-invalid'); };
  const onSubmit = e => {
    e.preventDefault();
    clearErrors();
    saveStatus.textContent = '';
    saveStatus.classList.remove('pf-status--error');
    const values = Object.fromEntries(Object.entries(inputs).map(([k, c]) => [k, c.value]));
    const r = buildPatch(values);
    if (!r.ok) {
      minErr.textContent = r.errors.minscore;
      minErr.hidden = false;
      minInput.setAttribute('aria-invalid', 'true');
      minInput.focus();
      return;
    }
    try {
      saveProfile(r.patch);
    } catch {
      saveStatus.classList.add('pf-status--error');
      saveStatus.textContent = 'Browser storage is full, so nothing was saved. Export a backup from Home and free some space.';
      return;
    }
    saveStatus.replaceChildren('Profile saved. ', h('a', { class: 'pf-next', href: href('add') }, 'Add your first role'));
    showToast('Profile saved ✓');
    renderMeter();
  };
  const form = h('form', { class: 'pf-form', novalidate: true, onSubmit },
    h('div', { class: 'pf-cols' },
      h('section', { class: 'card pf-card', 'aria-labelledby': id('h-about') },
        h('h2', { class: 'card-title', id: id('h-about') }, 'About you'),
        fieldEls, storyField),
      h('section', { class: 'card pf-card', 'aria-labelledby': id('h-cv') },
        h('h2', { class: 'card-title', id: id('h-cv') }, 'Your CV'),
        h('p', { class: 'pf-hint' }, 'Every evaluation compares a job with this text. Upload a PDF or paste it. Nothing is invented: Kairo only reads what you give it.'),
        h('div', { class: 'pf-upload' }, pickBtn, fileInput),
        pdfStatus,
        cvField),
      h('section', { class: 'card pf-card', 'aria-labelledby': id('h-goals') },
        h('h2', { class: 'card-title', id: id('h-goals') }, 'Goals and apply line'),
        minField)),
    h('div', { class: 'pf-actions' }, saveBtn, saveStatus));

  // ---- appearance + storage (not part of the save: both apply at once) ----
  const themeHost = h('div', { class: 'pf-theme' });
  cleanups.push(mountThemeSegmented(themeHost));
  const meterHost = h('div', { class: 'pf-meter-host' });
  const renderMeter = () => {
    if (!alive) return;
    const u = describeUsage(storageUsage());
    meterHost.replaceChildren(
      h('div', { class: `pf-meter${u.warn ? ' pf-meter--warn' : ''}`, role: 'meter', 'aria-label': 'Browser storage used', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(u.pct), 'aria-valuetext': u.text },
        h('span', { class: 'pf-meter-fill', style: { width: `${u.pct}%` } })),
      h('p', { class: 'pf-meter-text' }, u.text),
      h('p', { class: 'pf-hint' }, u.parts.join(' · ')),
      ...(u.warn ? [h('p', { class: 'pf-warn', role: 'alert' }, u.warnText)] : []));
  };
  renderMeter();
  for (const k of ['co_pipeline', 'co_stories', 'co_profile']) cleanups.push(onChange(k, renderMeter));

  el.replaceChildren(
    h('div', { class: 'page-header' },
      h('h1', { class: 'page-title' }, 'Profile & CV'),
      h('p', { class: 'page-subtitle' }, 'Your CV and goals stay in this browser. Kairo reads them each time you run a tool.')),
    form,
    h('section', { class: 'card pf-card pf-card--wide', 'aria-labelledby': id('h-app') },
      h('h2', { class: 'card-title', id: id('h-app') }, 'Appearance and storage'),
      h('div', { class: 'pf-split' },
        h('div', {}, h('p', { class: 'pf-label' }, 'Theme'), themeHost),
        h('div', {}, h('p', { class: 'pf-label' }, 'Browser storage'), meterHost))));

  return function unmount() {
    alive = false;
    for (const c of cleanups) { try { if (typeof c === 'function') c(); } catch { /* already gone */ } }
  };
}

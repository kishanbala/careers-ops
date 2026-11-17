// Home (Phase 3A, issue #28): hero, example, 4-step demo, checklist, workspace tools, grade scale,
// privacy line, backup export / restore, attribution footer. Text only: every string goes in through h().
// No model call anywhere on this screen: the example is a static file and the demo is local.
import { h } from '../ui/dom.js';
import { href } from '../router.js';
import { exportAll, importAll } from '../store.js';
import { renderFit } from '../ui/fit.js';
import { openModal } from '../ui/modal.js';
import { gradeTier } from '../render/grade-chip.js';
import { siteFooter } from '../ui/site-footer.js';
import { HERO, PRIVACY_LINE, CHECKLIST, TOOLS, BANDS, GRADES } from '../ui/home/content.js';
import { mountDemo } from '../ui/home/demo.js';
import { backupFilename, parseBackupText, describeCounts, MAX_BACKUP_BYTES } from '../ui/home/backup.js';

const EXAMPLE_URL = '/data/example-evaluation.json';
let exampleCache = null;

async function loadExample() {
  if (exampleCache) return exampleCache;
  const res = await fetch(EXAMPLE_URL, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  exampleCache = await res.json();
  return exampleCache;
}

const heading = (id, text) => h('h2', { class: 'home-h2', id }, text);
const section = (id, title, ...kids) => h('section', { class: 'home-section', 'aria-labelledby': `${id}-h`, dataset: { section: id } }, heading(`${id}-h`, title), ...kids);

function downloadBackup() {
  const json = JSON.stringify(exportAll(), null, 2);
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = h('a', { href: url, download: backupFilename(new Date()), hidden: true });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function mount(el) {
  let alive = true;
  let demo = null;

  // ----- hero + example -----
  const exampleBtn = h('button', {
    type: 'button', class: 'btn btn-outline home-cta', dataset: { action: 'see-example' },
    'aria-expanded': 'false', 'aria-controls': 'home-example', onClick: toggleExample,
  }, 'See an example first');
  const exampleBox = h('div', { class: 'home-example', id: 'home-example', hidden: true });

  async function toggleExample() {
    const open = exampleBtn.getAttribute('aria-expanded') === 'true';
    if (open) {
      exampleBtn.setAttribute('aria-expanded', 'false');
      exampleBox.hidden = true;
      return;
    }
    exampleBtn.setAttribute('aria-expanded', 'true');
    exampleBox.hidden = false;
    if (exampleBox.dataset.ready === '1') return;
    exampleBox.replaceChildren(h('p', { class: 'home-example-note', role: 'status' }, 'Loading the example…'));
    try {
      const data = await loadExample();
      if (!alive || !exampleBox.isConnected) return;
      const fit = h('div', { class: 'home-example-fit' });
      renderFit(fit, data);
      exampleBox.replaceChildren(
        h('p', { class: 'home-example-note' }, 'An example with a made-up job. It uses no CV and no AI call; it only shows what you get back.'),
        fit,
        h('p', { class: 'home-example-cta' },
          h('a', { class: 'btn btn-primary', href: href('profile') }, 'Start with your CV')));
      exampleBox.dataset.ready = '1';
    } catch {
      if (!alive || !exampleBox.isConnected) return;
      exampleBox.replaceChildren(h('p', { class: 'home-example-note', role: 'alert' }, 'The example could not be loaded. Check your connection and try again.'));
    }
  }

  const hero = h('header', { class: 'home-hero' },
    h('h1', { class: 'home-title' }, HERO.title),
    h('p', { class: 'home-lead' }, HERO.text),
    h('div', { class: 'home-actions' },
      h('a', { class: 'btn btn-primary home-cta', href: href('profile'), dataset: { action: 'start-cv' } }, 'Start with your CV'),
      exampleBtn),
    exampleBox);

  // ----- demo -----
  const demoEl = h('div', { class: 'home-demo' });
  const demoSection = section('home-demo', 'How it works', demoEl);

  // ----- checklist -----
  const checklist = section('home-checklist', 'Three steps to your first verdict',
    h('ol', { class: 'home-checklist' }, CHECKLIST.map((c, i) => h('li', { class: 'home-check', dataset: { check: c.id } },
      h('span', { class: 'home-check-n', 'aria-hidden': 'true' }, String(i + 1)),
      h('a', { class: 'home-check-link', href: href(c.route) }, c.title),
      h('span', { class: 'home-check-meta' }, c.note ? `${c.time} · ${c.note}` : c.time)))));

  // ----- workspace tools -----
  const tools = section('home-tools', 'Every role gets a workspace',
    h('p', { class: 'home-sub' }, 'Each tool opens already filled with that role’s job description and your CV. You never paste the job twice.'),
    h('ul', { class: 'home-tools' }, TOOLS.map(t => h('li', { class: 'home-tool', dataset: { tool: t.id } },
      h('h3', { class: 'home-tool-t' }, t.title), h('p', { class: 'home-tool-x' }, t.text)))));

  // ----- grade scale -----
  const scale = section('home-scale', 'How to read a score',
    h('ul', { class: 'home-bands' }, BANDS.map(b => h('li', { class: `home-band home-band--${b.id}`, dataset: { band: b.id } },
      h('span', { class: 'home-band-label' }, b.label),
      h('span', { class: 'home-band-range' }, b.range),
      h('span', { class: 'home-band-text' }, b.text)))),
    h('h3', { class: 'home-h3' }, 'Letter grades'),
    h('ul', { class: 'home-grades', 'aria-label': 'Letter grades and their scores' }, GRADES.map(g => h('li', { class: 'home-grade', dataset: { grade: g.grade } },
      h('span', { class: `grade-chip grade-chip--${gradeTier(g.grade)} grade-chip--lg`, 'aria-label': `Grade ${g.grade}` }, g.grade),
      h('span', { class: 'home-grade-range' }, g.range)))));

  // ----- privacy -----
  const privacy = h('section', { class: 'home-section home-privacy', 'aria-labelledby': 'home-privacy-h', dataset: { section: 'home-privacy' } },
    heading('home-privacy-h', 'Your data'),
    h('p', { class: 'home-privacy-line' }, PRIVACY_LINE, ' ', h('a', { href: '/privacy.html' }, 'How we handle your data'), '.'));

  // ----- backup -----
  const status = h('p', { class: 'home-status', role: 'status', 'aria-live': 'polite' });
  const say = (text, kind) => { status.textContent = text; status.dataset.kind = kind || ''; };
  const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, tabindex: '-1', 'aria-hidden': 'true', dataset: { role: 'restore-input' } });
  file.addEventListener('change', onFile);

  async function onFile() {
    const f = file.files && file.files[0];
    if (!f) return;
    say('', '');
    let text = '';
    try { text = f.size > MAX_BACKUP_BYTES ? '' : await f.text(); } catch { text = ''; }
    file.value = '';
    if (!alive) return;
    const parsed = parseBackupText(text, f.size);
    if (!parsed.ok) { say(parsed.error, 'error'); return; }
    const check = importAll(parsed.obj, { dryRun: true });
    if (!check.ok) { say(`This is not a usable Kairo backup. ${check.errors.join(' ')}`, 'error'); return; }
    const saveFirst = h('input', { type: 'checkbox', checked: true, id: 'home-save-first', dataset: { role: 'save-first' }, style: { width: '24px', height: '24px', 'flex': 'none' } });
    saveFirst.checked = true;
    openModal({
      title: 'Restore this backup?',
      body: h('div', null,
        h('p', null, `The backup holds ${describeCounts(check.counts)}.`),
        h('p', null, 'Restoring replaces what is saved in this browser now.'),
        h('label', { for: 'home-save-first', style: { display: 'flex', gap: '12px', 'align-items': 'center', 'min-height': 'var(--tap-min)' } }, saveFirst, 'Save a backup of my current data first (recommended)')),
      actions: [
        { label: 'Cancel', onClick: close => close() },
        {
          label: 'Restore backup', primary: true,
          onClick: close => {
            let saved = false;
            if (saveFirst.checked) {
              try { downloadBackup(); saved = true; } catch { close(); say('Your current data could not be saved first, so nothing was restored.', 'error'); return; }
            }
            const res = importAll(parsed.obj);
            close();
            if (!alive) return;
            if (res.ok) say(`Restored ${describeCounts(res.counts)}.${saved ? ' Your previous data was saved to your downloads.' : ''}`, 'ok');
            else say(res.errors.join(' '), 'error');
          },
        },
      ],
    });
  }

  const backup = section('home-backup', 'Backup',
    h('p', { class: 'home-sub' }, 'Everything lives in this browser. Save a copy as a file, or restore one you saved before.'),
    h('div', { class: 'home-actions' },
      h('button', { type: 'button', class: 'btn btn-outline home-cta', dataset: { action: 'restore-backup' }, onClick: () => file.click() }, 'Restore a backup'),
      h('button', { type: 'button', class: 'btn btn-outline home-cta', dataset: { action: 'export-backup' }, onClick: () => { try { downloadBackup(); say('Backup saved to your downloads.', 'ok'); } catch { say('The backup could not be created.', 'error'); } } }, 'Export a backup')),
    file, status);

  el.replaceChildren(h('div', { class: 'home' }, hero, demoSection, checklist, tools, scale, privacy, backup, siteFooter()));
  demo = mountDemo(demoEl);

  return () => { alive = false; if (demo) demo.destroy(); };
}

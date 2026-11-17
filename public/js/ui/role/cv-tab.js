// Phase 3B (#29): Tailored CV tab (CV-01/03/04/05/07). runTool('pdf') with the role's JD pre-filled.
// Contact, education and languages are shown only when the model returned them (BUG-10 does not apply here).
// Paused (design §0): the archetype choice (cv.archetype, BUG-11) and Full preview (cv.fullPreview, BUG-09).
import { h } from '../dom.js';
import { pauseControl, pausedBanner } from '../paused.js';
import { flattenSkills } from '../../render/skills.js'; // protected fix: imported, never copied
import { showToast } from '../../render/toast.js';
import { cvContact, cvExperience, cvEducation, cvLanguages, cvSkills, cvCopySections, str } from './model.js';
import { field, boundInput, copyButton, toolCard } from './parts.js';
import { wireTool, toolKey, draft } from './tool.js';

// The v1 archetype list (kept for the layout; not sent while cv.archetype is paused).
const ARCHETYPES = ['Senior Data Analyst', 'Data Analyst', 'Lead Data Analyst', 'BI Developer / Analyst', 'Product Analyst',
  'Data Engineer', 'Analytics Engineer', 'Data Science Analyst', 'Business Intelligence Manager', 'Head of Analytics'];

// Print window styles: plain keywords only (no theme tokens exist in the new window).
const PRINT_CSS = 'body{margin:0;padding:24px;font-family:"Source Sans Pro",sans-serif;color:black;background:white}'
  + 'h3{font-size:22px;margin:0 0 2px}h4{font-size:12px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1.5px solid black;padding-bottom:3px;margin:18px 0 8px}'
  + 'h5{font-size:13px;margin:0}p,li{font-size:12px;line-height:1.5}ul{margin:4px 0 0;padding-left:16px}'
  + '.role-cv-contact{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:4px 12px;color:dimgray}'
  + '.role-cv-meta,.role-cv-sub{color:dimgray;margin:0}.role-cv-langs{list-style:none;padding:0}a{color:black}';

function section(title, ...content) {
  return h('section', { class: 'role-cv-section' }, h('h4', { class: 'role-cv-h' }, title), content);
}

export function cvDocument(data) {
  const contact = cvContact(data);
  const exp = cvExperience(data);
  const edu = cvEducation(data);
  const skills = cvSkills(data, flattenSkills);
  const langs = cvLanguages(data);
  return h('article', { class: 'role-cv-doc', 'aria-label': 'Tailored CV preview' },
    h('header', { class: 'role-cv-head' },
      str(data.name) ? h('h3', { class: 'role-cv-name' }, str(data.name)) : null,
      str(data.title) ? h('p', { class: 'role-cv-sub' }, str(data.title)) : null,
      contact.length ? h('ul', { class: 'role-cv-contact', 'aria-label': 'Contact' }, contact.map(c => h('li', { dataset: { kind: c.key } },
        c.href ? h('a', { href: c.href, rel: 'noopener noreferrer', target: '_blank' }, c.text) : c.text))) : null),
    str(data.summary) ? section('Profile', h('p', { class: 'role-text' }, str(data.summary))) : null,
    exp.length ? section('Experience', exp.map(e => h('div', { class: 'role-cv-job' },
      h('h5', { class: 'role-cv-role' }, e.role || e.company),
      h('p', { class: 'role-cv-meta' }, [e.role ? e.company : '', e.location, e.period].filter(Boolean).join(' · ')),
      e.bullets.length ? h('ul', null, e.bullets.map(b => h('li', null, b))) : null))) : null,
    edu.length ? section('Education', edu.map(e => h('div', { class: 'role-cv-job' },
      h('h5', { class: 'role-cv-role' }, e.degree || e.institution),
      h('p', { class: 'role-cv-meta' }, [e.degree ? e.institution : '', e.location, e.period].filter(Boolean).join(' · '))))) : null,
    skills.length ? section('Skills', h('p', { class: 'role-text' }, skills.join(' · '))) : null,
    langs.length ? section('Languages', h('ul', { class: 'role-cv-langs' }, langs.map(l => h('li', null, l)))) : null);
}

// Download PDF (CV-05): a print window built with DOM methods (importNode), never document.write.
function printCv(doc) {
  const w = window.open('', '_blank');
  if (!w) { showToast('Allow pop-ups for this site to download the PDF.', 3000); return; }
  const d = w.document;
  d.title = 'Tailored CV';
  const link = d.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${location.origin}/fonts/print.css`;
  const style = d.createElement('style');
  style.textContent = PRINT_CSS;
  d.head.append(link, style);
  d.body.appendChild(d.importNode(doc, true));
  setTimeout(() => { try { w.focus(); w.print(); } catch { /* window closed */ } }, 600);
}

function renderResult(el, data) {
  const doc = cvDocument(data);
  const dl = h('button', { type: 'button', class: 'btn btn-primary role-btn', dataset: { action: 'cv-download' } }, 'Download PDF');
  dl.addEventListener('click', () => printCv(doc));
  const full = h('button', { type: 'button', class: 'btn btn-outline role-btn', dataset: { action: 'cv-full-preview' } }, 'Full preview');
  const fullBanner = pausedBanner('cv.fullPreview');
  pauseControl(full, 'cv.fullPreview');

  const sections = cvCopySections(data, flattenSkills);
  el.append(
    h('section', { class: 'card role-card' },
      h('h2', { class: 'role-card-title' }, 'Your tailored CV'),
      h('div', { class: 'role-cv-wrap' }, doc),
      h('div', { class: 'role-actions' }, dl, full),
      fullBanner,
      h('p', { class: 'role-hint' }, 'Tip: in the print window choose "Save as PDF".')),
    sections.length ? h('section', { class: 'card role-card' },
      h('h2', { class: 'role-card-title' }, 'Copy sections'),
      h('ul', { class: 'role-copy-list' }, sections.map(s => h('li', { class: 'role-copy-item' },
        h('span', { class: 'role-copy-label' }, s.label),
        copyButton(s.text, { ariaLabel: `Copy ${s.label}` }))))) : null);
}

export function renderCvTab(el, role) {
  const key = toolKey(role.id, 'cv');
  const d = draft(key, { jd: typeof role.jd === 'string' ? role.jd : '', archetype: ARCHETYPES[0] });
  const jd = boundInput('textarea', { id: 'role-cv-jd', store: d, name: 'jd', rows: 10 });
  const arch = h('select', { id: 'role-cv-archetype', class: 'form-select role-select', dataset: { action: 'cv-archetype' } },
    ARCHETYPES.map(a => h('option', { value: a }, a)));
  arch.value = d.archetype;
  const archBanner = pausedBanner('cv.archetype');
  pauseControl(arch, 'cv.archetype');

  const button = h('button', { type: 'button', class: 'btn btn-primary role-btn', dataset: { action: 'run-cv' } }, 'Generate tailored CV');
  const form = h('div', { class: 'role-form' },
    field('Job description', jd, { hint: "Pre-filled from this role. Edit it here if you need to; the saved role doesn't change." }),
    h('div', { class: 'form-group role-field' },
      h('label', { class: 'form-label', for: 'role-cv-archetype' }, 'Role archetype'),
      arch,
      archBanner));
  const { card, status, result } = toolCard({
    title: 'Tailored CV',
    purpose: 'Rewrite your CV for this job, using only what is already in your CV.',
    form, button,
  });
  el.replaceChildren(card, result);
  wireTool({
    key, mode: 'pdf', button, statusEl: status, resultEl: result,
    runningLabel: 'Writing your tailored CV…',
    buildInput: () => ({ content: d.jd }),
    render: renderResult,
  });
}

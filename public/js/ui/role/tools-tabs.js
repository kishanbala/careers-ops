// Phase 3B (#29): Research (RES-01), Outreach (OUT-01/02/03) and Negotiate (NEG-01...06) tabs.
// Each is pre-filled from the role (company, JD) and the profile; each calls the model only through runTool().
import { h } from '../dom.js';
import {
  roleHeading, researchContent, researchView, outreachContent, outreachView, noteCount,
  negotiateContent, negotiateDefaults, negotiateView, SCENARIOS, NOTE_FREE, NOTE_MAX,
} from './model.js';
import { field, boundInput, boundSelect, textSection, bulletList, copyButton, toolCard } from './parts.js';
import { wireTool, toolKey, draft } from './tool.js';

// ----- Research -----
function renderResearch(el, data) {
  const v = researchView(data);
  el.append(h('section', { class: 'card role-card role-research' },
    h('div', { class: 'role-research-head' },
      h('div', null,
        h('h2', { class: 'role-card-title' }, v.company || 'Company brief'),
        v.facts.length ? h('dl', { class: 'role-facts' }, v.facts.map(f => h('div', { class: 'role-fact' },
          h('dt', null, f.label), h('dd', null, f.text)))) : null),
      v.aiScore ? h('p', { class: 'role-ai-score' }, h('span', { class: 'role-ai-score-label' }, 'AI score'), h('span', { class: 'role-ai-score-val' }, v.aiScore)) : null),
    v.blocks.map(b => textSection(b.label, b.text)),
    v.verdict ? h('section', { class: 'role-verdict-card' },
      h('h3', { class: 'role-block-title' }, 'Verdict'),
      h('p', { class: 'role-text' }, v.verdict)) : null));
}

export function renderResearchTab(el, role) {
  const key = toolKey(role.id, 'research');
  const d = draft(key, { company: roleHeading(role).company });
  const company = boundInput('input', { id: 'role-research-company', store: d, name: 'company' });
  const button = h('button', { type: 'button', class: 'btn btn-primary role-btn', dataset: { action: 'run-research' } }, 'Research this company');
  const { card, status, result } = toolCard({
    title: 'Company research',
    purpose: 'A brief on the company: culture, interview process, pay and red flags. Only the company name is sent.',
    form: h('div', { class: 'role-form' }, field('Company name', company)),
    button,
  });
  el.replaceChildren(card, result);
  wireTool({
    key, mode: 'research', button, statusEl: status, resultEl: result,
    runningLabel: 'Researching the company…',
    buildInput: () => ({ content: researchContent(d.company) }),
    render: renderResearch,
  });
}

// ----- Outreach -----
function renderOutreach(el, data) {
  const v = outreachView(data);
  const parts = [];
  if (v.note) {
    const c = noteCount(v.note);
    parts.push(h('section', { class: 'role-block' },
      h('h3', { class: 'role-block-title' }, 'Connection note'),
      h('p', { class: 'role-text role-note-text' }, v.note),
      h('p', { class: `role-counter role-counter--${c.fit}`, dataset: { fit: c.fit } },
        h('span', { class: 'role-counter-num' }, c.label), ' ', c.message),
      h('div', { class: 'role-actions' }, copyButton(v.note, { label: 'Copy note', ariaLabel: 'Copy connection note' }))));
  }
  if (v.subject || v.body) {
    parts.push(h('section', { class: 'role-block' },
      h('h3', { class: 'role-block-title' }, 'InMail'),
      v.subject ? h('p', { class: 'role-subject' }, h('span', { class: 'role-qa-tag' }, 'Subject: '), v.subject) : null,
      v.body ? h('p', { class: 'role-text role-letter' }, v.body) : null,
      v.body ? h('div', { class: 'role-actions' }, copyButton(v.subject ? `${v.subject}\n\n${v.body}` : v.body, { label: 'Copy InMail', ariaLabel: 'Copy InMail' })) : null));
  }
  if (v.tips.length) parts.push(h('section', { class: 'role-block' }, h('h3', { class: 'role-block-title' }, 'Tips'), bulletList(v.tips)));
  el.append(h('section', { class: 'card role-card' }, h('h2', { class: 'role-card-title' }, 'Your messages'), parts));
}

export function renderOutreachTab(el, role) {
  const key = toolKey(role.id, 'outreach');
  const d = draft(key, { jd: typeof role.jd === 'string' ? role.jd : '', target: '' });
  const jd = boundInput('textarea', { id: 'role-outreach-jd', store: d, name: 'jd', rows: 8 });
  const target = boundInput('input', { id: 'role-outreach-target', store: d, name: 'target', placeholder: 'e.g. the hiring manager for the data team' });
  const button = h('button', { type: 'button', class: 'btn btn-primary role-btn', dataset: { action: 'run-outreach' } }, 'Write messages');
  const { card, status, result } = toolCard({
    title: 'Outreach',
    purpose: `A LinkedIn connection note (checked against the ${NOTE_FREE} and ${NOTE_MAX} character limits) and an InMail.`,
    form: h('div', { class: 'role-form' },
      field('Job description', jd, { hint: 'Pre-filled from this role.' }),
      field('Who are you writing to? (optional)', target)),
    button,
  });
  el.replaceChildren(card, result);
  wireTool({
    key, mode: 'contacto', button, statusEl: status, resultEl: result,
    runningLabel: 'Writing your messages…',
    buildInput: () => ({ content: outreachContent(d.jd, d.target) }),
    render: renderOutreach,
  });
}

// ----- Negotiate -----
function renderNegotiate(el, data) {
  const v = negotiateView(data);
  const parts = v.sections.map(s => textSection(s.label, s.text));
  if (v.emailSubject || v.emailBody) {
    parts.push(h('section', { class: 'role-block' },
      h('h3', { class: 'role-block-title' }, 'Email draft'),
      v.emailSubject ? h('p', { class: 'role-subject' }, h('span', { class: 'role-qa-tag' }, 'Subject: '), v.emailSubject) : null,
      v.emailBody ? h('p', { class: 'role-text role-letter' }, v.emailBody) : null,
      v.emailBody ? h('div', { class: 'role-actions' }, copyButton(v.emailSubject ? `${v.emailSubject}\n\n${v.emailBody}` : v.emailBody, { label: 'Copy email', ariaLabel: 'Copy email draft' })) : null));
  }
  if (v.tips.length) parts.push(h('section', { class: 'role-block' }, h('h3', { class: 'role-block-title' }, 'Tips'), bulletList(v.tips)));
  el.append(h('section', { class: 'card role-card' }, h('h2', { class: 'role-card-title' }, 'Your negotiation script'), parts));
}

export function renderNegotiateTab(el, role, profile) {
  const key = toolKey(role.id, 'negotiate');
  const d = draft(key, negotiateDefaults(role, profile));
  const scenario = boundSelect({ id: 'role-neg-scenario', store: d, name: 'scenario', options: SCENARIOS });
  const offer = boundInput('input', { id: 'role-neg-offer', store: d, name: 'offer', placeholder: 'e.g. EUR 70,000 base' });
  const target = boundInput('input', { id: 'role-neg-target', store: d, name: 'target', placeholder: 'e.g. EUR 85,000 base' });
  const competing = boundInput('input', { id: 'role-neg-competing', store: d, name: 'competing', placeholder: 'e.g. EUR 80,000 from another company' });
  const context = boundInput('textarea', { id: 'role-neg-context', store: d, name: 'context', rows: 4 });
  const button = h('button', { type: 'button', class: 'btn btn-primary role-btn', dataset: { action: 'run-negotiate' } }, 'Write my script');
  const { card, status, result } = toolCard({
    title: 'Negotiate',
    purpose: 'A salary and offer script for one of five situations, with an email draft.',
    form: h('div', { class: 'role-form' },
      field('Scenario', scenario),
      h('div', { class: 'role-grid-2' }, field('Their offer', offer), field('Your target', target)),
      field('Competing offer (optional)', competing),
      field('More context (optional)', context, { hint: 'Pre-filled with this role. Add years of experience, achievements or relocation.' })),
    button,
  });
  el.replaceChildren(card, result);
  wireTool({
    key, mode: 'negotiate', button, statusEl: status, resultEl: result,
    runningLabel: 'Writing your script…',
    buildInput: () => ({ content: negotiateContent(d) }),
    render: renderNegotiate,
  });
}

// Phase 3B (#29): small building blocks shared by the role workspace tabs. Text only (h()), no innerHTML.
import { h } from '../dom.js';
import { showToast } from '../../render/toast.js';

// A labelled form field. `control` must carry the id the label points to.
export function field(label, control, { hint } = {}) {
  const id = control.getAttribute('id');
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), hintId].filter(Boolean).join(' '));
  return h('div', { class: 'form-group role-field' },
    h('label', { class: 'form-label', for: id }, label),
    control,
    hint ? h('p', { class: 'role-hint', id: hintId }, hint) : null);
}

// A text input/textarea bound to an in-memory draft object (survives tab switches, never stored).
export function boundInput(tag, { id, store, name, rows, placeholder, type = 'text' }) {
  const el = h(tag, {
    id,
    class: tag === 'textarea' ? 'form-textarea role-textarea' : 'form-input role-input',
    ...(tag === 'textarea' ? { rows: rows || 8 } : { type }),
    placeholder,
    autocomplete: 'off',
  });
  el.value = store[name] == null ? '' : String(store[name]);
  el.addEventListener('input', () => { store[name] = el.value; });
  return el;
}

export function boundSelect({ id, store, name, options }) {
  const el = h('select', { id, class: 'form-select role-select' },
    options.map(o => h('option', { value: o }, o)));
  el.value = options.includes(store[name]) ? store[name] : options[0];
  el.addEventListener('change', () => { store[name] = el.value; });
  return el;
}

// A titled block of model text. Line breaks in the text are kept by CSS (white-space: pre-line).
export function textSection(title, text, { level = 'h3', cls = '' } = {}) {
  return h('section', { class: `role-block ${cls}`.trim() },
    h(level, { class: 'role-block-title' }, title),
    h('p', { class: 'role-text' }, text));
}

export function bulletList(items, cls = 'role-list') {
  return h('ul', { class: cls }, items.map(t => h('li', null, t)));
}

// Copy button (CV-04, OUT-03): copies the raw text through the Clipboard API, never through markup.
export function copyButton(text, { label = 'Copy', ariaLabel } = {}) {
  const btn = h('button', { type: 'button', class: 'btn btn-outline role-copy', 'aria-label': ariaLabel || label }, label);
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(String(text));
      btn.textContent = 'Copied';
      showToast('Copied');
      setTimeout(() => { if (btn.isConnected) btn.textContent = label; }, 1800);
    } catch {
      showToast('Could not copy. Select the text and copy it by hand.', 3000);
    }
  });
  return btn;
}

// Card that holds a tool's form, its running line and its result area.
export function toolCard({ title, purpose, form, button }) {
  const status = h('div', { class: 'role-status' });
  const result = h('div', { class: 'role-result' });
  const card = h('section', { class: 'card role-card role-tool' },
    h('h2', { class: 'role-card-title' }, title),
    purpose ? h('p', { class: 'role-purpose' }, purpose) : null,
    form,
    h('div', { class: 'role-actions' }, button),
    status);
  return { card, status, result };
}

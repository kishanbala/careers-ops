// Phase 3 shared kit (spec §5): build DOM without innerHTML. All model output goes in as text nodes.
import { esc } from '../render/escape.js';

export { esc };

// h('button', { class: 'btn', type: 'button', onClick: fn, dataset: { action: 'x' } }, 'Label', childNode, [more])
// - text children (strings, numbers) become text nodes, never markup
// - null / undefined / false children and attributes are skipped; true becomes an empty attribute
// - on<Event> functions become listeners; `dataset` and `style` (object) are applied property by property
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs != null && (typeof attrs !== 'object' || Array.isArray(attrs) || isNode(attrs))) {
    children.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (/^on[A-Z]/.test(k) && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset' && typeof v === 'object') { for (const [dk, dv] of Object.entries(v)) if (dv != null) el.dataset[dk] = String(dv); }
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) if (sv != null) el.style.setProperty(sk, String(sv)); }
    else if (k === 'class' || k === 'className') el.setAttribute('class', String(v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}

function isNode(x) { return x != null && typeof x === 'object' && typeof x.nodeType === 'number'; }

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false || c === true) continue;
    if (Array.isArray(c)) append(el, c);
    else if (isNode(c)) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

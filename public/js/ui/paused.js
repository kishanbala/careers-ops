// Phase 3 shared kit (spec §5, §7): the only way a Phase 3 screen renders a paused action.
// Render the real control, then pauseControl(el, flag) and put pausedBanner(flag) next to it.
// Paused controls stay visible and focusable; they send nothing and change nothing.
import { isOn, pausedAttrs, PAUSED_BANNER } from '../features.js';
import { h } from './dom.js';

const on = flag => { try { return isOn(flag); } catch { return false; } }; // unknown flag = paused
export const bannerId = flag => `paused-${String(flag).replace(/[^A-Za-z0-9_-]/g, '-')}`;

export function pausedBanner(flag) {
  if (on(flag)) return null;
  return h('p', { class: 'paused-banner', id: bannerId(flag), dataset: { flag } }, PAUSED_BANNER);
}

const TEXT_ENTRY = /^(TEXTAREA|SELECT)$/;
const isTextEntry = t => t && (TEXT_ENTRY.test(t.tagName) || (t.tagName === 'INPUT' && !/^(button|submit|reset|checkbox|radio|file|image)$/i.test(t.type || 'text')));

function block(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
}

export function pauseControl(el, flag) {
  if (!el || on(flag)) return el;
  const attrs = pausedAttrs(flag);
  const targets = [el, ...el.querySelectorAll('button, [type="submit"], [role="button"], a[href]')];
  for (const t of targets) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') t.classList.add(...String(v).split(/\s+/).filter(Boolean));
      else t.setAttribute(k, v);
    }
    const ids = (t.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!ids.includes(bannerId(flag))) t.setAttribute('aria-describedby', [...ids, bannerId(flag)].join(' '));
  }
  el.dataset.pausedFlag = flag;
  // Capture phase on the control itself runs before any handler the screen attached to it or its children.
  el.addEventListener('click', block, true);
  el.addEventListener('submit', block, true);
  el.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') && !isTextEntry(e.target)) block(e);
  }, true);
  return el;
}

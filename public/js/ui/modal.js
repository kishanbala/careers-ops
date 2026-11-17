// Phase 3 shared kit (spec §5): one modal for every screen. Native <dialog> + showModal(): the page
// behind is inert (focus stays inside), Esc closes, focus returns to the element that opened it.
import { h } from './dom.js';

let seq = 0;

// actions: [{ label, onClick(close), primary? }]. Returns close(); calling it twice is harmless.
export function openModal({ title, body, actions = [] } = {}) {
  const opener = document.activeElement;
  const titleId = `k-modal-title-${++seq}`;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (dlg.open && typeof dlg.close === 'function') dlg.close();
    dlg.remove();
    if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  };
  const buttons = actions.map(a => h('button', {
    type: 'button',
    class: `btn ${a.primary ? 'btn-primary' : 'btn-outline'} k-modal-action`,
    onClick: () => { if (typeof a.onClick === 'function') a.onClick(close); else close(); },
  }, a.label));
  const dlg = h('dialog', { class: 'k-modal', 'aria-labelledby': titleId },
    h('div', { class: 'k-modal-head' },
      h('h2', { class: 'k-modal-title', id: titleId }, title || ''),
      h('button', { type: 'button', class: 'k-modal-close', 'aria-label': 'Close', onClick: close }, '×')),
    h('div', { class: 'k-modal-body' }, body || null),
    buttons.length ? h('div', { class: 'k-modal-actions' }, buttons) : null);
  dlg.addEventListener('cancel', e => { e.preventDefault(); close(); }); // Esc
  dlg.addEventListener('close', () => { if (!closed) close(); });
  document.body.appendChild(dlg);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  (buttons.find((_, i) => actions[i].primary) || buttons[0] || dlg.querySelector('.k-modal-close')).focus();
  return close;
}

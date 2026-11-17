// Phase 3 shared kit (spec §5): running and error states for model-backed actions.
import { h } from './dom.js';
import { toolMessage } from '../api.js';
import { href } from '../router.js';

// Shows "<label> 12 s" in el (EVAL-03) until stop() is called. Safe to call stop() more than once.
export function showRunning(el, label = 'Working…') {
  const secs = h('span', { class: 'k-running-secs' }, '0 s');
  const node = h('div', { class: 'k-running', role: 'status', 'aria-live': 'polite' },
    h('span', { class: 'k-running-dot', 'aria-hidden': 'true' }),
    h('span', { class: 'k-running-label' }, label),
    ' ',
    secs);
  el.replaceChildren(node);
  el.setAttribute('aria-busy', 'true');
  const started = Date.now();
  const timer = setInterval(() => {
    if (!node.isConnected) return;
    secs.textContent = `${Math.floor((Date.now() - started) / 1000)} s`;
  }, 1000);
  let stopped = false;
  return function stop() {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    el.removeAttribute('aria-busy');
    if (node.parentNode === el) node.remove();
  };
}

const RETRYABLE = new Set(['unreadable', 'cut-off', 'rate-limited', 'server', 'network']);

// Renders toolMessage(result) as text. empty-profile links to Profile; retryable kinds get "Try again" when retry is given.
export function showToolError(el, result, { retry } = {}) {
  const kind = result && result.kind;
  const box = h('div', { class: 'k-tool-error', role: 'alert', dataset: { kind: kind || 'server' } },
    h('p', { class: 'k-tool-error-text' }, toolMessage(result)));
  if (kind === 'empty-profile') {
    box.appendChild(h('a', { class: 'btn btn-primary k-tool-error-action', href: href('profile') }, 'Add your CV in Profile'));
  } else if (typeof retry === 'function' && RETRYABLE.has(kind)) {
    box.appendChild(h('button', { type: 'button', class: 'btn btn-outline k-tool-error-action', onClick: () => retry() }, 'Try again'));
  }
  el.replaceChildren(box);
  return box;
}

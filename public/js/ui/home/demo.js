// The 4-step demo (design §3): auto-advances every 3.6 s, Pause/Play, clickable steps,
// static (no timer, no Pause/Play) under prefers-reduced-motion.
import { h } from '../dom.js';
import { DEMO_STEPS } from './content.js';
import { fmtScore, bandPill } from '../score.js';

export const STEP_MS = 3600;

export const nextIndex = (i, n = DEMO_STEPS.length) => (((Number.isInteger(i) ? i : 0) + 1) % n + n) % n;
export const clampIndex = (i, n = DEMO_STEPS.length) => (Number.isInteger(i) && i >= 0 && i < n ? i : 0);

export function prefersReducedMotion(win = typeof window !== 'undefined' ? window : null) {
  try { return !!(win && win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; }
}

const bars = n => h('span', { class: 'home-skel', 'aria-hidden': 'true' }, Array.from({ length: n }, (_, i) => h('span', { class: 'home-skel-line', style: { width: `${92 - i * 14}%` } })));

// The small picture for each step. Made-up numbers; the panel says "example".
function scene(id) {
  if (id === 'cv') return h('div', { class: 'home-scene' }, h('p', { class: 'home-scene-label' }, 'Your CV'), bars(4));
  if (id === 'job') return h('div', { class: 'home-scene' }, h('p', { class: 'home-scene-label' }, 'Job description'), bars(4));
  if (id === 'verdict') {
    return h('div', { class: 'home-scene' }, h('p', { class: 'home-scene-label' }, 'Verdict'),
      h('p', { class: 'home-scene-verdict' }, h('span', { class: 'home-scene-num' }, fmtScore(4.2)), ' ', bandPill(4.2)));
  }
  return h('div', { class: 'home-scene' }, h('p', { class: 'home-scene-label' }, 'Next moves'),
    h('ul', { class: 'home-scene-chips' }, ['Tailored CV', 'Research', 'Outreach', 'Interview'].map(t => h('li', { class: 'home-chip' }, t))));
}

// Renders into `el`; returns { destroy, state } so the view can clean up the timer.
// timers (tests only): { setInterval, clearInterval }. Default calls the globals directly (a method call on a plain
// object would throw "Illegal invocation" in browsers).
export function mountDemo(el, { reduced = prefersReducedMotion(), timers } = {}) {
  let index = 0;
  let playing = !reduced;
  let timer = null;

  const stepBtns = DEMO_STEPS.map((s, i) => h('button', {
    type: 'button', class: 'home-step', dataset: { step: s.id, index: i },
    onClick: () => { select(i); },
  }, h('span', { class: 'home-step-n', 'aria-hidden': 'true' }, String(i + 1)), h('span', { class: 'home-step-t' }, s.title)));
  const panel = h('div', { class: 'home-demo-panel', id: 'home-demo-panel' });
  const toggle = reduced ? null : h('button', {
    type: 'button', class: 'btn btn-outline home-demo-toggle', dataset: { action: 'demo-toggle' },
    'aria-pressed': 'false', onClick: () => { setPlaying(!playing); },
  });

  function paint() {
    const s = DEMO_STEPS[index];
    stepBtns.forEach((b, i) => { if (i === index) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    panel.replaceChildren(
      h('p', { class: 'home-demo-count' }, `Step ${index + 1} of ${DEMO_STEPS.length} · example`),
      h('h3', { class: 'home-demo-title' }, s.title),
      h('p', { class: 'home-demo-text' }, s.text),
      scene(s.id));
    el.dataset.step = s.id;
    el.dataset.playing = String(playing);
    if (toggle) {
      toggle.textContent = playing ? 'Pause' : 'Play';
      toggle.setAttribute('aria-label', playing ? 'Pause the demo' : 'Play the demo');
      toggle.setAttribute('aria-pressed', String(!playing));
    }
  }
  function stop() { if (timer != null) { if (timers) timers.clearInterval(timer); else clearInterval(timer); timer = null; } }
  function start() { stop(); if (playing && !reduced) { const tick = () => { index = nextIndex(index); paint(); }; timer = timers ? timers.setInterval(tick, STEP_MS) : setInterval(tick, STEP_MS); } }
  function setPlaying(p) { playing = !!p && !reduced; paint(); start(); }
  function select(i) { index = clampIndex(i); paint(); start(); } // a click restarts the 3.6 s clock

  el.replaceChildren(
    h('div', { class: 'home-demo-steps', role: 'group', 'aria-label': 'How Kairo works, four steps' }, stepBtns),
    h('div', { 'aria-live': 'off' }, panel),
    ...(toggle ? [toggle] : [])); // BUG-60: replaceChildren(null) renders the text "null" under reduced motion
  paint();
  start();
  return {
    destroy: stop,
    get state() { return { index, playing, running: timer != null }; },
  };
}

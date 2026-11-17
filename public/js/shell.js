// ===== APP SHELL (Phase 2 spec §6; Phase 4A: legacy pages retired) =====
// Renders every route as a view (lazy, ./views/{name}.js) into main#app-main, keeps the nav badges current,
// and mounts the site footer (attribution, Privacy, Impressum slot) once, below every view (Phase 3 spec §8/§11).
import { onRoute, firstRunState } from './router.js';
import { onChange, pipeline, stories } from './store.js';
import { mountThemeToggle } from './theme.js';
import { siteFooter } from './ui/site-footer.js';

let shellEl = null;
let mainEl = null;
let footerEl = null;
let unmountView = null;
let renderSeq = 0;
let firstRender = true;

const $$ = sel => [...document.querySelectorAll(sel)];

function clearActive() {
  $$('.view.active').forEach(s => s.classList.remove('active'));
  $$('[data-dest][aria-current]').forEach(n => n.removeAttribute('aria-current'));
}

function markDest(dest) {
  if (!dest) return;
  $$(`[data-dest="${dest}"]`).forEach(n => n.setAttribute('aria-current', 'page'));
}

function viewSection(name) {
  let el = document.getElementById('view-' + name);
  if (!el) {
    el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-' + name;
    mainEl.insertBefore(el, footerEl);
  }
  return el;
}

function updateState() {
  if (!shellEl) return;
  shellEl.dataset.state = firstRunState();
  shellEl.dataset.hasRoles = String(pipeline.length > 0);
}

// Nav counts (Pipeline, Story bank), written once at start-up like the retired pages/dashboard.js did.
// Live updates on change are BUG-50 (bug track, out of scope for Phase 4A). Text only.
function updateBadges() {
  const set = (id, n) => { const b = document.getElementById(id); if (b) b.textContent = String(n); };
  set('sb-badge', pipeline.length);
  set('sb-stories-badge', stories.length);
}

function closeMenu() {
  shellEl?.classList.remove('nav-open');
  document.querySelector('.shell-menu-btn')?.setAttribute('aria-expanded', 'false');
}

// Route change: move focus to the new screen's h1 so keyboard and screen-reader users land at the top of it
// (not on first load, where the skip link must stay the first tab stop).
function focusHeading(el) {
  if (firstRender) { firstRender = false; return; }
  if (el.contains(document.activeElement)) return; // the view placed focus itself (Role keeps the tab focused)
  const hd = el.querySelector('h1');
  if (!hd) return;
  hd.setAttribute('tabindex', '-1');
  try { hd.focus({ preventScroll: true }); } catch { /* detached */ }
}

function render(route) {
  const seq = ++renderSeq;
  if (unmountView) { try { unmountView(); } catch (e) { console.warn(e); } unmountView = null; }
  clearActive();
  closeMenu();
  updateState();
  const el = viewSection(route.name);
  el.classList.add('active');
  markDest(route.name === 'home' ? 'today' : route.name);
  import(`./views/${route.name}.js`).then(m => {
    if (seq !== renderSeq) return; // a newer route won
    el.replaceChildren();
    const un = m.mount(el, { params: route.params, state: route.state });
    unmountView = () => { if (typeof un === 'function') un(); el.replaceChildren(); el.classList.remove('active'); };
    focusHeading(el);
  }).catch(e => console.warn('view failed to load', route.name, e));
  if (typeof window !== 'undefined') window.scrollTo(0, 0);
}

export function mountShell() {
  shellEl = document.querySelector('.app-shell');
  mainEl = document.getElementById('app-main');
  if (!shellEl || !mainEl) return;
  footerEl = siteFooter();
  mainEl.append(footerEl);
  updateState();
  updateBadges();
  for (const k of ['co_pipeline', 'co_profile']) onChange(k, updateState);
  const slot = document.getElementById('theme-toggle-slot');
  if (slot) mountThemeToggle(slot);
  const btn = document.querySelector('.shell-menu-btn');
  btn?.addEventListener('click', () => {
    const open = !shellEl.classList.contains('nav-open');
    shellEl.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  // The skip link would change the hash (and re-route), so move focus by hand.
  document.querySelector('.skip-link')?.addEventListener('click', e => {
    e.preventDefault();
    mainEl.focus({ preventScroll: false });
    mainEl.scrollIntoView?.({ block: 'start' });
  });
  onRoute(render);
}

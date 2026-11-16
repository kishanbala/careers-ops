// ===== APP SHELL (Phase 2 spec §6) =====
// Renders routes into main#app-main: new views (lazy, ./views/{name}.js) or the legacy #page-* sections.
import { onRoute, firstRunState } from './router.js';
import { onChange, pipeline } from './store.js';
import { mountThemeToggle } from './theme.js';

// Which primary destination is "current" for a legacy page.
const LEGACY_DEST = { dashboard: 'pipeline', stories: 'stories', profile: 'profile', evaluate: 'add', batch: 'add', scan: 'add' };

let shellEl = null;
let mainEl = null;
let unmountView = null;
let renderSeq = 0;

const $$ = sel => [...document.querySelectorAll(sel)];

function clearActive() {
  $$('.page-section.active, .view.active').forEach(s => s.classList.remove('active'));
  $$('.nav-item.active').forEach(n => n.classList.remove('active'));
  $$('[data-dest][aria-current]').forEach(n => n.removeAttribute('aria-current'));
}

function markDest(dest) {
  if (!dest) return;
  $$(`[data-dest="${dest}"]`).forEach(n => n.setAttribute('aria-current', 'page'));
}

// Show one legacy section (used by the legacy route and by views that delegate until Phase 3).
// Returns an unmount function that hides it again.
export function showLegacy(pageId) {
  const sec = document.getElementById('page-' + pageId);
  sec?.classList.add('active');
  $$(`.nav-item[data-page="${pageId}"]`).forEach(n => n.classList.add('active'));
  return () => {
    sec?.classList.remove('active');
    $$(`.nav-item[data-page="${pageId}"]`).forEach(n => n.classList.remove('active'));
  };
}

// Phase 2 stub content: one purpose line plus one action (design §3). Text only, no innerHTML.
export function renderStub(el, { title, text, action, href, primary = true }) {
  const head = document.createElement('div');
  head.className = 'page-header';
  const h1 = document.createElement('h1');
  h1.className = 'page-title';
  h1.textContent = title;
  const p = document.createElement('p');
  p.className = 'page-subtitle view-purpose';
  p.textContent = text;
  head.append(h1, p);
  const a = document.createElement('a');
  a.className = `btn ${primary ? 'btn-primary' : 'btn-outline'} view-action`;
  a.href = href;
  a.textContent = action;
  el.append(head, a);
}

function viewSection(name) {
  let el = document.getElementById('view-' + name);
  if (!el) {
    el = document.createElement('section');
    el.className = 'view';
    el.id = 'view-' + name;
    mainEl.insertBefore(el, mainEl.querySelector('.page-section'));
  }
  return el;
}

function updateState() {
  if (!shellEl) return;
  shellEl.dataset.state = firstRunState();
  shellEl.dataset.hasRoles = String(pipeline.length > 0);
}

function closeMenu() {
  shellEl?.classList.remove('nav-open');
  document.querySelector('.shell-menu-btn')?.setAttribute('aria-expanded', 'false');
}

function render(route) {
  const seq = ++renderSeq;
  if (unmountView) { try { unmountView(); } catch (e) { console.warn(e); } unmountView = null; }
  clearActive();
  closeMenu();
  updateState();
  if (route.name === 'legacy') {
    unmountView = showLegacy(route.params.page);
    markDest(LEGACY_DEST[route.params.page]);
  } else {
    const el = viewSection(route.name);
    el.classList.add('active');
    markDest(route.name === 'home' ? 'today' : route.name);
    import(`./views/${route.name}.js`).then(m => {
      if (seq !== renderSeq) return; // a newer route won
      el.replaceChildren();
      const un = m.mount(el, { params: route.params, state: route.state });
      unmountView = () => { if (typeof un === 'function') un(); el.replaceChildren(); el.classList.remove('active'); };
    }).catch(e => console.warn('view failed to load', route.name, e));
  }
  if (typeof window !== 'undefined') window.scrollTo(0, 0);
}

export function mountShell() {
  shellEl = document.querySelector('.app-shell');
  mainEl = document.getElementById('app-main');
  if (!shellEl || !mainEl) return;
  updateState();
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
  onRoute(render);
}

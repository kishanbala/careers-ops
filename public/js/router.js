// ===== HASH ROUTER (Phase 2 spec §6) =====
// Pure parts (parseHash, href, firstRunState) work in Node; DOM parts are guarded.

export const ROLE_TABS = Object.freeze(['fit', 'cv', 'research', 'outreach', 'interview', 'negotiate']);
export const ADD_MODES = Object.freeze(['several', 'scan']);

export const ROUTES = Object.freeze([
  { name: 'root', pattern: '#/' },
  { name: 'home', pattern: '#/home' },
  { name: 'today', pattern: '#/today' },
  { name: 'pipeline', pattern: '#/pipeline' },
  { name: 'pipeline', pattern: '#/pipeline/:id' },
  { name: 'role', pattern: '#/role/:id/:tab?' },
  { name: 'stories', pattern: '#/stories' },
  { name: 'profile', pattern: '#/profile' },
  { name: 'add', pattern: '#/add' },
  { name: 'add', pattern: '#/add/several' },
  { name: 'add', pattern: '#/add/scan' },
].map(r => Object.freeze(r)));

const ROOT = Object.freeze({ name: 'root', params: Object.freeze({}) });
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const SIMPLE = new Set(['home', 'today', 'stories', 'profile']);

const decode = s => { try { return decodeURIComponent(s); } catch { return null; } };

export function parseHash(hash) {
  let h = typeof hash === 'string' ? hash : '';
  if (h.startsWith('#')) h = h.slice(1);
  h = h.split('?')[0];
  if (h !== '' && !h.startsWith('/')) return { ...ROOT, params: {} };
  const seg = h.split('/').filter(Boolean).map(decode);
  if (seg.some(s => s === null)) return { name: 'root', params: {} };
  const [a, b, c] = seg;
  const n = seg.length;
  if (n === 0) return { name: 'root', params: {} };
  if (n === 1 && SIMPLE.has(a)) return { name: a, params: {} };
  if (a === 'pipeline' && n === 1) return { name: 'pipeline', params: {} };
  if (a === 'pipeline' && n === 2 && ID_RE.test(b)) return { name: 'pipeline', params: { id: b } };
  if (a === 'role' && (n === 2 || n === 3) && ID_RE.test(b)) {
    const tab = n === 3 ? c : 'fit';
    if (ROLE_TABS.includes(tab)) return { name: 'role', params: { id: b, tab } };
  }
  if (a === 'add' && n === 1) return { name: 'add', params: {} };
  if (a === 'add' && n === 2 && ADD_MODES.includes(b)) return { name: 'add', params: { mode: b } };
  return { name: 'root', params: {} };
}

export function href(name, params = {}) {
  const p = params || {};
  const enc = encodeURIComponent;
  switch (name) {
    case 'home': case 'today': case 'stories': case 'profile': return `#/${name}`;
    case 'pipeline': return p.id != null ? `#/pipeline/${enc(p.id)}` : '#/pipeline';
    case 'role': return `#/role/${enc(p.id)}` + (p.tab && p.tab !== 'fit' ? `/${enc(p.tab)}` : '');
    case 'add': return ADD_MODES.includes(p.mode) ? `#/add/${p.mode}` : '#/add';
    default: return '#/';
  }
}

// ===== FIRST-RUN STATE (design §3; decision 3: saved roles always win) =====
function readJson(storage, key) {
  try { return { ok: true, value: JSON.parse(storage.getItem(key)) }; } catch { return { ok: false, value: null }; }
}
function defaultStorage() {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
export function firstRunState(storage = defaultStorage()) {
  if (!storage) return 'home';
  const pl = readJson(storage, 'co_pipeline');
  if (pl.ok && Array.isArray(pl.value) && pl.value.length > 0) return 'today';
  const pr = readJson(storage, 'co_profile');
  const p = pr.ok ? pr.value : null;
  const hasField = p !== null && typeof p === 'object' && !Array.isArray(p)
    && Object.values(p).some(v => typeof v === 'string' && v.trim() !== '');
  return hasField ? 'today-empty' : 'home';
}

// Route actually shown for a parsed hash in a given state, plus the hash to replace the URL with (if any).
export function resolveRoute(parsed, state) {
  if (parsed.name === 'root' || (parsed.name === 'today' && state === 'home')) {
    const name = state === 'home' ? 'home' : 'today';
    return { name, params: {}, state, redirect: href(name) };
  }
  return { name: parsed.name, params: parsed.params, state, redirect: null };
}

// ===== NAVIGATION (DOM) =====
const routeListeners = new Set();
let lastHash = null;
let started = false;

export function onRoute(fn) { routeListeners.add(fn); return () => routeListeners.delete(fn); }

function dispatch(force = false) {
  if (typeof location === 'undefined') return;
  const resolved = resolveRoute(parseHash(location.hash), firstRunState());
  if (resolved.redirect && resolved.redirect !== location.hash) history.replaceState(history.state, '', resolved.redirect);
  if (!force && location.hash === lastHash) return;
  lastHash = location.hash;
  const route = { name: resolved.name, params: resolved.params, state: resolved.state };
  for (const fn of [...routeListeners]) {
    try { fn(route); } catch (e) { console.error(e); }
  }
}

export function go(name, params = {}, { replace = false } = {}) {
  if (typeof location === 'undefined' || typeof history === 'undefined') return;
  const h = href(name, params);
  if (replace) history.replaceState(history.state, '', h);
  else if (location.hash !== h) history.pushState(null, '', h);
  dispatch(true); // render now, so callers see the new view as soon as go() returns
}

export function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('hashchange', () => dispatch());
  window.addEventListener('popstate', () => dispatch());
  dispatch(true);
}

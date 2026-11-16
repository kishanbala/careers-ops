// Light / Dark theme (design-decisions §5). theme-boot.js sets data-theme before paint; this module owns changes.
export const THEMES = ['light', 'dark'];
export const THEME_KEY = 'co_theme';
const ANIM_MS = 300;

// Pure: invalid saved values are ignored, then the OS preference decides.
export function resolveTheme(saved, prefersDark) {
  if (THEMES.includes(saved)) return saved;
  return prefersDark ? 'dark' : 'light';
}

const root = () => document.documentElement;
const prefersDark = () => {
  try { return !!(globalThis.matchMedia && globalThis.matchMedia('(prefers-color-scheme: dark)').matches); } catch { return false; }
};

export function getSavedTheme() {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === null) return null;
    const v = JSON.parse(raw);
    return THEMES.includes(v) ? v : null;
  } catch { return null; }
}

export function getTheme() {
  const t = root().dataset.theme;
  return THEMES.includes(t) ? t : resolveTheme(getSavedTheme(), prefersDark());
}

let animTimer = null;

export function setTheme(t, { persist = true } = {}) {
  if (!THEMES.includes(t)) return;
  const el = root();
  const changed = el.dataset.theme !== t;
  if (changed) {
    el.setAttribute('data-theme-anim', '');
    clearTimeout(animTimer);
    animTimer = setTimeout(() => el.removeAttribute('data-theme-anim'), ANIM_MS);
  }
  el.dataset.theme = t;
  if (persist) {
    try { localStorage.setItem(THEME_KEY, JSON.stringify(t)); } catch { /* storage blocked or full: theme still applies */ }
  }
  window.dispatchEvent(new CustomEvent('kairo:themechange', { detail: { theme: t } }));
}

export function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

let inited = false;
export function initTheme() {
  if (inited) return;
  inited = true;
  setTheme(resolveTheme(getSavedTheme(), prefersDark()), { persist: false });
  try {
    const mq = globalThis.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => { if (getSavedTheme() === null) setTheme(e.matches ? 'dark' : 'light', { persist: false }); };
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener?.(onChange);
  } catch { /* no matchMedia */ }
}

const ICON_MOON = '<svg class="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const ICON_SUN = '<svg class="theme-toggle-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';

// Icon button that shows the DESTINATION: moon + "Dark" in light mode, sun + "Light" in dark mode.
export function mountThemeToggle(el) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'theme-toggle';
  const render = () => {
    const toDark = getTheme() === 'light';
    const label = toDark ? 'Switch to dark mode' : 'Switch to light mode';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = `${toDark ? ICON_MOON : ICON_SUN}<span class="theme-toggle-text">${toDark ? 'Dark' : 'Light'}</span>`;
  };
  const onClick = () => { toggleTheme(); };
  btn.addEventListener('click', onClick);
  window.addEventListener('kairo:themechange', render);
  render();
  el.appendChild(btn);
  return () => {
    btn.removeEventListener('click', onClick);
    window.removeEventListener('kairo:themechange', render);
    btn.remove();
  };
}

// "Light | Dark" segmented control for Profile settings.
export function mountThemeSegmented(el) {
  const wrap = document.createElement('div');
  wrap.className = 'theme-seg';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', 'Theme');
  wrap.innerHTML = THEMES.map((t) => `<button type="button" class="theme-seg-opt" role="radio" data-theme-opt="${t}">${t === 'light' ? 'Light' : 'Dark'}</button>`).join('');
  const render = () => {
    const cur = getTheme();
    wrap.querySelectorAll('.theme-seg-opt').forEach((b) => {
      const on = b.dataset.themeOpt === cur;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
  };
  const onClick = (e) => {
    const b = e.target.closest('.theme-seg-opt');
    if (b) setTheme(b.dataset.themeOpt);
  };
  const onKey = (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    const next = getTheme() === 'light' ? 'dark' : 'light';
    setTheme(next);
    wrap.querySelector(`[data-theme-opt="${next}"]`)?.focus();
  };
  wrap.addEventListener('click', onClick);
  wrap.addEventListener('keydown', onKey);
  window.addEventListener('kairo:themechange', render);
  render();
  el.appendChild(wrap);
  return () => {
    window.removeEventListener('kairo:themechange', render);
    wrap.remove();
  };
}

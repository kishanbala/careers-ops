// Classic script (no module, no imports). Loaded first in <head>, before the CSS, so data-theme is set
// before first paint (design-decisions §5). Keep the logic in step with resolveTheme() in theme.js.
(function () {
  var theme = 'light';
  try {
    var saved = null;
    try {
      var raw = localStorage.getItem('co_theme');
      saved = raw === null ? null : JSON.parse(raw);
    } catch (e) { saved = null; }
    if (saved === 'light' || saved === 'dark') theme = saved;
    else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  } catch (e) { /* fall back to light */ }
  document.documentElement.setAttribute('data-theme', theme);
})();
